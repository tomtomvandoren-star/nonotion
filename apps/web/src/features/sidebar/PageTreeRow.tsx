import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Link } from '@tanstack/react-router'
import { ChevronRight, MoreHorizontal, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PageActionsMenu } from '@/features/pages/PageActionsMenu'
import { displayTitle } from '@/features/pages/displayTitle'
import { PageGlyph } from '@/features/pages/PageGlyph'
import { useUpdatePage } from '@/features/pages/queries'
import { useNewPage } from '@/features/pages/useNewPage'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'
import type { DropZone, TreeRow } from './tree'

export const ROW_HEIGHT = 28
const INDENT = 14

/**
 * Une ligne de l'arbre : ▸ à gauche pour déplier, et au survol « ⋯ » et « + » à droite (P2),
 * là où se trouve la souris quand on veut agir sur cette page (spec 6.1).
 */
export function PageTreeRow({
  row,
  active,
  dropIndicator,
}: {
  row: TreeRow
  active: boolean
  /** Où tombera la page en cours de glissement, si c'est sur cette ligne. */
  dropIndicator: { zone: DropZone; nested: boolean } | null
}) {
  const { page, depth, hasChildren, expanded } = row
  const setExpanded = useUi((s) => s.setExpanded)
  const newPage = useNewPage()
  const [renaming, setRenaming] = useState(false)

  const {
    setNodeRef: setDragRef,
    listeners: dragListeners,
    attributes: dragAttributes,
    isDragging,
  } = useDraggable({ id: page.id })
  const { setNodeRef: setDropRef } = useDroppable({ id: page.id })

  return (
    <div
      ref={setDropRef}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={active}
      data-page-id={page.id}
      className={cn(
        'group/row relative flex items-center gap-0.5 rounded-sm pr-1 text-sm',
        'hover:bg-accent touch:h-11',
        active && 'bg-accent font-medium',
        isDragging && 'opacity-40',
        dropIndicator?.zone === 'inside' && 'bg-primary/15 ring-1 ring-primary/50',
      )}
      style={{ height: ROW_HEIGHT, paddingLeft: 4 + depth * INDENT }}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={() => setExpanded(page.id, !expanded)}
          aria-label={expanded ? 'Replier' : 'Déplier'}
          className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent touch:size-9"
        >
          <ChevronRight
            aria-hidden
            className={cn('size-3.5 transition-transform duration-150', expanded && 'rotate-90')}
          />
        </button>
      ) : (
        <span aria-hidden className="size-5 shrink-0 touch:size-9" />
      )}

      {renaming ? (
        <RenameInput pageId={page.id} title={page.title} onDone={() => setRenaming(false)} />
      ) : (
        <Link
          ref={setDragRef}
          {...dragListeners}
          {...dragAttributes}
          // dnd-kit pose role="button" : la ligne reste un lien vers la page.
          role="link"
          // Sans cela, WebKit (Safari, vues web macOS et iOS) lance le glisser natif du lien
          // à la place de celui de dnd-kit.
          draggable={false}
          to="/p/$pageId"
          params={{ pageId: page.id }}
          aria-roledescription="page déplaçable"
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1 outline-offset-0"
        >
          <PageGlyph icon={page.icon} className="text-[15px]" />
          <span className="truncate">{displayTitle(page.title)}</span>
        </Link>
      )}

      <div
        className={cn(
          'flex shrink-0 items-center opacity-0 transition-opacity duration-100',
          'group-hover/row:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 touch:opacity-100',
        )}
      >
        <PageActionsMenu
          pageId={page.id}
          onRename={() => setRenaming(true)}
          trigger={
            <button
              type="button"
              aria-label={`Actions pour ${displayTitle(page.title)}`}
              className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent touch:size-10"
            >
              <MoreHorizontal aria-hidden className="size-4" />
            </button>
          }
        />
        <button
          type="button"
          onClick={() => newPage(page.id)}
          aria-label={`Ajouter une sous-page dans ${displayTitle(page.title)}`}
          className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent touch:size-10"
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </div>

      {dropIndicator && dropIndicator.zone !== 'inside' && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute right-1 h-0.5 rounded-full bg-primary',
            dropIndicator.zone === 'before' ? '-top-px' : '-bottom-px',
          )}
          style={{ left: 4 + (depth + (dropIndicator.nested ? 1 : 0)) * INDENT + 20 }}
        />
      )}
    </div>
  )
}

function RenameInput({
  pageId,
  title,
  onDone,
}: {
  pageId: string
  title: string
  onDone: () => void
}) {
  const updatePage = useUpdatePage()
  const [value, setValue] = useState(title)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.select()
  }, [])

  const commit = () => {
    if (value !== title) updatePage.mutate({ pageId, patch: { title: value } })
    onDone()
  }

  return (
    <input
      ref={input}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') onDone()
      }}
      aria-label="Nouveau titre"
      className="h-6 min-w-0 flex-1 rounded-sm border border-primary bg-background px-1 text-sm outline-none"
    />
  )
}
