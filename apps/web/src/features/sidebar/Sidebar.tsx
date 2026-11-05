import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ChevronsLeft,
  Download,
  Home,
  Keyboard,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Search,
  SquarePen,
  Sun,
  Trash2,
} from 'lucide-react'
import { useMemo, useRef } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { displayTitle } from '@/features/pages/displayTitle'
import { PageGlyph } from '@/features/pages/PageGlyph'
import { useProfile, useTree } from '@/features/pages/queries'
import { useNewPage } from '@/features/pages/useNewPage'
import { logout } from '@/lib/api/auth'
import { endSession } from '@/lib/session'
import { shortcutLabel } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { platform } from '@/platform'
import { SIDEBAR_MAX, SIDEBAR_MIN, type Theme, useUi } from '@/stores/ui'
import { PageTree } from './PageTree'
import { TrashPanel } from './TrashPanel'

/**
 * La carte du territoire (spec 6.1), toujours à gauche : espace de travail, Accueil,
 * Nouvelle page, Favoris, l'arbre des pages, et la corbeille en bas.
 */
export function Sidebar() {
  const width = useUi((s) => s.sidebarWidth)
  const setOpen = useUi((s) => s.setSidebarOpen)
  const tree = useTree()
  const newPage = useNewPage()
  const setSearchOpen = useUi((s) => s.setSearchOpen)
  const favorites = useMemo(() => tree.data?.filter((page) => page.is_favorite) ?? [], [tree.data])

  return (
    <aside
      aria-label="Barre latérale"
      className={cn(
        'relative flex h-dvh shrink-0 flex-col bg-sidebar text-sm',
        // Sous 768 px, la barre latérale devient un tiroir au-dessus du contenu.
        'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-xl',
      )}
      style={{ width }}
    >
      <div className="flex items-center gap-1 px-2 pt-2 pb-1">
        <WorkspaceMenu />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Masquer la barre latérale"
              className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent touch:size-10"
            >
              <ChevronsLeft aria-hidden className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Masquer ({shortcutLabel('\\')})</TooltipContent>
        </Tooltip>
      </div>

      <nav className="flex flex-col px-2 pb-2" aria-label="Navigation">
        {/* La recherche, en tête (spec 6.1) : au doigt aussi, sans Ctrl+K. */}
        <button type="button" onClick={() => setSearchOpen(true)} className={sidebarItemClass}>
          <Search aria-hidden className="size-4 text-muted-foreground" />
          Rechercher
          <kbd className="ml-auto font-sans text-xs text-muted-foreground touch:hidden">
            {shortcutLabel('k')}
          </kbd>
        </button>
        <SidebarLink icon={<Home aria-hidden className="size-4" />} label="Accueil" />
        <button type="button" onClick={() => newPage(null)} className={sidebarItemClass}>
          <SquarePen aria-hidden className="size-4 text-muted-foreground" />
          Nouvelle page
        </button>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {favorites.length > 0 && (
          <section aria-labelledby="sidebar-favorites" className="mb-3">
            <h2
              id="sidebar-favorites"
              className="px-2 pb-1 text-xs font-medium text-muted-foreground"
            >
              Favoris
            </h2>
            <ul>
              {favorites.map((page) => (
                <li key={page.id}>
                  <SidebarLink
                    pageId={page.id}
                    icon={<PageGlyph icon={page.icon} />}
                    label={displayTitle(page.title)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="sidebar-pages">
          <div className="group/section flex items-center pr-1">
            <h2
              id="sidebar-pages"
              className="flex-1 px-2 pb-1 text-xs font-medium text-muted-foreground"
            >
              Pages
            </h2>
            <button
              type="button"
              onClick={() => newPage(null)}
              aria-label="Ajouter une page"
              className="flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 group-hover/section:opacity-100 focus-visible:opacity-100 hover:bg-accent touch:size-10 touch:opacity-100"
            >
              <Plus aria-hidden className="size-4" />
            </button>
          </div>
          {tree.data && <PageTree pages={tree.data} />}
          {tree.isError && (
            <p className="px-2 text-xs text-destructive">Impossible de charger les pages.</p>
          )}
        </section>
      </div>

      <div className="border-t border-border/60 px-2 py-2">
        <TrashPanel
          trigger={
            <button type="button" className={sidebarItemClass}>
              <Trash2 aria-hidden className="size-4 text-muted-foreground" />
              Corbeille
            </button>
          }
        />
      </div>

      <ResizeHandle />
    </aside>
  )
}

const sidebarItemClass =
  'flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-accent touch:h-11'

/** Lien de la barre latérale : vers l'Accueil, ou vers une page si `pageId` est donné. */
function SidebarLink({
  pageId,
  icon,
  label,
}: {
  pageId?: string
  icon: React.ReactNode
  label: string
}) {
  const content = (
    <>
      <span className="flex size-4 items-center justify-center text-muted-foreground">{icon}</span>
      <span className="truncate">{label}</span>
    </>
  )
  const activeProps = { className: 'bg-accent font-medium' }

  return pageId ? (
    <Link
      to="/p/$pageId"
      params={{ pageId }}
      className={sidebarItemClass}
      activeProps={activeProps}
    >
      {content}
    </Link>
  ) : (
    <Link
      to="/"
      className={sidebarItemClass}
      activeOptions={{ exact: true }}
      activeProps={activeProps}
    >
      {content}
    </Link>
  )
}

/** Les installateurs Windows, macOS et Linux de la dernière version publiée (phase 8). */
const DESKTOP_DOWNLOADS_URL =
  import.meta.env.VITE_DESKTOP_DOWNLOADS_URL ??
  'https://github.com/tomtomvandoren-star/nonotion/releases/latest'

function WorkspaceMenu() {
  const profile = useProfile()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const workspace = profile.data?.workspaces[0]
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen)
  const initial = (workspace?.name.replace(/^Espace de /, '') ?? '?').charAt(0).toUpperCase()

  const signOut = async () => {
    await logout().catch(() => undefined)
    await endSession()
    queryClient.clear()
    void navigate({ to: '/login' })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left font-medium hover:bg-accent touch:h-11"
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary text-xs text-primary-foreground">
            {initial}
          </span>
          <span className="truncate">{workspace?.name ?? 'Nonotion'}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {profile.data?.user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === 'dark' ? <Moon /> : theme === 'light' ? <Sun /> : <Monitor />} Thème
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value) => setTheme(value as Theme)}
            >
              <DropdownMenuRadioItem value="system">Comme le système</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light">Clair</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Sombre</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
          <Keyboard /> Raccourcis clavier
          <span className="ml-auto text-xs text-muted-foreground">{shortcutLabel('/')}</span>
        </DropdownMenuItem>
        {platform.kind === 'web' && (
          <DropdownMenuItem onSelect={() => void platform.openExternal(DESKTOP_DOWNLOADS_URL)}>
            <Download /> Application pour ordinateur
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Bord droit de la barre latérale : la faire glisser change sa largeur (200 à 400 px). */
function ResizeHandle() {
  const width = useUi((s) => s.sidebarWidth)
  const setWidth = useUi((s) => s.setSidebarWidth)
  const start = useRef<{ x: number; width: number } | null>(null)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionner la barre latérale"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') setWidth(width - 16)
        if (event.key === 'ArrowRight') setWidth(width + 16)
      }}
      onPointerDown={(event) => {
        start.current = { x: event.clientX, width }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (start.current) setWidth(start.current.width + event.clientX - start.current.x)
      }}
      onPointerUp={() => {
        start.current = null
      }}
      className="absolute inset-y-0 -right-1 w-2 cursor-col-resize after:absolute after:inset-y-0 after:right-1 after:w-px after:bg-border hover:after:w-0.5 hover:after:bg-primary/60 max-md:hidden"
    />
  )
}
