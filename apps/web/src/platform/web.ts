import type { Platform } from './index'

// localStorage peut être indisponible (navigation privée, stockage bloqué) : on ne plante jamais.
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Sans stockage, la session dure le temps de l'onglet.
  }
}

const userAgentData = (navigator as Navigator & { userAgentData?: { platform?: string } })
  .userAgentData

export const webPlatform: Platform = {
  isMac: /mac|iphone|ipad/i.test(userAgentData?.platform ?? navigator.platform ?? ''),
  isTouch: window.matchMedia?.('(pointer: coarse)').matches ?? false,
  secureStorage: {
    get: async (key) => readStorage(key),
    set: async (key, value) => writeStorage(key, value),
    remove: async (key) => writeStorage(key, null),
  },
  openExternal: (url) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
}
