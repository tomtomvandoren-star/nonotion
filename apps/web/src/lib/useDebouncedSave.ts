import { useCallback, useEffect, useMemo, useRef } from 'react'
import { create } from 'zustand'

/** Nombre de sauvegardes en attente (frappe en cours), pour l'indicateur « Enregistrement… ». */
export const usePendingSaves = create<{ count: number }>(() => ({ count: 0 }))

const adjustPending = (delta: number) =>
  usePendingSaves.setState((state) => ({ count: Math.max(0, state.count + delta) }))

/** Délai de regroupement des frappes avant l'envoi au serveur (P5 : debounce d'environ 500 ms). */
export const SAVE_DELAY_MS = 500

/**
 * Regroupe les modifications rapides en un seul envoi, SAVE_DELAY_MS après la dernière.
 * `flush` envoie tout de suite ce qui attend (sortie du champ, changement de page…).
 */
export function useDebouncedSave<T>(save: (value: T) => void, delay = SAVE_DELAY_MS) {
  const saveRef = useRef(save)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ value: T } | null>(null)

  useEffect(() => {
    saveRef.current = save
  }, [save])

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    const next = pending.current
    if (next === null) return
    pending.current = null
    adjustPending(-1)
    saveRef.current(next.value)
  }, [])

  const schedule = useCallback(
    (value: T) => {
      if (pending.current === null) adjustPending(1)
      pending.current = { value }
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    [delay, flush],
  )

  const hasPending = useCallback(() => pending.current !== null, [])

  // Quitter la page n'abandonne jamais une modification.
  useEffect(() => flush, [flush])

  return useMemo(() => ({ schedule, flush, hasPending }), [schedule, flush, hasPending])
}
