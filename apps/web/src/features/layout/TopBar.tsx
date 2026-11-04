import { Link, useParams, useRouter } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Menu, MoreHorizontal } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageActionsMenu } from '@/features/pages/PageActionsMenu'
import { displayTitle } from '@/features/pages/displayTitle'
import { PageGlyph } from '@/features/pages/PageGlyph'
import { useTree } from '@/features/pages/queries'
import { indexTree, pathTo } from '@/features/sidebar/tree'
import { shortcutLabel } from '@/lib/shortcuts'
import { useUi } from '@/stores/ui'
import { SaveIndicator } from './SaveIndicator'

const iconButton =
  'flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground touch:size-10'

/**
 * Barre du haut (spec 5) : navigation à gauche (☰, ‹ ›, fil d'Ariane), et à droite ce que
 * l'on peut faire de la page, là où l'œil va le chercher.
 */
export function TopBar() {
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const pageId = useParams({ strict: false }).pageId
  const router = useRouter()

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 px-2">
      {!sidebarOpen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Afficher la barre latérale"
              className={iconButton}
            >
              <Menu aria-hidden className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Afficher ({shortcutLabel('\\')})</TooltipContent>
        </Tooltip>
      )}
      <button
        type="button"
        onClick={() => router.history.back()}
        aria-label="Page précédente"
        className={iconButton}
      >
        <ChevronLeft aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => router.history.forward()}
        aria-label="Page suivante"
        className={iconButton}
      >
        <ChevronRight aria-hidden className="size-4" />
      </button>

      {pageId && <Breadcrumb pageId={pageId} />}

      <div className="ml-auto flex items-center gap-2 pl-2">
        <SaveIndicator />
        {pageId && (
          <PageActionsMenu
            pageId={pageId}
            align="end"
            trigger={
              <button type="button" aria-label="Actions de la page" className={iconButton}>
                <MoreHorizontal aria-hidden className="size-4" />
              </button>
            }
          />
        )}
      </div>
    </header>
  )
}

/** Fil d'Ariane : les pages parentes, chacune cliquable ; le titre suit les modifications en direct. */
function Breadcrumb({ pageId }: { pageId: string }) {
  const tree = useTree()
  const path = useMemo(
    () => (tree.data ? pathTo(indexTree(tree.data), pageId) : []),
    [tree.data, pageId],
  )
  // Au-delà de trois niveaux, les niveaux intermédiaires sont résumés par « … ».
  const shown = path.length > 3 ? [path[0], null, ...path.slice(-2)] : path

  return (
    <nav aria-label="Fil d’Ariane" className="min-w-0 overflow-hidden">
      <ol className="flex min-w-0 items-center gap-0.5 text-sm">
        {shown.map((page, i) => (
          <Fragment key={page?.id ?? 'ellipsis'}>
            {i > 0 && (
              <li aria-hidden className="text-muted-foreground/60">
                /
              </li>
            )}
            <li className="min-w-0">
              {page ? (
                <Link
                  to="/p/$pageId"
                  params={{ pageId: page.id }}
                  className="flex min-w-0 items-center gap-1 rounded-sm px-1.5 py-0.5 hover:bg-accent"
                  aria-current={page.id === pageId ? 'page' : undefined}
                >
                  <PageGlyph icon={page.icon} className="text-sm" />
                  <span className="max-w-40 truncate">{displayTitle(page.title)}</span>
                </Link>
              ) : (
                <span className="px-1 text-muted-foreground">…</span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
