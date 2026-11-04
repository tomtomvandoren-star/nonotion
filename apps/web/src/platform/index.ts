import { webPlatform } from './web'

/**
 * Ce qui diffère entre le web, Tauri et Capacitor (spec 1.6.2). Le reste du code passe
 * toujours par `platform` et n'importe jamais @tauri-apps/* ni @capacitor/*.
 * Seule l'implémentation web existe pour l'instant ; Tauri arrive en phase 8, Capacitor en phase 9.
 */
export interface Platform {
  /** Cmd sur macOS, Ctrl ailleurs (spec 1.6.6). */
  isMac: boolean
  /** Écran tactile principal : les contrôles « au survol » restent visibles. */
  isTouch: boolean
  /** Stockage du jeton d'authentification, la seule donnée gardée côté client (spec 1.6.10). */
  secureStorage: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    remove(key: string): Promise<void>
  }
  openExternal(url: string): void
}

export const platform: Platform = webPlatform
