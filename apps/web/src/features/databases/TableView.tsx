import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { type DatabaseRowData, newProperty, type Property, type RowGroup } from '@nonotion/shared'
import { ChevronRight, Maximize2, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { PageGlyph } from '@/features/pages/PageGlyph'
import { cn } from '@/lib/utils'
import { AddPropertyButton, type ColumnAction, ColumnHeader } from './ColumnHeader'
import { columnWidth, moveColumn, visibleColumns } from './columns'
import type { EditEnd } from './editors'
import { PropertyCell } from './PropertyCell'
import { NewItemInput, type NewItemProps } from './NewItemInput'
import { OptionPill } from './propertyDisplay'
import { usePropertyMutation, useUpdateRow, useUpdateViewConfig } from './queries'
import type { ViewBodyProps } from './viewTypes'

/** Glisser à la souris (le doigt passe par l'appui long du capteur tactile). */
class MouseOnlyPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent }: React.PointerEvent) =>
        nativeEvent.isPrimary && nativeEvent.button === 0 && nativeEvent.pointerType !== 'touch',
    },
  ]
}

type Editing = { rowId: string; propertyId: string } | null

/**
 * Vue Tableau (spec 6.10) : colonnes redimensionnables et réordonnables, cellules éditables sur
 * place, menu d'en-tête, « + » en bout de rangée pour ajouter une propriété, et ligne « + Nouveau »
 * pour saisir plusieurs éléments d'affilée.
 */
