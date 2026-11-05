import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  type DragStartEvent,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  boardGroupable,
  type DatabaseRowData,
  groupKeyId,
  groupRows,
  newId,
  newProperty,
  nextOptionColor,
  OPTION_COLOR_LABELS,
  OPTION_COLORS,
  positionBetween,
  type Property,
  type PropertyOption,
  type PropertyWithOptions,
  type RowGroup,
} from '@nonotion/shared'
import { Ellipsis, Eye, EyeOff, Palette, Pencil, Plus, Trash } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { displayTitle } from '@/features/pages/displayTitle'
import { PageGlyph } from '@/features/pages/PageGlyph'
import type { RowPatch } from '@/lib/api/databases'
import { cn } from '@/lib/utils'
import { filledProperties, visibleColumns } from './columns'
import { NewItemInput } from './NewItemInput'
import { OptionPill, PropertyValueView } from './propertyDisplay'
import { usePropertyMutation, useUpdateRow, useUpdateViewConfig } from './queries'
import { MouseOnlyPointerSensor } from './sensors'
import { type Completion, useCompletion } from './completion'
import type { ViewBodyProps } from './viewTypes'

/** Une carte en cours de glisser : la ligne et la colonne d'où elle part. */
type CardData = { row: DatabaseRowData; from: string | null }
/** Où la carte tomberait : la colonne (son identifiant de section) et la place dans la colonne. */
type Drop = { column: string; index: number }

const columnId = (key: string | null) => `column:${groupKeyId(key)}`

// Le pointeur décide de la colonne ; à défaut (doigt hors de toute colonne), le recouvrement.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : rectIntersection(args)
}

/**
 * Vue Board (spec 6.11) : une colonne par valeur du regroupement (par défaut le Statut). Glisser
 * une carte vers une autre colonne change la propriété ; dans une colonne, elle change de place
 * (fractional indexing). Mise à jour optimiste : la carte est à sa nouvelle place tout de suite.
 */
export function BoardView(props: ViewBodyProps) {
  const property = boardGroupable(props.database.schema).find(
    (item) => item.id === props.view.config.group_by?.property,
  )
  return property ? <Board {...props} property={property} /> : <BoardSetup {...props} />
}

/** Un Board sans regroupement : on choisit la propriété des colonnes, ou on crée un Statut. */
function BoardSetup({ database, view }: ViewBodyProps) {
  const updateConfig = useUpdateViewConfig(database.id)
  const properties = usePropertyMutation(database.id)
  const choices = boardGroupable(database.schema)
  const groupBy = (property: Property) =>
    updateConfig(view, { ...view.config, group_by: { property: property.id } })

  return (
    <div className="border-t border-border py-6 text-sm text-muted-foreground">
      <p className="mb-2">Un Board range les éléments en colonnes, selon une propriété.</p>
      <div className="flex flex-wrap gap-2">
        {choices.map((property) => (
          <button
            key={property.id}
            type="button"
            onClick={() => groupBy(property)}
            className="rounded-md border border-border px-2.5 py-1 text-foreground hover:bg-accent"
          >
            Colonnes par {property.name}
          </button>
        ))}
        {choices.length === 0 && (
          <button
            type="button"
            onClick={async () => {
              const status = newProperty(database.schema, 'status')
              await properties.mutateAsync({ kind: 'add', property: status })
              groupBy(status)
            }}
            className="rounded-md border border-border px-2.5 py-1 text-foreground hover:bg-accent"
          >
            Ajouter un Statut
          </button>
        )}
      </div>
    </div>
  )
}

