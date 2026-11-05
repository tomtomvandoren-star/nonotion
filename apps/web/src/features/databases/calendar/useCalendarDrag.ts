import type { DateValue } from '@nonotion/shared'
import { useEffect, useRef, useState } from 'react'
import { type Day, instantAt, moveToDay, moveToTime, resizeTo, snapMinutes } from './dates'

/** Hauteur d'une heure dans la grille de la semaine, en pixels. */
export const HOUR_HEIGHT = 48
export const PX_PER_MINUTE = HOUR_HEIGHT / 60

/**
 * Ce qu'on glisse : un élément (déplacer, tirer sa fin), un élément « Sans date » à placer, ou une
 * plage d'heures à créer (vue semaine).
 */
export type DragStart =
  | { kind: 'move'; rowId: string; value: DateValue | null; grabMinutes?: number }
  | { kind: 'resize'; rowId: string; value: DateValue }
  | { kind: 'create'; day: Day; minutes: number }

/** L'aperçu pendant le glisser : la valeur que prendrait l'élément (rowId null : une création). */
export type DragPreview = { rowId: string | null; value: DateValue }

type Session = DragStart & {
  x: number
  y: number
  touch: boolean
  active: boolean
  timer?: ReturnType<typeof setTimeout>
  preview: DragPreview | null
}

/** Le jour (et l'heure, sur la grille des heures) sous le pointeur. */
function targetAt(x: number, y: number): { day: Day; minutes: number | null } | null {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-day]')
  if (!element?.dataset.day) return null
  if (element.dataset.hours === undefined) return { day: element.dataset.day, minutes: null }
  return {
    day: element.dataset.day,
    minutes: (y - element.getBoundingClientRect().top) / PX_PER_MINUTE,
  }
}

function previewFor(session: Session, x: number, y: number): DragPreview | null {
  const target = targetAt(x, y)
  if (!target) return session.preview
  if (session.kind === 'create') {
    if (target.day !== session.day || target.minutes === null) return session.preview
    const [from, to] = [session.minutes, snapMinutes(target.minutes)].sort((a, b) => a - b) as [
      number,
      number,
    ]
    return {
      rowId: null,
      value: {
        start: instantAt(session.day, from),
        end: instantAt(session.day, Math.max(to, from + 15)),
      },
    }
  }
  if (session.kind === 'resize')
    return {
      rowId: session.rowId,
      value: resizeTo(
        session.value,
        target.day,
        target.minutes === null ? undefined : snapMinutes(target.minutes),
      ),
    }
  const value =
    target.minutes !== null
      ? moveToTime(
          session.value ?? { start: target.day },
          target.day,
          snapMinutes(target.minutes - (session.grabMinutes ?? 0)),
        )
      : session.value
        ? moveToDay(session.value, target.day)
        : { start: target.day }
  return { rowId: session.rowId, value }
}

/** Au bord de la grille des heures, elle défile pendant le glisser. */
function autoScroll(x: number, y: number) {
  const scroller = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-calendar-scroll]')
  if (!scroller) return
  const box = scroller.getBoundingClientRect()
  if (y < box.top + 32) scroller.scrollTop -= 16
  else if (y > box.bottom - 32) scroller.scrollTop += 16
}

/**
 * Glisser dans le calendrier (spec 6.8), à la souris dès 4 px, au doigt après un appui long (un
 * glisser rapide fait défiler). L'aperçu suit le pointeur ; au relâcher, la date est enregistrée.
 */
export function useCalendarDrag({
  onMove,
  onCreate,
}: {
  onMove: (rowId: string, value: DateValue) => void
  onCreate: (value: DateValue) => void
}) {
  const session = useRef<Session | null>(null)
  const [preview, setPreview] = useState<DragPreview | null>(null)
  // Vrai juste après un glisser : le relâcher ne doit pas ouvrir l'élément.
  const justDragged = useRef(false)
  const handlers = useRef({ onMove, onCreate })
  useEffect(() => {
    handlers.current = { onMove, onCreate }
  })

  useEffect(() => {
    const stop = (commit: boolean) => {
      const current = session.current
      session.current = null
      if (!current) return
      clearTimeout(current.timer)
      setPreview(null)
      if (!current.active) return
      justDragged.current = true
      setTimeout(() => {
        justDragged.current = false
      }, 300)
      const result = current.preview
      if (!commit || !result) return
      if (current.kind === 'create') handlers.current.onCreate(result.value)
      else if (result.rowId) handlers.current.onMove(result.rowId, result.value)
    }
    const move = (event: PointerEvent) => {
      const current = session.current
      if (!current) return
      const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y)
      if (!current.active) {
        // Au doigt, bouger avant l'appui long, c'est faire défiler : on abandonne.
        if (current.touch) {
          if (distance > 6) stop(false)
          return
        }
        if (distance < 4) return
        current.active = true
      }
      autoScroll(event.clientX, event.clientY)
      current.preview = previewFor(current, event.clientX, event.clientY)
      setPreview(current.preview)
    }
    const up = () => stop(true)
    const cancel = () => stop(false)
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stop(false)
    }
    // Pendant un glisser au doigt, la page ne défile pas ; un appui long n'ouvre pas de menu.
    const touchMove = (event: TouchEvent) => {
      if (session.current?.active && event.cancelable) event.preventDefault()
    }
    const contextMenu = (event: Event) => {
      if (session.current) event.preventDefault()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    window.addEventListener('touchmove', touchMove, { passive: false })
    window.addEventListener('contextmenu', contextMenu)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
      window.removeEventListener('touchmove', touchMove)
      window.removeEventListener('contextmenu', contextMenu)
    }
  }, [])

  const start = (event: React.PointerEvent, what: DragStart) => {
    if (!event.isPrimary || event.button !== 0) return
    event.stopPropagation()
    const touch = event.pointerType === 'touch'
    if (!touch) event.preventDefault() // pas de sélection de texte en glissant
    const next: Session = {
      ...what,
      x: event.clientX,
      y: event.clientY,
      touch,
      active: false,
      preview: null,
    }
    if (touch)
      next.timer = setTimeout(() => {
        next.active = true
        next.preview = previewFor(next, next.x, next.y)
        setPreview(next.preview)
      }, 250)
    session.current = next
  }

  return {
    preview,
    start,
    /** Vrai si un glisser vient de finir : le clic qui suit ne doit rien ouvrir. */
    wasDragging: () => justDragged.current,
  }
}
