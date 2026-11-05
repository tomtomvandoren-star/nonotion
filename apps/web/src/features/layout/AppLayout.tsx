import { Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useNewPage } from '@/features/pages/useNewPage'
import { SearchPalette } from '@/features/search/SearchPalette'
import { Sidebar } from '@/features/sidebar/Sidebar'
import { isModPressed } from '@/lib/shortcuts'
import { useUi } from '@/stores/ui'
import { ShortcutsDialog } from './ShortcutsDialog'
import { TopBar } from './TopBar'

/**
 * Disposition générale (spec 5) : barre latérale à gauche, stable ; à droite la barre du haut
 * puis le canevas, où le contenu est centré dans une colonne étroite.
 */
export function AppLayout() {
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const setSidebarOpen = useUi((s) => s.setSidebarOpen)
  useGlobalShortcuts()
  useTheme()

  return (
    <div className="flex h-dvh overflow-hidden pt-[env(safe-area-inset-top)]">
      {sidebarOpen && (
        <>
          <Sidebar />
          {/* Sur petit écran, toucher le contenu referme le tiroir. */}
          <button
            type="button"
            aria-label="Fermer la barre latérale"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/20 md:hidden"
          />
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <Outlet />
        </main>
      </div>
      <SearchPalette />
      <ShortcutsDialog />
    </div>
  )
}

/** Le thème choisi (spec 7) : « data-theme » sur <html> ; sans choix, celui du système. */
function useTheme() {
  const theme = useUi((s) => s.theme)
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }, [theme])
}

/**
 * Raccourcis de l'application (spec 6.14) : Ctrl+K recherche, Ctrl+N crée une page, Ctrl+\
 * masque la barre latérale, Ctrl+/ ouvre l'aide. Écoutés avant l'éditeur (phase de capture) :
 * Ctrl+K y servirait sinon à créer un lien.
 */
function useGlobalShortcuts() {
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const setSearchOpen = useUi((s) => s.setSearchOpen)
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen)
  const newPage = useNewPage()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isModPressed(event) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'k' && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        setSearchOpen(!useUi.getState().searchOpen)
      } else if (key === '/' || event.code === 'Slash') {
        event.preventDefault()
        event.stopPropagation()
        setShortcutsOpen(!useUi.getState().shortcutsOpen)
      } else if (event.key === '\\') {
        event.preventDefault()
        toggleSidebar()
      } else if (event.key.toLowerCase() === 'n' && !event.shiftKey) {
        // Certains navigateurs gardent Ctrl+N pour une nouvelle fenêtre ; l'application de bureau, non.
        event.preventDefault()
        newPage(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [toggleSidebar, newPage, setSearchOpen, setShortcutsOpen])
}