export function TableView({
  database,
  view,
  rows,
  groups,
  onOpenRow,
  inherited,
  onColumnAction,
}: ViewBodyProps) {
  const updateRow = useUpdateRow(database.id)
  const updateConfig = useUpdateViewConfig(database.id)
  const properties = usePropertyMutation(database.id)
  const config = view.config
  const columns = visibleColumns(database.schema, config)
  const [editing, setEditing] = useState<Editing>(null)
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({})
  const [drop, setDrop] = useState<{ id: string; side: 'before' | 'after' } | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // La ligne de saisie ouverte : dans la section de ce groupe, ou en bas du tableau (« all »).
  const [draftIn, setDraftIn] = useState<string | null>(null)
  // Vrai juste après un glisser de colonne : le relâcher ne doit pas ouvrir le menu de l'en-tête.
  const justDragged = useRef(false)

  const sensors = useSensors(
    useSensor(MouseOnlyPointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const width = (property: Property) => liveWidths[property.id] ?? columnWidth(property, config)
  const totalWidth = columns.reduce((sum, property) => sum + width(property), 0) + 40

  const saveValue = (row: DatabaseRowData, property: Property, value: unknown) =>
    updateRow.mutate({
      rowId: row.id,
      patch:
        property.type === 'title'
          ? { title: String(value ?? '') }
          : { properties: { [property.id]: value } },
    })

  /** Après une édition : Tab passe à la cellule voisine, sinon on sort de l'édition. */
  const endEdit = (orderedRows: DatabaseRowData[], end: EditEnd) => {
    if (!editing || (end !== 'next' && end !== 'prev')) {
      setEditing(null)
      return
    }
    const cells = orderedRows.flatMap((row) =>
      columns
        .filter((p) => p.type !== 'checkbox')
        .map((p) => ({ rowId: row.id, propertyId: p.id })),
    )
    const index = cells.findIndex(
      (cell) => cell.rowId === editing.rowId && cell.propertyId === editing.propertyId,
    )
    setEditing(cells[index + (end === 'next' ? 1 : -1)] ?? null)
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || over.id === active.id) return setDrop(null)
    const ids = columns.map((p) => p.id)
    setDrop({
      id: String(over.id),
      side: ids.indexOf(String(active.id)) < ids.indexOf(String(over.id)) ? 'after' : 'before',
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    justDragged.current = true
    setTimeout(() => {
      justDragged.current = false
    }, 300)
    setDrop(null)
    if (!over || over.id === active.id) return
    const ids = moveColumn(
      columns.map((p) => p.id),
      String(active.id),
      String(over.id),
    )
    updateConfig(view, { ...config, visible_properties: ids })
  }

  const renderRow = (row: DatabaseRowData, orderedRows: DatabaseRowData[]) => (
    <tr key={row.id} data-row-id={row.id} className="group/row hover:bg-accent/40">
      {columns.map((property) => {
        const isEditing = editing?.rowId === row.id && editing.propertyId === property.id
        const value = property.type === 'title' ? row.title : row.properties[property.id]
        const cell = (
          <PropertyCell
            database={database}
            property={property}
            value={value}
            editing={isEditing}
            onStartEdit={() => setEditing({ rowId: row.id, propertyId: property.id })}
            onEndEdit={(end) => endEdit(orderedRows, end)}
            onChange={(next) => saveValue(row, property, next)}
            className={property.type === 'checkbox' ? 'px-2' : undefined}
          />
        )
        return (
          <td
            key={property.id}
            style={{ width: width(property), maxWidth: width(property) }}
            className="h-8 border-r border-b border-border p-0 align-middle text-sm"
          >
            {property.type === 'title' ? (
              <div className="flex h-full items-center">
                {row.icon && <PageGlyph icon={row.icon} className="ml-2 text-sm" />}
                <div className="min-w-0 flex-1 font-medium">{cell}</div>
                {!isEditing && (
                  // Au survol (P2), visible en permanence au doigt.
                  <button
                    type="button"
                    onClick={() => onOpenRow(row.id)}
                    aria-label={`Ouvrir ${row.title || 'Sans titre'}`}
                    className="mr-1 flex h-6 shrink-0 items-center gap-1 rounded-sm border border-border bg-background px-1.5 text-xs text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-accent focus-visible:opacity-100 touch:opacity-100"
                  >
                    <Maximize2 aria-hidden className="size-3" /> Ouvrir
                  </button>
                )}
              </div>
            ) : (
              cell
            )}
          </td>
        )
      })}
      <td className="border-b border-border" />
    </tr>
  )

  const sections: {
    group: RowGroup<DatabaseRowData> | null
    rows: DatabaseRowData[]
    key: string
  }[] = groups
    ? groups.map((group) => ({ group, rows: group.rows, key: group.key ?? '∅' }))
    : [{ group: null, rows, key: 'all' }]

  return (
    <DndContext
      sensors={sensors}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDrop(null)}
    >
      <div className="overflow-x-auto">
        <table
          aria-label={database.title || 'Base sans titre'}
          className="table-fixed border-collapse border-t border-border"
          style={{ width: totalWidth }}
        >
          <thead>
            <tr>
              {columns.map((property) => (
                <ColumnHeader
                  key={property.id}
                  database={database}
                  property={property}
                  width={width(property)}
                  dropSide={drop?.id === property.id ? drop.side : null}
                  ignoreClick={() => justDragged.current}
                  onResize={(next) =>
                    setLiveWidths((current) => ({ ...current, [property.id]: next }))
                  }
                  onResizeEnd={(next) => {
                    updateConfig(view, {
                      ...config,
                      property_widths: { ...config.property_widths, [property.id]: next },
                    })
                    setLiveWidths((current) => {
                      const rest = { ...current }
                      delete rest[property.id]
                      return rest
                    })
                  }}
                  onAction={(action: ColumnAction) => onColumnAction(property, action)}
                />
              ))}
              <th className="w-10 border-b border-border p-0">
                <AddPropertyButton
                  onAdd={(type, name) =>
                    properties.mutate({
                      kind: 'add',
                      property: newProperty(database.schema, type, name),
                    })
                  }
                  className="flex h-8 w-10 items-center justify-center text-muted-foreground hover:bg-accent"
                />
              </th>
            </tr>
          </thead>
          {sections.map(({ group, rows: sectionRows, key }) => {
            const isCollapsed = collapsed.has(key)
            return (
              <tbody key={key}>
                {group && (
                  <tr>
                    <td colSpan={columns.length + 1} className="border-b border-border p-0">
                      <div className="group/section flex h-9 items-center gap-1.5 px-1">
                        <button
                          type="button"
                          aria-expanded={!isCollapsed}
                          aria-label={`${isCollapsed ? 'Déplier' : 'Replier'} ${group.label}`}
                          onClick={() =>
                            setCollapsed((current) => {
                              const next = new Set(current)
                              if (next.has(key)) next.delete(key)
                              else next.add(key)
                              return next
                            })
                          }
                          className="flex size-6 items-center justify-center rounded-sm hover:bg-accent"
                        >
                          <ChevronRight
                            aria-hidden
                            className={cn(
                              'size-4 transition-transform',
                              !isCollapsed && 'rotate-90',
                            )}
                          />
                        </button>
                        {group.key === null ? (
                          <span className="text-sm text-muted-foreground">{group.label}</span>
                        ) : (
                          <OptionPill option={{ name: group.label, color: group.color }} />
                        )}
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {group.rows.length}
                        </span>
                        {/* Le « + » d'une section crée un élément déjà rangé dedans (spec 6.6). */}
                        <button
                          type="button"
                          aria-label={`Nouveau dans ${group.label}`}
                          onClick={() => {
                            setCollapsed((current) => {
                              const next = new Set(current)
                              next.delete(key)
                              return next
                            })
                            setDraftIn(key)
                          }}
                          className="flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover/section:opacity-100 hover:bg-accent focus-visible:opacity-100 touch:opacity-100"
                        >
                          <Plus aria-hidden className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {!isCollapsed && sectionRows.map((row) => renderRow(row, sectionRows))}
                {!isCollapsed && (
                  <DraftRow
                    databaseId={database.id}
                    colSpan={columns.length + 1}
                    open={draftIn === key}
                    onOpen={() => setDraftIn(key)}
                    onClose={() => setDraftIn((current) => (current === key ? null : current))}
                    values={() => inherited(group ? group.key : undefined)}
                  />
                )}
              </tbody>
            )
          })}
        </table>
      </div>
    </DndContext>
  )
}

/** Ligne « + Nouveau » en bas du tableau, ou d'une section. */
function DraftRow({ colSpan, ...props }: NewItemProps & { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className={cn('p-0', props.open && 'border-b border-border')}>
        <NewItemInput {...props} />
      </td>
    </tr>
  )
}
