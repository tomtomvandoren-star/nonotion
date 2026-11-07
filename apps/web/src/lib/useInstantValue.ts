import { useEffect, useState } from 'react'

/**
 * Une case qui change dès le clic. Sa vraie valeur vient du cache des requêtes, mis à jour un
 * instant plus tard (et React remettrait la case d'un champ contrôlé entre-temps). La valeur voulue
 * l'emporte tant que la vraie n'a pas bougé, et au plus `timeoutMs` si l'enregistrement échoue.
 */
export function useInstantValue<T>(actual: T, timeoutMs = 2_000): [T, (next: T) => void] {
  const [wanted, setWanted] = useState<{ from: T; value: T } | null>(null)
  useEffect(() => {
    if (!wanted) return
    const timer = setTimeout(() => setWanted(null), timeoutMs)
    return () => clearTimeout(timer)
  }, [wanted, timeoutMs])
  const value = wanted && Object.is(wanted.from, actual) ? wanted.value : actual
  return [value, (next) => setWanted({ from: actual, value: next })]
}
