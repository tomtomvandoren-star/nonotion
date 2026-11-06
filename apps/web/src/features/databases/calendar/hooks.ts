import type { CalendarSource } from '@nonotion/shared'
import { useEffect, useRef } from 'react'
import { useSyncCalendar } from './calendarQueries'

export const CALENDAR_KEYS = { d: 'day', w: 'week', m: 'month' } as const

/**
 * Une touche qu'on tape dans un champ ou dans le texte d'une page ne pilote pas le calendrier.
 * isContentEditable, pas l'attribut : la base vit dans l'éditeur, mais en îlot non modifiable.
 */
function isTyping(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  return Boolean(
    element &&
    (element.isContentEditable ||
      element.closest('input, textarea, select, [role="dialog"], [role="menu"]')),
  )
}

/**
 * Raccourcis du calendrier (spec 6.14) : D jour, W semaine, M mois, T aujourd'hui. Pour le
 * calendrier où se trouve le focus, sinon le premier de la page.
 */
export function useCalendarKeys(
  section: React.RefObject<HTMLElement | null>,
  active: boolean,
  onKey: (key: 'd' | 'w' | 'm' | 't') => void,
) {
  const handler = useRef(onKey)
  useEffect(() => {
    handler.current = onKey
  })
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (event.ctrlKey || event.metaKey || event.altKey || !['d', 'w', 'm', 't'].includes(key))
        return
      if (isTyping(event.target) || document.querySelector('[role="dialog"]')) return
      const roots = [...document.querySelectorAll<HTMLElement>('[data-calendar-root]')]
      const focused = roots.find((root) => root.contains(document.activeElement))
      if ((focused ?? roots[0]) !== section.current) return
      event.preventDefault()
      handler.current(key as 'd' | 'w' | 'm' | 't')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, section])
}

/** Les agendas déjà resynchronisés à l'ouverture, pendant cette session. */
const syncedOnOpen = new Set<string>()

/**
 * Synchronisation à l'ouverture (spec 6.9) : d'une base ou de l'Agenda (spec 6.15), un agenda en abonnement qui n'a pas été resynchronisé
 * depuis plus de 15 minutes l'est maintenant, sans attendre le planificateur.
 */
export function useSyncOnOpen(sources: readonly CalendarSource[]) {
  const sync = useSyncCalendar()
  useEffect(() => {
    const stale = sources.filter(
      (source) =>
        source.mode === 'subscription' &&
        source.status !== 'error' &&
        !syncedOnOpen.has(source.id) &&
        (!source.last_sync_at || Date.now() - Date.parse(source.last_sync_at) > 15 * 60_000),
    )
    for (const source of stale) {
      syncedOnOpen.add(source.id)
      sync.mutate(source.id)
    }
    // La synchronisation n'a lieu qu'une fois par agenda : la fonction de mutation peut changer.
  }, [sources])
}
