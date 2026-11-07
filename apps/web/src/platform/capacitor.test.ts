import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reminder } from './index'

/*
 * La couche Capacitor (phase 10), sans téléphone : les plugins sont simulés, et la page réduite à
 * ce que capacitor.ts utilise (les tests tournent sous Node, sans DOM).
 */

const native = vi.hoisted(() => ({
  browserOpen: vi.fn(async () => {}),
  backButton: null as ((event: { canGoBack: boolean }) => void) | null,
  exitApp: vi.fn(async () => {}),
  secure: { get: vi.fn(), set: vi.fn(), remove: vi.fn(async () => {}) },
  share: vi.fn(async () => ({})),
  notifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    createChannel: vi.fn(async () => {}),
    getPending: vi.fn(),
    cancel: vi.fn(async () => {}),
    schedule: vi.fn(async () => ({ notifications: [] })),
    opened: null as ((action: unknown) => void) | null,
    remove: vi.fn(async () => {}),
  },
}))
vi.mock('@capacitor/browser', () => ({ Browser: { open: native.browserOpen } }))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (_: string, handler: (event: { canGoBack: boolean }) => void) => {
      native.backButton = handler
      return { remove: async () => {} }
    },
    exitApp: native.exitApp,
  },
}))
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: native.secure }))
vi.mock('@capacitor/share', () => ({ Share: { share: native.share } }))
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    ...native.notifications,
    addListener: async (_: string, handler: (action: unknown) => void) => {
      native.notifications.opened = handler
      return { remove: native.notifications.remove }
    },
  },
}))

const page = vi.hoisted(() => ({
  clickHandler: null as ((event: unknown) => void) | null,
  nativeOpen: vi.fn(() => null),
  back: vi.fn(),
  stored: new Map<string, string>(),
}))

beforeAll(() => {
  vi.stubGlobal('document', {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      if (type === 'click') page.clickHandler = handler
    },
  })
  vi.stubGlobal('window', {
    location: { href: 'https://localhost/p/abc', origin: 'https://localhost' },
    history: { back: page.back },
    open: page.nativeOpen,
    matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: (key: string) => page.stored.get(key) ?? null,
      setItem: (key: string, value: string) => page.stored.set(key, value),
      removeItem: (key: string) => page.stored.delete(key),
    },
  })
})

/** Un toucher sur un lien (dans l'éditeur ou non) : renvoie si la navigation a été empêchée. */
function tap(href: string, isContentEditable = false): boolean {
  const anchor = { href: new URL(href, 'https://localhost/p/abc').href, isContentEditable }
  const event = { target: { closest: () => anchor }, preventDefault: vi.fn() }
  page.clickHandler?.(event)
  return event.preventDefault.mock.calls.length > 0
}

async function capacitorPlatform() {
  return (await import('./capacitor')).capacitorPlatform
}

const reminder = (id: number, pageId: string): Reminder => ({
  id,
  pageId,
  title: 'Dentiste',
  body: 'À 14:30 · Tâches',
  at: new Date('2026-11-08T13:30:00Z'),
})

beforeEach(() => {
  vi.clearAllMocks()
  page.stored.clear()
  window.location.href = 'https://localhost/p/abc'
})

describe('liens et navigation dans l’application mobile', () => {
  it('un site s’ouvre dans le navigateur intégré, un e-mail dans son application', async () => {
    await capacitorPlatform()
    expect(tap('https://example.com/doc')).toBe(true)
    expect(native.browserOpen).toHaveBeenCalledWith({ url: 'https://example.com/doc' })
    expect(tap('mailto:moi@example.com')).toBe(true)
    await vi.waitFor(() => expect(window.location.href).toBe('mailto:moi@example.com'))
  })

  it('un lien interne, ou dans le texte de l’éditeur, est laissé à l’application', async () => {
    await capacitorPlatform()
    expect(tap('/p/autre')).toBe(false)
    expect(tap('https://example.com', true)).toBe(false)
    expect(window.open('/p/autre')).toBeNull()
    expect(page.nativeOpen).toHaveBeenCalledWith('/p/autre', undefined, undefined)
    expect(native.browserOpen).not.toHaveBeenCalled()
  })

  it('le bouton Retour d’Android revient en arrière, puis quitte sur la première page', async () => {
    await capacitorPlatform()
    native.backButton?.({ canGoBack: true })
    expect(page.back).toHaveBeenCalledOnce()
    expect(native.exitApp).not.toHaveBeenCalled()
    native.backButton?.({ canGoBack: false })
    expect(native.exitApp).toHaveBeenCalledOnce()
  })

  it('partager ouvre la feuille de partage du téléphone, même si on l’annule', async () => {
    const platform = await capacitorPlatform()
    await expect(platform.share({ title: 'Tâches', url: 'https://x/feeds/a.ics' })).resolves.toBe(
      true,
    )
    native.share.mockRejectedValueOnce(new Error('Share canceled'))
    await expect(platform.share({ title: 'Tâches', url: 'https://x/feeds/a.ics' })).resolves.toBe(
      true,
    )
    expect(native.share).toHaveBeenCalledWith({
      title: 'Tâches',
      url: 'https://x/feeds/a.ics',
      dialogTitle: 'Tâches',
    })
  })
})

