import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Share } from '@capacitor/share'
import type { Platform, Reminder } from './index'
import { webPlatform } from './web'

/**
 * Les applications mobiles (Capacitor, phase 10) : le même site, avec le stockage sécurisé du
 * téléphone pour le jeton, le navigateur du système pour les liens externes, la feuille de partage,
 * et les rappels des tâches en notifications locales.
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

/**
 * Un site s'ouvre dans le navigateur intégré du système (onglet personnalisé de Chrome, Safari) ;
 * e-mail, téléphone et agenda dans leur application, que Capacitor lance d'après l'adresse.
 */
async function openExternal(url: string): Promise<void> {
  if (/^https?:/i.test(url)) await Browser.open({ url })
  else window.location.href = url
}

// Un lien vers un autre site ne remplace jamais l'application : il s'ouvre à côté. Dans le texte de
// l'éditeur, un toucher sur un lien ne fait rien (comme sur le web) ; sa barre d'outils passe par
// window.open, détourné de même.
document.addEventListener(
  'click',
  (event) => {
    const anchor = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]')
    if (!anchor || anchor.isContentEditable || !isExternal(anchor.href)) return
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

// Le bouton Retour d'Android revient à la page précédente ; sur la première, il quitte l'application.
void App.addListener('backButton', ({ canGoBack }) => {
  if (canGoBack) window.history.back()
  else void App.exitApp()
})

/**
 * Le stockage sécurisé du téléphone (Trousseau d'iOS, Keystore d'Android). S'il fait défaut, le
 * stockage de la vue web prend le relais : il reste dans le dossier privé de l'application.
 */
const secureStorage: Platform['secureStorage'] = {
  get: async (key) => {
    try {
      const value = await SecureStorage.get(key)
      return typeof value === 'string' ? value : await webPlatform.secureStorage.get(key)
    } catch {
      return webPlatform.secureStorage.get(key)
    }
  },
  set: (key, value) =>
    SecureStorage.set(key, value).catch(() => webPlatform.secureStorage.set(key, value)),
  remove: async (key) => {
    await SecureStorage.remove(key).catch(() => undefined)
    await webPlatform.secureStorage.remove(key)
  },
}

/** Le canal Android des rappels : son nom apparaît dans les réglages de notifications. */
const CHANNEL = 'rappels'
let channelReady: Promise<void> | null = null

async function remindersAllowed(): Promise<boolean> {
  let permission = await LocalNotifications.checkPermissions()
  if (permission.display === 'prompt' || permission.display === 'prompt-with-rationale')
    permission = await LocalNotifications.requestPermissions()
  return permission.display === 'granted'
}

async function syncReminders(reminders: readonly Reminder[]): Promise<void> {
  if (!(await remindersAllowed())) return
  channelReady ??= LocalNotifications.createChannel({
    id: CHANNEL,
    name: 'Rappels des tâches',
    description: 'Une tâche qui arrive à échéance',
    importance: 4,
  }).catch(() => undefined)
  await channelReady
  // Nos rappels seulement : ils sont tous remplacés par la nouvelle liste.
  const { notifications } = await LocalNotifications.getPending()
  const ours = notifications.filter((item) => item.extra?.nonotion)
  if (ours.length > 0)
    await LocalNotifications.cancel({ notifications: ours.map(({ id }) => ({ id })) })
  if (reminders.length === 0) return
  await LocalNotifications.schedule({
    notifications: reminders.map((reminder) => ({
      id: reminder.id,
      title: reminder.title,
      body: reminder.body,
      channelId: CHANNEL,
      smallIcon: 'ic_stat_nonotion',
      iconColor: '#657868',
      schedule: { at: reminder.at, allowWhileIdle: true },
      extra: { nonotion: true, pageId: reminder.pageId },
    })),
  })
}

export const capacitorPlatform: Platform = {
  ...webPlatform,
  kind: 'mobile',
  // Un téléphone ou une tablette : les contrôles « au survol » restent visibles (spec 1.6.4).
  isTouch: true,
  secureStorage,
  openExternal,
  share: async ({ title, url }) => {
    try {
      await Share.share({ title, url, dialogTitle: title })
    } catch {
      // Annulé par l'utilisateur : rien à faire de plus.
    }
    return true
  },
  checkForUpdate: async () => null,
  reminders: {
    sync: syncReminders,
    onOpen: (handler) => {
      const listener = LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (action) => {
          const pageId = action.notification.extra?.pageId
          if (typeof pageId === 'string') handler(pageId)
        },
      )
      return () => void listener.then((subscription) => subscription.remove())
    },
  },
}
