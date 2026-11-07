import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'
import type { Platform } from './index'
import { webPlatform } from './web'

/**
 * L'application pour ordinateur (Tauri 2, phase 8) : le même site, avec le trousseau du système
 * pour le jeton, le navigateur du système pour les liens externes et les mises à jour automatiques.
 */

/** Ce qui s'ouvre hors de l'application : autre site, e-mail, téléphone, agenda (webcal:). */
function isExternal(href: string): boolean {
  try {
    const url = new URL(href, window.location.href)
    return (
      ['http:', 'https:', 'mailto:', 'tel:', 'webcal:'].includes(url.protocol) &&
      url.origin !== window.location.origin
    )
  } catch {
    return false
  }
}

const openExternal = (url: string) => openUrl(url)

// Un lien vers un autre site ne remplace jamais l'application dans sa fenêtre : il s'ouvre dans le
// navigateur. Dans l'éditeur, un clic sur un lien ne fait rien (comme sur le web) ; sa barre d'outils
// l'ouvre avec window.open, détourné de même.
document.addEventListener(
  'click',
  (event) => {
    const anchor = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]')
    if (!anchor || anchor.isContentEditable) return
    if (!isExternal(anchor.href)) return
    event.preventDefault()
    void openExternal(anchor.href).catch(() => undefined)
  },
  true,
)
const openInWindow = window.open.bind(window)
window.open = (url, target, features) => {
  const href = url?.toString()
  if (href && isExternal(href)) {
    void openExternal(href).catch(() => undefined)
    return null
  }
  return openInWindow(url, target, features)
}

/**
 * Le trousseau du système (Trousseau d'accès de macOS, Gestionnaire d'identification de Windows,
 * Secret Service sous Linux). Sans trousseau disponible (certains bureaux Linux), le stockage de la
 * vue web prend le relais : il reste dans le dossier de l'application, propre à l'utilisateur.
 */
const secureStorage: Platform['secureStorage'] = {
  get: (key) =>
    invoke<string | null>('secret_get', { key }).catch(() => webPlatform.secureStorage.get(key)),
  set: (key, value) =>
    invoke<void>('secret_set', { key, value }).catch(() =>
      webPlatform.secureStorage.set(key, value),
    ),
  remove: async (key) => {
    await invoke<void>('secret_remove', { key }).catch(() => undefined)
    await webPlatform.secureStorage.remove(key)
  },
}

export const tauriPlatform: Platform = {
  ...webPlatform,
  kind: 'desktop',
  secureStorage,
  openExternal,
  // Pas de feuille de partage sur ordinateur : « Copier le lien ».
  share: async () => false,
  checkForUpdate: async () => {
    // Sans clé de signature des mises à jour configurée à la compilation, le module n'est pas chargé.
    const update = await check().catch(() => null)
    if (!update) return null
    return {
      version: update.version,
      install: async (beforeRestart) => {
        await update.download()
        await beforeRestart()
        await update.install()
        await relaunch()
      },
    }
  },
}
