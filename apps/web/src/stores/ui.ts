import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const SIDEBAR_MIN = 200
export const SIDEBAR_MAX = 400

interface UiState {
  sidebarOpen: boolean
  sidebarWidth: number
  /** Pages dépliées dans l'arbre de la barre latérale (spec 6.1 : « l'état déplié est mémorisé »). */
  expanded: Record<string, true>
  /** La vue ouverte de chaque base, retrouvée au retour sur la page. */
  activeViews: Record<string, string>
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarWidth: (width: number) => void
  setExpanded: (pageId: string, expanded: boolean) => void
  setActiveView: (databaseId: string, viewId: string) => void
}

/**
 * Préférences d'affichage de cet appareil. Elles restent locales (comme la largeur d'une fenêtre) :
 * les données, elles, vivent toutes en base (spec 1.6.10).
 */
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: window.matchMedia?.('(min-width: 768px)').matches ?? true,
      sidebarWidth: 240,
      expanded: {},
      activeViews: {},
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarWidth: (width) =>
        set({ sidebarWidth: Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width))) }),
      setExpanded: (pageId, expanded) =>
        set((state) => {
          const next = { ...state.expanded }
          if (expanded) next[pageId] = true
          else delete next[pageId]
          return { expanded: next }
        }),
      setActiveView: (databaseId, viewId) =>
        set((state) => ({ activeViews: { ...state.activeViews, [databaseId]: viewId } })),
    }),
    {
      name: 'nonotion.ui',
      // L'accès au stockage peut échouer (navigation privée) : zustand l'ignore alors.
      storage: createJSONStorage(() => window.localStorage),
      partialize: ({ sidebarOpen, sidebarWidth, expanded, activeViews }) => ({
        sidebarOpen,
        sidebarWidth,
        expanded,
        activeViews,
      }),
    },
  ),
)