function Board({
  database,
  view,
  rows,
  onOpenRow,
  inherited,
  property,
}: ViewBodyProps & { property: PropertyWithOptions }) {
  const config = view.config
  const groupBy = config.group_by!
  const updateRow = useUpdateRow(database.id)
  const updateConfig = useUpdateViewConfig(database.id)
  const properties = usePropertyMutation(database.id)
  const completion = useCompletion(database)
  const [dragging, setDragging] = useState<CardData | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const [draft, setDraft] = useState<{ column: string; at: 'top' | 'bottom' } | null>(null)
  const columnEls = useRef(new Map<string, HTMLElement>())
  // Vrai juste après un glisser : le relâcher ne doit pas ouvrir la carte.
  const justDragged = useRef(false)

  const sensors = useSensors(
    useSensor(MouseOnlyPointerSensor, { activationConstraint: { distance: 4 } }),
    // Au doigt, appui long : un glisser rapide fait défiler le Board.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  )

  const hidden = new Set(groupBy.hidden ?? [])
  // « Sans Statut » est toujours là (masquable), même vide : on peut y déposer une carte.
  const all =
    groupRows(rows, database.schema, { property: property.id }, { alwaysShowEmpty: true }) ?? []
  const columns = all.filter(
    (group) =>
      !hidden.has(groupKeyId(group.key)) && !(groupBy.hide_empty && group.rows.length === 0),
  )
  const hiddenColumns = all.filter((group) => hidden.has(groupKeyId(group.key)))
  const cardProperties = visibleColumns(database.schema, config).filter(
    (item) => item.id !== property.id,
  )
  // Avec un tri, l'ordre vient du tri : glisser ne change que la colonne.
  const manualOrder = (config.sorts ?? []).length === 0

  const setHidden = (ids: string[]) =>
    updateConfig(view, { ...config, group_by: { ...groupBy, hidden: ids } })
  const setOptions = (options: PropertyOption[]) =>
    properties.mutate({ kind: 'update', property: { ...property, options } as Property })

  /** La valeur après avoir changé de colonne ; une sélection multiple échange une option. */
  const movedValue = (row: DatabaseRowData, from: string | null, to: string | null): unknown => {
    if (property.type !== 'multi_select') return to
    const current = row.properties[property.id]
    const kept = (Array.isArray(current) ? (current as string[]) : []).filter((id) => id !== from)
    return to === null || kept.includes(to) ? kept : [...kept, to]
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    setDragging(active.data.current as CardData)
  }

  /** La colonne sous le pointeur, et la place entre ses cartes selon le milieu de la carte glissée. */
  const dropFor = ({ active, over }: DragMoveEvent | DragEndEvent): Drop | null => {
    const column = over ? String(over.id) : null
    const element = column ? columnEls.current.get(column) : undefined
    const rect = active.rect.current.translated
    if (!column || !element || !rect) return null
    const { row } = active.data.current as CardData
    const middle = rect.top + rect.height / 2
    const cards = [...element.querySelectorAll<HTMLElement>('[data-card-id]')].filter(
      (card) => card.dataset.cardId !== row.id,
    )
    const index = cards.findIndex((card) => {
      const box = card.getBoundingClientRect()
      return middle < box.top + box.height / 2
    })
    return { column, index: index === -1 ? cards.length : index }
  }

  const onDragMove = (event: DragMoveEvent) => {
    const next = dropFor(event)
    setDrop((current) =>
      current?.column === next?.column && current?.index === next?.index ? current : next,
    )
  }

  const endDrag = () => {
    setDragging(null)
    setDrop(null)
    justDragged.current = true
    setTimeout(() => {
      justDragged.current = false
    }, 300)
  }

  const onDragEnd = (event: DragEndEvent) => {
    // Recalculé ici : au doigt, on lâche parfois avant que le dernier déplacement soit affiché.
    const target = dropFor(event)
    const { active } = event
    endDrag()
    const group = target && columns.find((item) => columnId(item.key) === target.column)
    if (!target || !group) return
    const { row, from } = active.data.current as CardData
    const sameColumn = columnId(from) === target.column
    const others = group.rows.filter((item) => item.id !== row.id)
    const patch: RowPatch = {}
    if (!sameColumn) patch.properties = { [property.id]: movedValue(row, from, group.key) }
    const moved = !sameColumn || group.rows.findIndex((item) => item.id === row.id) !== target.index
    if (manualOrder && moved)
      patch.position = positionBetween(
        others[target.index - 1]?.position ?? null,
        others[target.index]?.position ?? null,
      )
    if (patch.properties || patch.position) updateRow.mutate({ rowId: row.id, patch })
  }

  const open = (rowId: string) => {
    if (!justDragged.current) onOpenRow(rowId)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
    >
      <div
        role="list"
        aria-label={database.title || 'Base sans titre'}
        className="flex items-start gap-3 overflow-x-auto border-t border-border pt-3 pb-4"
      >
        {columns.map((group) => {
          const id = columnId(group.key)
          const top = draft?.column === id && draft.at === 'top'
          return (
            <BoardColumn
              key={id}
              id={id}
              group={group}
              property={property}
              register={(element) => {
                if (element) columnEls.current.set(id, element)
                else columnEls.current.delete(id)
              }}
              onAdd={() => setDraft({ column: id, at: 'top' })}
              onHide={() => setHidden([...hidden, groupKeyId(group.key)])}
              onOptions={setOptions}
            >
              {top && (
                <NewItemInput
                  databaseId={database.id}
                  open
                  onOpen={() => {}}
                  onClose={() => setDraft(null)}
                  values={() => inherited(group.key)}
                  position={() => positionBetween(null, group.rows[0]?.position ?? null)}
                  className="rounded-md border border-border bg-background"
                />
              )}
              <ColumnCards
                group={group}
                drop={drop?.column === id ? drop.index : null}
                dragging={dragging?.row.id ?? null}
                render={(row) => (
                  <BoardCard
                    key={row.id}
                    row={row}
                    from={group.key}
                    columnKey={id}
                    properties={cardProperties}
                    completion={completion}
                    onOpen={open}
                  />
                )}
              />
              <NewItemInput
                databaseId={database.id}
                open={draft?.column === id && draft.at === 'bottom'}
                onOpen={() => setDraft({ column: id, at: 'bottom' })}
                onClose={() => setDraft((current) => (current?.column === id ? null : current))}
                values={() => inherited(group.key)}
                label="Nouvelle page"
                className="rounded-md"
              />
            </BoardColumn>
          )
        })}
        <AddGroup
          property={property}
          onAdd={(option) => setOptions([...property.options, option])}
        />
        {hiddenColumns.length > 0 && (
          <div className="w-56 shrink-0 text-sm" aria-label="Groupes masqués" role="group">
            <p className="flex h-8 items-center px-1 text-muted-foreground">Groupes masqués</p>
            {hiddenColumns.map((group) => (
              <div key={columnId(group.key)} className="flex h-8 items-center gap-1.5 px-1">
                <ColumnLabel group={group} />
                <span className="text-muted-foreground tabular-nums">{group.rows.length}</span>
                <button
                  type="button"
                  aria-label={`Afficher ${group.label}`}
                  onClick={() =>
                    setHidden([...hidden].filter((key) => key !== groupKeyId(group.key)))
                  }
                  className="ml-auto flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
                >
                  <Eye aria-hidden className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <CardFace
            row={dragging.row}
            properties={cardProperties}
            completion={completion}
            className="rotate-1 shadow-lg"
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}

function ColumnLabel({ group }: { group: RowGroup<DatabaseRowData> }) {
  return group.key === null ? (
    <span className="truncate text-sm text-muted-foreground">{group.label}</span>
  ) : (
    <OptionPill option={{ name: group.label, color: group.color }} />
  )
}

/**
 * Une colonne : en-tête (nom coloré, compteur, « ⋯ », « + »), cartes, et « + Nouvelle page » au
 * pied. Toute la colonne reçoit les cartes, même vide.
 */
function BoardColumn({
  id,
  group,
  property,
  register,
  onAdd,
  onHide,
  onOptions,
  children,
}: {
  id: string
  group: RowGroup<DatabaseRowData>
  property: PropertyWithOptions
  register: (element: HTMLElement | null) => void
  onAdd: () => void
  onHide: () => void
  onOptions: (options: PropertyOption[]) => void
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const option = property.options.find((item) => item.id === group.key)
  const update = (patch: Partial<PropertyOption>) =>
    onOptions(
      property.options.map((item) => (item.id === option?.id ? { ...item, ...patch } : item)),
    )

  return (
    <section
      ref={(element) => {
        setNodeRef(element)
        register(element)
      }}
      role="listitem"
      aria-label={group.label}
      className={cn(
        'group/column flex w-64 shrink-0 flex-col gap-1.5 rounded-lg bg-muted/40 p-1.5',
        isOver && 'bg-accent/60',
      )}
    >
      <header className="flex h-8 items-center gap-1.5 px-1">
        {renaming && option ? (
          <input
            autoFocus
            aria-label="Nom du groupe"
            defaultValue={option.name}
            onBlur={(event) => {
              const name = event.target.value.trim().slice(0, 100)
              if (name && name !== option.name) update({ name })
              setRenaming(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') event.currentTarget.value = option.name
              if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
            }}
            className="h-7 min-w-0 flex-1 rounded-sm border border-border bg-background px-1.5 text-sm outline-none"
          />
        ) : (
          <ColumnLabel group={group} />
        )}
        <span className="text-sm text-muted-foreground tabular-nums">{group.rows.length}</span>
        <div className="ml-auto flex items-center opacity-0 transition-opacity group-hover/column:opacity-100 focus-within:opacity-100 touch:opacity-100">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Options du groupe ${group.label}`}
                className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
              >
                <Ellipsis aria-hidden className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={onHide}>
                <EyeOff aria-hidden /> Masquer le groupe
              </DropdownMenuItem>
              {option && (
                <>
                  <DropdownMenuItem onSelect={() => setRenaming(true)}>
                    <Pencil aria-hidden /> Renommer
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Palette aria-hidden /> Couleur
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup
                        value={option.color}
                        onValueChange={(color) =>
                          update({ color: color as PropertyOption['color'] })
                        }
                      >
                        {OPTION_COLORS.map((color) => (
                          <DropdownMenuRadioItem key={color} value={color}>
                            <OptionPill option={{ name: OPTION_COLOR_LABELS[color], color }} />
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                    <Trash aria-hidden /> Supprimer le groupe
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Le « + » de l'en-tête crée un élément déjà rangé dans cette colonne (spec 6.6). */}
          <button
            type="button"
            aria-label={`Nouveau dans ${group.label}`}
            onClick={onAdd}
            className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
          >
            <Plus aria-hidden className="size-4" />
          </button>
        </div>
      </header>
      {children}
      {option && (
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le groupe « {option.name} » ?</AlertDialogTitle>
              <AlertDialogDescription>
                L’option disparaît de « {property.name} ».{' '}
                {group.rows.length > 0 &&
                  `${group.rows.length} élément${group.rows.length > 1 ? 's' : ''} passe${group.rows.length > 1 ? 'nt' : ''} dans « Sans ${property.name} » ; aucun n’est supprimé.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => onOptions(property.options.filter((item) => item.id !== option.id))}
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  )
}

/** Les cartes d'une colonne, avec le trait qui montre où la carte glissée tomberait. */
function ColumnCards({
  group,
  drop,
  dragging,
  render,
}: {
  group: RowGroup<DatabaseRowData>
  drop: number | null
  dragging: string | null
  render: (row: DatabaseRowData) => React.ReactNode
}) {
  const line = <div aria-hidden className="h-0.5 rounded-full bg-[var(--accent)]" />
  let index = 0
  return (
    <>
      {group.rows.map((row) => {
        const before = row.id !== dragging && drop === index
        if (row.id !== dragging) index++
        return (
          <div key={row.id} className="flex flex-col gap-1.5">
            {before && line}
            {render(row)}
          </div>
        )
      })}
      {drop !== null && drop >= index && line}
    </>
  )
}

function BoardCard({
  row,
  from,
  columnKey,
  properties,
  completion,
  onOpen,
}: {
  row: DatabaseRowData
  from: string | null
  columnKey: string
  properties: Property[]
  completion: Completion | null
  onOpen: (rowId: string) => void
}) {
  // Une sélection multiple peut montrer la même carte dans deux colonnes : l'identifiant les distingue.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${columnKey}/${row.id}`,
    data: { row, from } satisfies CardData,
  })
  return (
    <CardFace
      ref={setNodeRef}
      row={row}
      properties={properties}
      completion={completion}
      onClick={() => onOpen(row.id)}
      className={cn(isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
      aria-roledescription="carte déplaçable"
    />
  )
}

/** Une carte : le titre, puis les propriétés visibles qui ont une valeur. */
function CardFace({
  row,
  properties,
  completion,
  className,
  ref,
  ...rest
}: {
  row: DatabaseRowData
  properties: Property[]
  completion: Completion | null
  className?: string
  ref?: React.Ref<HTMLButtonElement>
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      ref={ref}
      type="button"
      data-card-id={row.id}
      data-done={completion?.isDone(row) || undefined}
      className={cn(
        'nn-board-card flex w-full flex-col gap-1 rounded-md border border-border bg-background p-2 text-left shadow-xs select-none [-webkit-touch-callout:none] hover:bg-accent/50',
        className,
      )}
      {...rest}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
        <PageGlyph icon={row.icon} className="text-sm" />
        <span className="nn-task-title min-w-0 break-words">{displayTitle(row.title)}</span>
      </span>
      {filledProperties(row, properties).map((property) => (
        <span key={property.id} className="text-sm text-muted-foreground">
          {property.type === 'checkbox' ? (
            `✓ ${property.name}`
          ) : (
            <PropertyValueView property={property} value={row.properties[property.id]} />
          )}
        </span>
      ))}
    </button>
  )
}

/** « + Ajouter un groupe », la dernière colonne : une nouvelle option de la propriété. */
function AddGroup({
  property,
  onAdd,
}: {
  property: PropertyWithOptions
  onAdd: (option: PropertyOption) => void
}) {
  const [open, setOpen] = useState(false)
  const submit = (name: string) => {
    const clean = name.trim().slice(0, 100)
    setOpen(false)
    if (!clean || property.options.some((o) => o.name.toLowerCase() === clean.toLowerCase())) return
    onAdd({
      id: newId(),
      name: clean,
      color: nextOptionColor(property.options),
      // Un nouveau statut se range « En cours » : entre ce qui reste à faire et ce qui est fait.
      ...(property.type === 'status' ? { group: 'in_progress' as const } : {}),
    })
  }

  return (
    <div className="w-56 shrink-0">
      {open ? (
        <input
          autoFocus
          aria-label="Nom du nouveau groupe"
          placeholder="Nom du groupe"
          onBlur={(event) => submit(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Escape') event.currentTarget.value = ''
            if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
          }}
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:border-primary"
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent"
        >
          <Plus aria-hidden className="size-4" /> Ajouter un groupe
        </button>
      )}
    </div>
  )
}
