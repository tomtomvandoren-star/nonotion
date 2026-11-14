import { create } from 'zustand'

/**
 * Le serveur répond-il ? (spec 6.16) Plus sûr que navigator.onLine, qui dit « en ligne » derrière un
 * réseau sans Internet : un appel qui échoue faute de réseau met hors ligne, une réponse du serveur
 * remet en ligne. Hors ligne, un petit appel régulier vérifie si la connexion est revenue.
 */
export const useNetwork = create<{ online: boolean }>(() => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
}))

export const isOnline = () => useNetwork.getState().online

/** Une erreur de fetch sans réponse du serveur (pas de réseau, serveur injoignable). */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError
}

const listeners = new Set<() => void>()

/** Appelé à chaque retour de la connexion (envoyer la file d'attente, rafraîchir la copie). */
export function onReconnect(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let probe: ReturnType<typeof setInterval> | null = null
let probeUrl: string | null = null

export function markOnline() {
  if (probe) clearInterval(probe)
  probe = null
  if (isOnline()) return
  useNetwork.setState({ online: true })
  for (const listener of listeners) listener()
}

export function markOffline() {
  if (!isOnline()) return
  useNetwork.setState({ online: false })
  startProbe()
}

function startProbe() {
  if (probe || !probeUrl) return
  const url = probeUrl
  probe = setInterval(() => {
    void fetch(url, { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (response.ok) markOnline()
      })
      .catch(() => undefined)
  }, 10_000)
}

/** Démarre la surveillance du réseau (applications natives seulement). */
export function watchNetwork(healthUrl: string) {
  probeUrl = healthUrl
  window.addEventListener('online', () => {
    // Le système dit que le réseau est revenu : on vérifie tout de suite.
    void fetch(healthUrl, { headers: { Accept: 'application/json' } })
      .then((response) => response.ok && markOnline())
      .catch(() => undefined)
  })
  window.addEventListener('offline', markOffline)
  if (!isOnline()) startProbe()
}
