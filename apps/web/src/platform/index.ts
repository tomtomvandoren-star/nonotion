import { webPlatform } from './web'

/** Une mise à jour de l'application installée, prête à être téléchargée. */
export interface AppUpdate {
  version: string
  /**
   * Télécharge puis installe la mise à jour, et redémarre l'application. `beforeRestart` laisse
   * partir ce qui n'est pas encore enregistré : l'application se ferme juste après.
   */
  install(beforeRestart: () => Promise<void>): Promise<void>
}

/**
 * Ce qui diffère entre le web, Tauri et Capacitor (spec 1.6.2). Le reste du code passe
 * toujours par `platform` et n'importe jamais @tauri-apps/* ni @capacitor/*.
 * Web et Tauri (phase 8) existent ; Capacitor arrive en phase 9.
 */
export interface Platform {
  /** Le site dans un navigateur, ou l'application pour ordinateur (Tauri). */
  kind: 'web' | 'desktop'
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
  /** Ouvre un lien dans le navigateur (ou l'application d'agenda, pour webcal:) du système. */
  openExternal(url: string): void
  /** La mise à jour disponible de l'application installée ; toujours null sur le web. */
  checkForUpdate(): Promise<AppUpdate | null>
}

// Choisie au démarrage : Tauri ajoute __TAURI_INTERNALS__ avant le premier script de la page. Le code
// propre à Tauri est chargé à part, et seulement dans l'application.
export const platform: Platform =
  '__TAURI_INTERNALS__' in window ? (await import('./tauri')).tauriPlatform : webPlatform
