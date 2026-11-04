import { FileStack } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  indexTree,
  isSelfOrDescendant,
  positionAtEnd,
  type TreeIndex,
} from '@/features/sidebar/tree'
import { cn } from '@/lib/utils'
import { displayTitle } from './displayTitle'
import { PageGlyph } from './PageGlyph'
import { useMovePage, useTree } from './queries'

/**
 * « Déplacer vers… » : l'alternative au glisser-déposer, utilisable au clavier (P7).
 * Les destinations impossibles (la page elle-même et ses sous-pages) ne sont pas proposées.
 */
export function MovePageDialog({
  pageId,
  open,
  onOpenChange,
}: {
  pageId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const tree = useTree()
  const movePage = useMovePage()
  const [query, setQuery] = useState('')

  const index: TreeIndex | null = useMemo(
    () => (tree.data ? indexTree(tree.data) : null),
    [tree.data],
  )
  const candidates = useMemo(() => {
    if (!index) return []
    const needle = query.trim().toLowerCase()
    return [...index.byId.values()].filter(
      (page) =>
        !isSelfOrDescendant(index, pageId, page.id) &&
        displayTitle(page.title).toLowerCase().includes(needle),
    )
  }, [index, pageId, query])

  const moveTo = (parentId: string | null) => {
    if (!index) return
    movePage.mutate({ pageId, parentId, position: positionAtEnd(index, parentId) })
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('')
        onOpenChange(next)
      }}
    >
      <DialogContent className="gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Déplacer vers…</DialogTitle>
          <DialogDescription>Choisissez la page qui contiendra celle-ci.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher une page"
          aria-label="Rechercher une page"
        />
        <ul className="max-h-72 overflow-y-auto" aria-label="Destinations">
          <li>
            <MoveTarget onSelect={() => moveTo(null)}>
              <FileStack aria-hidden className="size-4 text-muted-foreground" />
              Pages (racine)
            </MoveTarget>
          </li>
          {candidates.map((page) => (
            <li key={page.id}>
              <MoveTarget onSelect={() => moveTo(page.id)}>
                <PageGlyph icon={page.icon} />
                <span className="truncate">{displayTitle(page.title)}</span>
              </MoveTarget>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

function MoveTarget({ onSelect, children }: { onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent',
        'touch:h-11',
      )}
    >
      {children}
    </button>
  )
}
