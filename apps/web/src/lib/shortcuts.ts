import { platform } from '@/platform'

/** Touche de commande : Cmd sur macOS, Ctrl ailleurs, décidé ici et nulle part ailleurs (spec 1.6.6). */
export const modKeyLabel = platform.isMac ? '⌘' : 'Ctrl'

export function isModPressed(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return platform.isMac ? event.metaKey : event.ctrlKey
}

/** Libellé d'un raccourci pour les menus et infobulles, ex. shortcutLabel('\\') → « Ctrl+\ ». */
export function shortcutLabel(key: string): string {
  return platform.isMac
    ? `${modKeyLabel}${key.toUpperCase()}`
    : `${modKeyLabel}+${key.toUpperCase()}`
}
