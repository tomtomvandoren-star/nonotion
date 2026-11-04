import { create } from 'zustand'
import { platform } from '@/platform'

const TOKEN_KEY = 'nonotion.token'

interface SessionState {
  token: string | null
}

/** Jeton Bearer de la session, gardé en mémoire et dans le stockage sécurisé de la plateforme. */
export const useSession = create<SessionState>(() => ({ token: null }))

export const getToken = () => useSession.getState().token

/** À appeler avant le premier rendu : relit le jeton enregistré. */
export async function restoreSession(): Promise<void> {
  useSession.setState({ token: await platform.secureStorage.get(TOKEN_KEY) })
}

export async function startSession(token: string): Promise<void> {
  useSession.setState({ token })
  await platform.secureStorage.set(TOKEN_KEY, token)
}

export async function endSession(): Promise<void> {
  useSession.setState({ token: null })
  await platform.secureStorage.remove(TOKEN_KEY)
}
