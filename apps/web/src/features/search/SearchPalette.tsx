import type { SearchResult } from '@nonotion/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { displayTitle } from '@/features/pages/displayTitle'
import { PageGlyph } from '@/features/pages/PageGlyph'
import { useTree, useWorkspaceId } from '@/features/pages/queries'
import { searchPages } from '@/lib/api/pages'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'
import { highlight, matchesAll, searchTerms } from './highlight'

type Item = Pick<SearchResult, 'id' | 'title' | 'icon' | 'context' | 'excerpt'>

/**
 * Recherche (spec 6.12), Ctrl+K : une fenêtre centrée, le champ en haut, les pages récentes quand
 * il est vide. En tapant : les titres déjà chargés tout de suite, puis la recherche plein texte du
 * serveur. Flèches et Entrée pour ouvrir.
 */
export function SearchPalette() {
  const open = useUi((s) => s.searchOpen)
  const setOpen = useUi((s) => s.setSearchOpen)
  const picking = useUi((s) => s.searchPick !== null)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] max-h-[76dvh] -translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">{picking ? 'Lier une page' : 'Rechercher'}</DialogTitle>
        <DialogDescription className="sr-only">
          Tapez un mot du titre ou du texte d’une page ; flèches et Entrée pour l’ouvrir.
        </DialogDescription>
        {open && <PaletteBody picking={picking} onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function PaletteBody({ picking, onClose }: { picking: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const workspaceId = useWorkspaceId() ?? ''
  const tree = useTree()
  const recent = useUi((s) => s.recentPages)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const list = useRef<HTMLUListElement>(null)

  const terms = useMemo(() => searchTerms(query), [query])
  const server = useQuery({
    queryKey: ['search', workspaceId, debounced],
    queryFn: ({ signal }) => searchPages(workspaceId, debounced, signal),
    enabled: workspaceId !== '' && debounced.trim() !== '',
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })

  const items: Item[] = useMemo(() => {
    if (query.trim() === '')
      return recent.map((page) => ({ ...page, context: null, excerpt: null }))
    const titles = new Map((tree.data ?? []).map((page) => [page.id, page.title]))
    // Les titres déjà chargés : tout de suite, sans attendre le serveur.
    const local: Item[] = (tree.data ?? [])
      .filter((page) => matchesAll(page.title, terms))
      .slice(0, 8)
      .map((page) => ({
        id: page.id,
        title: page.title,
        icon: page.icon,
        context: page.parent_page_id ? (titles.get(page.parent_page_id) ?? null) : null,
        excerpt: null,
      }))
    const remote = debounced.trim() === query.trim() ? (server.data ?? []) : []
    // Le serveur connaît aussi le texte des pages : il complète (et précise l'extrait).
    const byId = new Map(remote.map((result) => [result.id, result]))
    return [
      ...local.map((item) => byId.get(item.id) ?? item),
      ...remote.filter((result) => !local.some((item) => item.id === result.id)),
    ]
  }, [query, debounced, terms, recent, tree.data, server.data])

  const choose = (item: Item | undefined) => {
    if (!item) return
    // Choisir une page à lier : on la renvoie à l'éditeur, sans quitter la page.
    const pick = useUi.getState().searchPick
    if (pick) {
      useUi.setState({ searchOpen: false, searchPick: null })
      pick({ id: item.id })
      return
    }
    onClose()
    void navigate({ to: '/p/$pageId', params: { pageId: item.id } })
  }

  const move = (delta: number) => {
    if (items.length === 0) return
    const next = (active + delta + items.length) % items.length
    setActive(next)
    list.current?.children[next]?.scrollIntoView({ block: 'nearest' })
  }

  const searching = query.trim() !== '' && (debounced !== query || server.isFetching)

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          role="combobox"
          aria-label={picking ? 'Page à lier' : 'Rechercher une page'}
          aria-expanded
          aria-controls="search-results"
          aria-activedescendant={items[active] ? `search-${items[active].id}` : undefined}
          aria-autocomplete="list"
          placeholder={picking ? 'Quelle page lier ?' : 'Rechercher une page…'}
          value={query}
          onChange={(event) => {
            const value = event.target.value
            setQuery(value)
            setActive(0)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => setDebounced(value), 200)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              move(1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              move(-1)
            } else if (event.key === 'Enter') {
              event.preventDefault()
              choose(items[active])
            }
          }}
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70 focus-visible:outline-none"
        />
        {searching && (
          <span
            aria-hidden
            className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
          />
        )}
      </div>

      <div className="min-h-0 overflow-y-auto p-1.5">
        {query.trim() === '' && (
          <p className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
            {recent.length > 0 ? 'Pages récentes' : 'Aucune page récente pour l’instant.'}
          </p>
        )}
        <ul ref={list} id="search-results" role="listbox" aria-label="Résultats">
          {items.map((item, index) => (
            <li
              key={item.id}
              id={`search-${item.id}`}
              role="option"
              aria-selected={index === active}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(item)}
              className={cn(
                'flex cursor-pointer gap-2.5 rounded-md px-2 py-1.5',
                index === active && 'bg-accent',
              )}
            >
              <PageGlyph icon={item.icon} className="mt-0.5 shrink-0 text-base" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-medium">
                    <Highlighted text={displayTitle(item.title)} terms={terms} />
                  </span>
                  {item.context && (
                    <span className="shrink-0 truncate text-xs text-muted-foreground">
                      dans {displayTitle(item.context)}
                    </span>
                  )}
                </div>
                {item.excerpt && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    <Highlighted text={item.excerpt} terms={terms} />
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        {query.trim() !== '' && !searching && items.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Aucun résultat pour « {query.trim()} ».
          </p>
        )}
      </div>
    </>
  )
}

/** Le texte, les mots cherchés surlignés. */
function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
  return highlight(text, terms).map((segment, i) =>
    segment.match ? (
      <mark key={i} className="rounded-[2px] bg-primary/20 text-inherit">
        {segment.text}
      </mark>
    ) : (
      <span key={i}>{segment.text}</span>
    ),
  )
}
