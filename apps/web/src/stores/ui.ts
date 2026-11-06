import type { CalendarMode } from '@nonotion/shared'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const SIDEBAR_MIN = 200
export const SIDEBAR_MAX = 400

export type Theme = 'system' | 'light' | 'dark'
/** Une page ouverte récemment, pour la recherche (spec 6.12) quand le champ est vide. */
export type RecentPage = { id: string; title: string; icon: string | null }
const RECENT_MAX = 8

interface UiState {
  sidebarOpen: boolean
  sidebarWidth: number
  /** Pages dépliées dans l'arbre de la barre latérale (spec 6.1 : « l'état déplié est mémorisé »). */
  expanded: Record<string, true>
  /** La vue ouverte de chaque base, retrouvée au retour sur la page. */
  activeViews: Record<string, string>
  /** Thème : celui du système, ou un choix explicite (spec 7). */
  theme: Theme
  recentPages: RecentPage[]
  /** L'Agenda (spec 6.15) en mois, semaine ou jour : retrouvé au retour. */
  agendaMode: CalendarMode
  /** La recherche (Ctrl+K) et l'aide des raccourcis (Ctrl+/) : ouvertes ou non, jamais mémorisé. */
  searchOpen: boolean
  /** La recherche ouverte pour choisir une page à lier : ce qu'on fait du choix (null : annulé). */
  searchPick: ((page: { id: string } | null) => void) | null
  shortcutsOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarWidth: (width: number) => void
  setExpanded: (pageId: string, expanded: boolean) => void
  setActiveView: (databaseId: string, viewId: string) => void
  setTheme: (theme: Theme) => void
  setAgendaMode: (mode: CalendarMode) => void
  rememberPage: (page: RecentPage) => void
  setSearchOpen: (open: boolean) => void
  pickPage: () => Promise<{ id: string } | null>
  setShortcutsOpen: (open: boolean) => void
}

/**
 * Préférences d'affichage de cet appareil. Elles restent locales (comme la largeur d'une fenêtre) :
 * les données, elles, vivent toutes en base (spec 1.6.10).
 */
export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarOpen: window.matchMedia?.('(min-width: 768px)').matches ?? true,
      sidebarWidth: 240,
      expanded: {},
      activeViews: {},
      theme: 'system',
      recentPages: [],
      agendaMode: 'week',
      searchOpen: false,
      searchPick: null,
      shortcutsOpen: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setAgendaMode: (agendaMode) => set({ agendaMode }),
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
      setTheme: (theme) => set({ theme }),
      rememberPage: (page) =>
        set((state) => ({
          recentPages: [page, ...state.recentPages.filter((item) => item.id !== page.id)].slice(
            0,
            RECENT_MAX,
          ),
        })),
      setSearchOpen: (open) => {
        // Fermée sans choisir : le choix d'une page à lier est annulé.
        const pick = get().searchPick
        set({ searchOpen: open, searchPick: open ? pick : null })
        if (!open) pick?.(null)
      },
      pickPage: () =>
        new Promise((resolve) => {
          get().searchPick?.(null)
          set({ searchOpen: true, searchPick: resolve })
        }),
      setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
    }),
    {
      name: 'nonotion.ui',
      // L'accès au stockage peut échouer (navigation privée) : zustand l'ignore alors.
      storage: createJSONStorage(() => window.localStorage),
      partialize: ({
        sidebarOpen,
        sidebarWidth,
        expanded,
        activeViews,
        theme,
        recentPages,
        agendaMode,
      }) => ({
        sidebarOpen,
        sidebarWidth,
        expanded,
        activeViews,
        theme,
        recentPages,
        agendaMode,
      }),
    },
  ),
)
