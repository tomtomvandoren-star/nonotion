import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * La couche Tauri (phase 8), sans application native : les modules @tauri-apps sont simulés, et la
 * page réduite à ce que tauri.ts utilise (les tests tournent sous Node, sans DOM).
 */

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  openUrl: vi.fn(async () => {}),
  check: vi.fn(),
  relaunch: vi.fn(async () => {}),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: tauri.openUrl }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: tauri.check }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: tauri.relaunch }))

const page = vi.hoisted(() => {
  const stored = new Map<string, string>()
  return {
    clickHandler: null as ((event: unknown) => void) | null,
    nativeOpen: vi.fn(() => null),
    stored,
  }
})

beforeAll(() => {
  vi.stubGlobal('document', {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      if (type === 'click') page.clickHandler = handler
    },
  })
  vi.stubGlobal('window', {
    location: { href: 'http://tauri.localhost/p/abc', origin: 'http://tauri.localhost' },
    open: page.nativeOpen,
    matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: (key: string) => page.stored.get(key) ?? null,
      setItem: (key: string, value: string) => page.stored.set(key, value),
      removeItem: (key: string) => page.stored.delete(key),
    },
  })
})

/** Un clic sur un lien (dans l'éditeur ou non) : renvoie si la navigation a été empêchée. */
function click(href: string, isContentEditable = false): boolean {
  const anchor = { href: new URL(href, 'http://tauri.localhost/p/abc').href, isContentEditable }
  const event = { target: { closest: () => anchor }, preventDefault: vi.fn() }
  page.clickHandler?.(event)
  return event.preventDefault.mock.calls.length > 0
}

async function tauriPlatform() {
  return (await import('./tauri')).tauriPlatform
}

beforeEach(() => {
  vi.clearAllMocks()
  page.stored.clear()
})

describe('liens dans l’application pour ordinateur', () => {
  it('un lien vers un autre site s’ouvre dans le navigateur du système, pas dans la fenêtre', async () => {
    await tauriPlatform()
    expect(click('https://example.com/doc')).toBe(true)
    expect(tauri.openUrl).toHaveBeenCalledWith('https://example.com/doc')
    expect(click('mailto:moi@example.com')).toBe(true)
    expect(tauri.openUrl).toHaveBeenLastCalledWith('mailto:moi@example.com')
  })

  it('un lien interne, ou dans le texte de l’éditeur, est laissé à l’application', async () => {
    await tauriPlatform()
    expect(click('/p/autre')).toBe(false)
    expect(click('https://example.com', true)).toBe(false)
    expect(tauri.openUrl).not.toHaveBeenCalled()
  })

  it('window.open vers un autre site passe aussi par le navigateur du système', async () => {
    await tauriPlatform()
    expect(window.open('https://example.com', '_blank')).toBeNull()
    expect(tauri.openUrl).toHaveBeenCalledWith('https://example.com')
    window.open('/p/autre')
    expect(page.nativeOpen).toHaveBeenCalledWith('/p/autre', undefined, undefined)
  })

  it('openExternal accepte webcal: (Calendrier Apple)', async () => {
    ;(await tauriPlatform()).openExternal('webcal://exemple/feeds/x.ics')
    expect(tauri.openUrl).toHaveBeenCalledWith('webcal://exemple/feeds/x.ics')
  })
})

describe('jeton dans le trousseau du système', () => {
  it('passe par le trousseau quand il répond', async () => {
    const platform = await tauriPlatform()
    tauri.invoke.mockResolvedValueOnce('jeton')
    await expect(platform.secureStorage.get('nonotion.token')).resolves.toBe('jeton')
    expect(tauri.invoke).toHaveBeenCalledWith('secret_get', { key: 'nonotion.token' })
    tauri.invoke.mockResolvedValueOnce(undefined)
    await platform.secureStorage.set('nonotion.token', 'nouveau')
    expect(tauri.invoke).toHaveBeenLastCalledWith('secret_set', {
      key: 'nonotion.token',
      value: 'nouveau',
    })
    expect(page.stored.size).toBe(0)
  })

  it('sans trousseau (certains bureaux Linux), le stockage de la vue web prend le relais', async () => {
    const platform = await tauriPlatform()
    tauri.invoke.mockRejectedValue(new Error('NoDefaultStore'))
    await platform.secureStorage.set('nonotion.token', 'jeton')
    await expect(platform.secureStorage.get('nonotion.token')).resolves.toBe('jeton')
    await platform.secureStorage.remove('nonotion.token')
    await expect(platform.secureStorage.get('nonotion.token')).resolves.toBeNull()
    tauri.invoke.mockReset()
  })
})

describe('mises à jour', () => {
  it('rien à proposer quand il n’y a pas de nouvelle version, ou pas de mise à jour configurée', async () => {
    const platform = await tauriPlatform()
    tauri.check.mockResolvedValueOnce(null)
    await expect(platform.checkForUpdate()).resolves.toBeNull()
    tauri.check.mockRejectedValueOnce(new Error('plugin updater not found'))
    await expect(platform.checkForUpdate()).resolves.toBeNull()
  })

  it('télécharge, enregistre ce qui attend, installe, puis redémarre, dans cet ordre', async () => {
    const platform = await tauriPlatform()
    const steps: string[] = []
    tauri.check.mockResolvedValueOnce({
      version: '0.9.0',
      download: async () => void steps.push('téléchargement'),
      install: async () => void steps.push('installation'),
    })
    tauri.relaunch.mockImplementationOnce(async () => void steps.push('redémarrage'))
    const update = await platform.checkForUpdate()
    expect(update?.version).toBe('0.9.0')
    await update?.install(async () => void steps.push('enregistrement'))
    expect(steps).toEqual(['téléchargement', 'enregistrement', 'installation', 'redémarrage'])
  })
})
