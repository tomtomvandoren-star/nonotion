import { Link } from '@tanstack/react-router'
import { displayTitle } from '@/features/pages/displayTitle'
import { PageGlyph } from '@/features/pages/PageGlyph'
import { usePage, useTree } from '@/features/pages/queries'

/** Le bloc lien : la page liée, avec son titre et son icône à jour. */
export function PageLink({ pageId }: { pageId: string }) {
  if (!pageId)
    return (
      <p contentEditable={false} className="py-0.5 text-muted-foreground">
        Choisissez la page à lier…
      </p>
    )
  return <LinkedPage pageId={pageId} />
}

function LinkedPage({ pageId }: { pageId: string }) {
  const tree = useTree()
  const inTree = tree.data?.find((page) => page.id === pageId)
  // Une ligne de base n'est pas dans l'arbre : on lit la page elle-même.
  const page = usePage(inTree || !tree.data ? '' : pageId)
  const target = inTree ?? page.data
  const missing = !inTree && tree.data && page.isError

  return (
    <div contentEditable={false} className="py-0.5">
      {missing ? (
        <span className="text-muted-foreground line-through">Page introuvable</span>
      ) : (
        <Link
          to="/p/$pageId"
          params={{ pageId }}
          data-page-link={pageId}
          className="inline-flex max-w-full items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-accent"
        >
          <PageGlyph icon={target?.icon ?? null} className="shrink-0 text-base" />
          <span className="truncate font-medium underline decoration-muted-foreground/40 underline-offset-4">
            {target ? displayTitle(target.title) : '…'}
          </span>
        </Link>
      )}
    </div>
  )
}
