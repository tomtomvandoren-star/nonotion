import { useSyncExternalStore } from 'react'
import { useUi } from '@/stores/ui'

const DARK = '(prefers-color-scheme: dark)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DARK)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * Le thème réellement affiché (spec 7) : le choix de l'utilisateur, ou celui du système (suivi en
 * direct). Pour les composants qui ne lisent pas les variables CSS, comme l'éditeur de blocs.
 */
export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useUi((s) => s.theme)
  const systemDark = useSyncExternalStore(subscribe, () => window.matchMedia(DARK).matches)
  if (theme !== 'system') return theme
  return systemDark ? 'dark' : 'light'
}