describe('jeton dans le coffre du téléphone', () => {
  it('passe par le coffre (Keystore, trousseau) quand il répond', async () => {
    const platform = await capacitorPlatform()
    native.secure.get.mockResolvedValueOnce('jeton')
    await expect(platform.secureStorage.get('nonotion.token')).resolves.toBe('jeton')
    native.secure.set.mockResolvedValueOnce(undefined)
    await platform.secureStorage.set('nonotion.token', 'nouveau')
    expect(native.secure.set).toHaveBeenCalledWith('nonotion.token', 'nouveau')
    expect(page.stored.size).toBe(0)
  })

  it('sans coffre, le stockage de la vue web prend le relais', async () => {
    const platform = await capacitorPlatform()
    native.secure.get.mockRejectedValue(new Error('indisponible'))
    native.secure.set.mockRejectedValue(new Error('indisponible'))
    await platform.secureStorage.set('nonotion.token', 'jeton')
    await expect(platform.secureStorage.get('nonotion.token')).resolves.toBe('jeton')
    await platform.secureStorage.remove('nonotion.token')
    await expect(platform.secureStorage.get('nonotion.token')).resolves.toBeNull()
    native.secure.get.mockReset()
    native.secure.set.mockReset()
  })
})

describe('rappels des tâches', () => {
  it('remplace les rappels de Nonotion par la nouvelle liste, sur le canal « Rappels des tâches »', async () => {
    const platform = await capacitorPlatform()
    native.notifications.checkPermissions.mockResolvedValue({ display: 'granted' })
    native.notifications.getPending.mockResolvedValue({
      notifications: [
        { id: 7, extra: { nonotion: true, pageId: 'ancienne' } },
        { id: 8, extra: null },
      ],
    })
    await platform.reminders!.sync([reminder(42, 'page-1')])
    expect(native.notifications.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rappels', name: 'Rappels des tâches' }),
    )
    // Seul le rappel de Nonotion est annulé.
    expect(native.notifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: 7 }] })
    expect(native.notifications.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          id: 42,
          title: 'Dentiste',
          body: 'À 14:30 · Tâches',
          channelId: 'rappels',
          smallIcon: 'ic_stat_nonotion',
          schedule: { at: new Date('2026-11-08T13:30:00Z'), allowWhileIdle: true },
          extra: { nonotion: true, pageId: 'page-1' },
        }),
      ],
    })
  })

  it('demande la permission une fois ; refusée, rien n’est programmé', async () => {
    const platform = await capacitorPlatform()
    native.notifications.checkPermissions.mockResolvedValue({ display: 'prompt' })
    native.notifications.requestPermissions.mockResolvedValue({ display: 'denied' })
    await platform.reminders!.sync([reminder(42, 'page-1')])
    expect(native.notifications.requestPermissions).toHaveBeenCalledOnce()
    expect(native.notifications.schedule).not.toHaveBeenCalled()
  })

  it('plus aucune tâche à rappeler : les anciens rappels sont annulés, rien de nouveau', async () => {
    const platform = await capacitorPlatform()
    native.notifications.checkPermissions.mockResolvedValue({ display: 'granted' })
    native.notifications.getPending.mockResolvedValue({
      notifications: [{ id: 7, extra: { nonotion: true } }],
    })
    await platform.reminders!.sync([])
    expect(native.notifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: 7 }] })
    expect(native.notifications.schedule).not.toHaveBeenCalled()
  })

  it('toucher un rappel ouvre la tâche', async () => {
    const platform = await capacitorPlatform()
    const open = vi.fn()
    const stop = platform.reminders!.onOpen(open)
    await vi.waitFor(() => expect(native.notifications.opened).not.toBeNull())
    native.notifications.opened?.({ notification: { extra: { nonotion: true, pageId: 'page-1' } } })
    expect(open).toHaveBeenCalledWith('page-1')
    stop()
    await vi.waitFor(() => expect(native.notifications.remove).toHaveBeenCalled())
  })
})
