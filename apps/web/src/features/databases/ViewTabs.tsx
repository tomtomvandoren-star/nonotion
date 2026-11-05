import {
  type DatabaseDetail,
  defaultViewConfig,
  defaultViewName,
  VIEW_TYPE_LABELS,
  type ViewType,
} from '@nonotion/shared'
import { Ellipsis, LayoutGrid, List, type LucideIcon, Plus, Table2 } from 'lucide-react'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useViewMutation } from './queries'

const VIEW_ICONS: Partial<Record<ViewType, LucideIcon>> = {
  table: Table2,
  list: List,
  gallery: LayoutGrid,
}

/** Les types de vues disponibles ; le Board et le Calendrier arrivent avec leurs phases (4 et 5). */
const AVAILABLE_VIEW_TYPES: ViewType[] = ['table', 'list', 'gallery']

/**
 * Onglets des vues (spec 6.5), au-dessus de la base : cliquer change de vue, double-cliquer renomme,
 * « ⋯ » (ou clic droit) duplique ou supprime. Le « + » est juste après le dernier onglet : là où la
 * liste s'arrête, puisqu'on veut « une vue de plus ».
 */
export function ViewTabs({
  database,
  activeId,
  onSelect,
}: {
  database: DatabaseDetail
  activeId: string
  onSelect: (viewId: string) => void
}) {
  const views = useViewMutation(database.id)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)

  const create = async (type: ViewType) => {
    const view = await views.mutateAsync({
      kind: 'create',
      type,
      name: defaultViewName(type, database.views),
      config: defaultViewConfig(type, database.schema),
    })
    if (view) onSelect(view.id)
  }

  return (
    <div
      role="tablist"
      aria-label="Vues"
      className="flex min-w-0 items-center gap-0.5 overflow-x-auto"
    >
      {database.views.map((view) => {
        const Icon = VIEW_ICONS[view.type] ?? Table2
        const active = view.id === activeId
        if (renaming === view.id)
          return (
            <RenameInput
              key={view.id}
              initial={view.name}
              onDone={(name) => {
                setRenaming(null)
                if (name && name !== view.name)
                  views.mutate({ kind: 'rename', viewId: view.id, name })
              }}
            />
          )
        return (
          <div key={view.id} className="group/tab flex shrink-0 items-center">
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(view.id)}
              onDoubleClick={() => setRenaming(view.id)}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenuFor(view.id)
              }}
              className={cn(
                'flex h-8 items-center gap-1.5 border-b-2 px-2 text-sm',
                active
                  ? 'border-foreground font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon aria-hidden className="size-4" />
              {view.name}
            </button>
            <DropdownMenu
              modal={false}
              open={menuFor === view.id}
              onOpenChange={(open) => setMenuFor(open ? view.id : null)}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Options de la vue ${view.name}`}
                  className={cn(
                    'flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent focus-visible:opacity-100 touch:opacity-100',
                    (active || menuFor === view.id) && 'group-hover/tab:opacity-100',
                  )}
                >
                  <Ellipsis aria-hidden className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setRenaming(view.id)}>Renommer</DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async () => {
                    const copy = await views.mutateAsync({ kind: 'duplicate', viewId: view.id })
                    if (copy) onSelect(copy.id)
                  }}
                >
                  Dupliquer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={database.views.length <= 1}
                  onSelect={() => {
                    views.mutate({ kind: 'delete', viewId: view.id })
                    if (active) onSelect(database.views.find((item) => item.id !== view.id)!.id)
                  }}
                >
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Ajouter une vue"
            className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
          >
            <Plus aria-hidden className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {AVAILABLE_VIEW_TYPES.map((type) => {
            const Icon = VIEW_ICONS[type]!
            return (
              <DropdownMenuItem key={type} onSelect={() => void create(type)}>
                <Icon aria-hidden /> {VIEW_TYPE_LABELS[type]}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const [name, setName] = useState(initial)
  return (
    <input
      autoFocus
      aria-label="Nom de la vue"
      value={name}
      onChange={(event) => setName(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onDone(name.trim())
        if (event.key === 'Escape') onDone(initial)
      }}
      onBlur={() => onDone(name.trim())}
      className="h-7 w-32 shrink-0 rounded-sm border border-primary bg-background px-1.5 text-sm outline-none"
    />
  )
}
