import { Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useNewPage } from '@/features/pages/useNewPage'
import { Sidebar } from '@/features/sidebar/Sidebar'
import { isModPressed } from '@/lib/shortcuts'
import { useUi } from '@/stores/ui'
import { TopBar } from './TopBar'

/**
 * Disposition générale (spec 5) : barre latérale à gauche, stable ; à droite la barre du haut
 * puis le canevas, où le contenu est centré dans une colonne étroite.
 */
export function AppLayout() {
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const setSidebarOpen = useUi((s) => s.setSidebarOpen)
  useGlobalShortcuts()

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
    </div>
  )
}

/** Raccourcis de l'application (spec 6.14) : Ctrl+\ masque la barre latérale, Ctrl+N crée une page. */
function useGlobalShortcuts() {
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const newPage = useNewPage()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isModPressed(event) || event.altKey) return
      if (event.key === '\\') {
        event.preventDefault()
        toggleSidebar()
      } else if (event.key.toLowerCase() === 'n' && !event.shiftKey) {
        // Certains navigateurs gardent Ctrl+N pour une nouvelle fenêtre ; l'application de bureau, non.
        event.preventDefault()
        newPage(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar, newPage])
}
