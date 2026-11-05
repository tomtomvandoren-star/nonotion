import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  type DatabaseDetail,
  type Property,
  PROPERTY_TYPE_LABELS,
  type PropertyType,
} from '@nonotion/shared'
import { ArrowDown, ArrowUp, EyeOff, ListFilter, Plus, Trash } from 'lucide-react'
import { useState } from 'react'
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { MIN_COLUMN_WIDTH } from './columns'
import { PropertyIcon } from './propertyDisplay'
import { usePropertyMutation } from './queries'
import { retyped } from './retyped'

export type ColumnAction =
  { kind: 'sort'; direction: 'asc' | 'desc' } | { kind: 'filter' } | { kind: 'hide' }

const CHOOSABLE_TYPES = Object.keys(PROPERTY_TYPE_LABELS) as Exclude<PropertyType, 'title'>[]

/**
 * En-tête de colonne (spec 6.10) : clic = menu (trier, filtrer, masquer, renommer, changer de type,
 * supprimer), glisser = déplacer la colonne, bord droit = largeur.
 */
export function ColumnHeader({
  database,
  property,
  width,
  dropSide,
  onResize,
  onResizeEnd,
  onAction,
  ignoreClick,
}: {
  database: DatabaseDetail
  property: Property
  width: number
  /** Ligne qui montre où la colonne glissée va tomber (P4). */
  dropSide: 'before' | 'after' | null
  onResize: (width: number) => void
  onResizeEnd: (width: number) => void
  onAction: (action: ColumnAction) => void
  /** Vrai juste après un glisser : le relâcher ne doit pas ouvrir le menu. */
  ignoreClick: () => boolean
}) {
  const properties = usePropertyMutation(database.id)
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState(property.name)
  const isTitle = property.type === 'title'

  const {
    setNodeRef: setDragRef,
    listeners,
    attributes,
    isDragging,
  } = useDraggable({
    id: property.id,
  })
  const { setNodeRef: setDropRef } = useDroppable({ id: property.id })

  const rename = () => {
    const next = name.trim()
    if (next !== '' && next !== property.name)
      properties.mutate({ kind: 'update', property: { ...property, name: next } })
    else setName(property.name)
  }

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    let current = width
    const move = (e: PointerEvent) => {
      current = Math.max(MIN_COLUMN_WIDTH, Math.round(width + e.clientX - startX))
      onResize(current)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onResizeEnd(current)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <th
      ref={setDropRef}
      scope="col"
      style={{ width, minWidth: width, maxWidth: width }}
      className={cn(
        'relative h-8 border-r border-b border-border p-0 text-left font-normal',
        isDragging && 'opacity-50',
      )}
    >
      {dropSide && (
        <span
          aria-hidden
          className={cn(
            'absolute top-0 bottom-0 z-10 w-0.5 bg-primary',
            dropSide === 'before' ? '-left-px' : '-right-px',
          )}
        />
      )}
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            ref={setDragRef}
            type="button"
            {...attributes}
            {...listeners}
            // Le menu s'ouvre au clic (pas à l'appui) : appuyer puis glisser déplace la colonne.
            onPointerDown={(event) => {
              listeners?.onPointerDown?.(event)
              event.preventDefault()
            }}
            onClick={() => {
              if (!ignoreClick()) setOpen((value) => !value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
                event.preventDefault()
                setOpen(true)
              } else listeners?.onKeyDown?.(event)
            }}
            aria-label={`Colonne ${property.name}`}
            className="flex h-8 w-full min-w-0 items-center gap-1.5 px-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <PropertyIcon type={property.type} />
            <span className="truncate">{property.name}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <div className="p-1">
            <input
              aria-label="Nom de la propriété"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') {
                  rename()
                  setOpen(false)
                }
              }}
              onBlur={rename}
              className="h-8 w-full rounded-sm border border-border bg-background px-2 text-sm outline-none focus-visible:border-primary"
            />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onAction({ kind: 'sort', direction: 'asc' })}>
            <ArrowUp aria-hidden /> Trier par ordre croissant
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAction({ kind: 'sort', direction: 'desc' })}>
            <ArrowDown aria-hidden /> Trier par ordre décroissant
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAction({ kind: 'filter' })}>
            <ListFilter aria-hidden /> Filtrer
          </DropdownMenuItem>
          {!isTitle && (
            <>
              <DropdownMenuItem onSelect={() => onAction({ kind: 'hide' })}>
                <EyeOff aria-hidden /> Masquer
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <PropertyIcon type={property.type} className="text-current" /> Type :{' '}
                  {PROPERTY_TYPE_LABELS[property.type as Exclude<PropertyType, 'title'>]}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {CHOOSABLE_TYPES.map((type) => (
                    <DropdownMenuItem
                      key={type}
                      disabled={type === property.type}
                      onSelect={() =>
                        properties.mutate({ kind: 'update', property: retyped(property, type) })
                      }
                    >
                      <PropertyIcon type={type} className="text-current" />{' '}
                      {PROPERTY_TYPE_LABELS[type]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash aria-hidden /> Supprimer la propriété
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Largeur de la colonne ${property.name}`}
        onPointerDown={startResize}
        onMouseDown={(event) => event.stopPropagation()}
        className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize hover:bg-primary/30"
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la propriété « {property.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ses valeurs disparaissent de toutes les lignes de la base.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => properties.mutate({ kind: 'delete', propertyId: property.id })}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </th>
  )
}

/**
 * Le « + » au bout de la rangée des colonnes (spec 6.10) : là où l'on irait naturellement en
 * ajouter une de plus.
 */
export function AddPropertyButton({
  onAdd,
  className,
  label = 'Ajouter une propriété',
  children,
}: {
  onAdd: (type: Exclude<PropertyType, 'title'>, name: string) => void
  className?: string
  label?: string
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) setName('')
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className={className}>
          {children ?? <Plus aria-hidden className="size-4" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1">
        <input
          autoFocus
          aria-label="Nom de la nouvelle propriété"
          placeholder="Nom de la propriété"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mb-1 h-8 w-full rounded-sm border border-border bg-background px-2 text-sm outline-none focus-visible:border-primary"
        />
        <div className="px-2 py-1 text-xs text-muted-foreground">Type</div>
        <ul>
          {CHOOSABLE_TYPES.map((type) => (
            <li key={type}>
              <button
                type="button"
                onClick={() => {
                  onAdd(type, name)
                  setOpen(false)
                  setName('')
                }}
                className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-sm hover:bg-accent"
              >
                <PropertyIcon type={type} className="text-current" /> {PROPERTY_TYPE_LABELS[type]}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
