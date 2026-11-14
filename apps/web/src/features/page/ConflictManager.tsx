import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { fetchPage } from '@/lib/api/pages'
import type { PageConflict } from '@/lib/offline/outbox'
import { cn } from '@/lib/utils'
import { diffVersions } from './conflictDiff'

const BlockEditor = lazy(() => import('@/features/editor/BlockEditor'))

const COLORS = {
  added: 'rgba(34, 197, 94, 0.18)',
  changed: 'rgba(245, 158, 11, 0.2)',
  'only-server': 'rgba(59, 130, 246, 0.18)',
} as const

const noop = () => {}

/** Le surlignage des blocs qui diffèrent, par leur identifiant (BlockNote le met sur chaque bloc). */
function highlight(side: 'mine' | 'server', marks: Map<string, keyof typeof COLORS>): string {
  return [...marks]
    .map(
      ([id, mark]) =>
        `[data-conflict-side="${side}"] .bn-block[data-id="${CSS.escape(id)}"] > .bn-block-content { background: ${COLORS[mark]}; border-radius: 4px; }`,
    )
    .join('\n')
}

/**
 * Le mode « Gestion de conflit » (spec 6.16) : les deux versions de la page côte à côte (l'une sous
 * l'autre par onglets sur téléphone), en lecture seule, avec les blocs qui diffèrent surlignés, et
 * les deux mêmes choix que la fenêtre : prendre la version du serveur, ou écraser avec la sienne.
 */
export function ConflictManager({
  conflict,
  onReload,
  onOverwrite,
  onClose,
}: {
  conflict: PageConflict
  onReload: () => void
  onOverwrite: () => void
  onClose: () => void
}) {
  const server = useQuery({
    queryKey: ['conflict-server', conflict.pageId, conflict.serverVersion],
    queryFn: () => fetchPage(conflict.pageId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  const [tab, setTab] = useState<'mine' | 'server'>('mine')
  // « le contenu de « Carnet » » : le nom de la page, entre les guillemets.
  const pageName = conflict.title.match(/« (.*) »/)?.[1]
  const diff = useMemo(
    () => diffVersions(conflict.document, server.data?.content ?? null),
    [conflict.document, server.data],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const column = (side: 'mine' | 'server') => (
    <section
      aria-label={side === 'mine' ? 'Ma version' : 'Version du serveur'}
      data-conflict-side={side}
      className={cn(
        'min-h-0 flex-1 flex-col overflow-y-auto rounded-lg border border-border md:flex',
        tab === side ? 'flex' : 'hidden',
      )}
    >
      <h3 className="sticky top-0 z-10 border-b border-border bg-background px-4 py-2 text-sm font-medium">
        {side === 'mine' ? 'Ma version' : 'Version du serveur'}
      </h3>
      <div className="px-2 py-3">
        {side === 'server' && server.isPending ? (
          <p className="px-2 text-sm text-muted-foreground">Chargement de la version du serveur…</p>
        ) : side === 'server' && server.isError ? (
          <p role="alert" className="px-2 text-sm text-destructive">
            La version du serveur n’a pas pu être lue (une connexion est nécessaire).
          </p>
        ) : (
          <Suspense fallback={null}>
            <BlockEditor
              readOnly
              content={side === 'mine' ? conflict.document : (server.data?.content ?? null)}
              onChange={noop}
              onExitTop={noop}
            />
          </Suspense>
        )}
      </div>
    </section>
  )

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gestion de conflit"
      className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <style>{`${highlight('mine', diff.mine)}\n${highlight('server', diff.server)}`}</style>
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-medium">Gestion de conflit</h2>
          <p className="text-sm text-muted-foreground sm:truncate">
            Deux versions de {pageName ? `« ${pageName} »` : 'la page'} : la vôtre et celle du
            serveur.{' '}
            {diff.changes === 0
              ? 'Aucune différence de contenu.'
              : `${diff.changes} bloc${diff.changes > 1 ? 's' : ''} diffère${diff.changes > 1 ? 'nt' : ''}.`}
          </p>
          <ul className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-3 rounded-sm"
                style={{ background: COLORS.added }}
              />
              Ajouté de mon côté
            </li>
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-3 rounded-sm"
                style={{ background: COLORS.changed }}
              />
              Modifié
            </li>
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-3 rounded-sm"
                style={{ background: COLORS['only-server'] }}
              />
              Seulement sur le serveur
            </li>
          </ul>
        </div>
        <button
          type="button"
          aria-label="Revenir aux choix"
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent touch:size-11"
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>

      {/* Sur téléphone, une version à la fois. */}
      <div role="tablist" className="flex gap-1 border-b border-border px-4 py-2 md:hidden">
        {(['mine', 'server'] as const).map((side) => (
          <button
            key={side}
            type="button"
            role="tab"
            aria-selected={tab === side}
            onClick={() => setTab(side)}
            className={cn(
              'h-9 rounded-sm px-3 text-sm',
              tab === side ? 'bg-accent font-medium' : 'text-muted-foreground',
            )}
          >
            {side === 'mine' ? 'Ma version' : 'Version du serveur'}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 gap-3 p-3 md:p-4">
        {column('mine')}
        {column('server')}
      </div>

      <footer className="flex flex-col-reverse gap-2 border-t border-border bg-muted/50 px-4 py-3 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onReload}>
          Recharger (version du serveur)
        </Button>
        <Button variant="destructive" onClick={onOverwrite}>
          Écraser avec ma version
        </Button>
      </footer>
    </div>,
    document.body,
  )
}
