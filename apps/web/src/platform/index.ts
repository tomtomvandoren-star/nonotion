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

/** Un rappel de tâche programmé sur l'appareil (spec 9, phase 10). */
export interface Reminder {
  /** Un entier stable : le même rappel garde le même identifiant d'une programmation à l'autre. */
  id: number
  pageId: string
  title: string
  body: string
  at: Date
}

/**
 * Ce qui diffère entre le web, Tauri et Capacitor (spec 1.6.2). Le reste du code passe
 * toujours par `platform` et n'importe jamais @tauri-apps/* ni @capacitor/*.
 */
export interface Platform {
  /** Le site dans un navigateur, l'application pour ordinateur (Tauri) ou mobile (Capacitor). */
  kind: 'web' | 'desktop' | 'mobile'
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
  /**
   * Ouvre un lien dans le navigateur (ou l'application d'agenda, pour webcal:) du système. Échoue
   * quand rien ne sait l'ouvrir (webcal: sans application d'agenda, par exemple).
   */
  openExternal(url: string): Promise<void>
  /**
   * Partage un lien par la feuille de partage du système (messagerie, e-mail…). Faux quand
   * l'appareil n'en a pas : on propose alors de copier le lien.
   */
  share(data: { title: string; url: string }): Promise<boolean>
  /** La mise à jour disponible de l'application installée ; toujours null sur le web. */
  checkForUpdate(): Promise<AppUpdate | null>
  /** Les rappels des tâches, sur un téléphone ; null ailleurs. */
  reminders: {
    /** Programme ces rappels sur l'appareil, à la place des précédents. */
    sync(reminders: readonly Reminder[]): Promise<void>
    /** Quand on touche un rappel : la page à ouvrir. Renvoie de quoi ne plus écouter. */
    onOpen(handler: (pageId: string) => void): () => void
  } | null
}

type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } }

// Choisie au démarrage : Tauri ajoute __TAURI_INTERNALS__, et Capacitor son pont, avant le premier
// script de la page. Le code propre à chacun est chargé à part, et seulement dans son application.
export const platform: Platform =
  '__TAURI_INTERNALS__' in window
    ? (await import('./tauri')).tauriPlatform
    : (window as CapacitorGlobal).Capacitor?.isNativePlatform?.()
      ? (await import('./capacitor')).capacitorPlatform
      : webPlatform
