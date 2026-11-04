import { Link } from '@tanstack/react-router'
import { SquarePen } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { displayTitle } from '@/features/pages/displayTitle'
import { PageGlyph } from '@/features/pages/PageGlyph'
import { useProfile, useTree } from '@/features/pages/queries'
import { useNewPage } from '@/features/pages/useNewPage'

const dateFormat = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'medium', timeStyle: 'short' })

/** Accueil : les pages modifiées récemment, et de quoi en créer une. */
export function HomePage() {
  const profile = useProfile()
  const tree = useTree()
  const newPage = useNewPage()
  const recent = useMemo(
    () =>
      [...(tree.data ?? [])]
        .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
        .slice(0, 8),
    [tree.data],
  )
  const firstName = profile.data?.user.name.split(' ')[0]

  return (
    <div className="mx-auto w-full max-w-[700px] px-4 pt-16 pb-24 md:px-0">
      <h1 className="text-3xl font-bold">{firstName ? `Bonjour, ${firstName}` : 'Bonjour'}</h1>

      <section aria-labelledby="home-recent" className="mt-10">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="home-recent" className="text-sm font-medium text-muted-foreground">
            Modifiées récemment
          </h2>
          <Button variant="ghost" size="sm" onClick={() => newPage(null)}>
            <SquarePen /> Nouvelle page
          </Button>
        </div>
        {tree.data && recent.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">Aucune page pour l’instant.</p>
        )}
        <ul className="divide-y divide-border border-y border-border">
          {recent.map((page) => (
            <li key={page.id}>
              <Link
                to="/p/$pageId"
                params={{ pageId: page.id }}
                className="flex items-center gap-2 px-1 py-2.5 hover:bg-accent"
              >
                <PageGlyph icon={page.icon} />
                <span className="min-w-0 flex-1 truncate">{displayTitle(page.title)}</span>
                {page.updated_at && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {dateFormat.format(new Date(page.updated_at))}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
