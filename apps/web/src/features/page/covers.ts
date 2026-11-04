import type { CSSProperties } from 'react'

/**
 * Couvertures prédéfinies, tirées de la palette Nonotion. Stockées dans `cover_url`
 * sous la forme « preset:<nom> » ; une image en ligne est stockée par son adresse https.
 */
export const COVER_PRESETS = {
  peche: 'linear-gradient(135deg, #f7d9bc 0%, #cdb39c 100%)',
  sable: 'linear-gradient(135deg, #cdb39c 0%, #ab9682 100%)',
  sauge: 'linear-gradient(135deg, #8a9e8c 0%, #657868 100%)',
  aube: 'linear-gradient(135deg, #f7d9bc 0%, #8a9e8c 100%)',
  terre: 'linear-gradient(135deg, #ab9682 0%, #657868 100%)',
  lin: '#f7d9bc',
} as const

export type CoverPreset = keyof typeof COVER_PRESETS

export const COVER_LABELS: Record<CoverPreset, string> = {
  peche: 'Pêche',
  sable: 'Sable',
  sauge: 'Sauge',
  aube: 'Aube',
  terre: 'Terre',
  lin: 'Lin',
}

export function presetCover(name: CoverPreset): string {
  return `preset:${name}`
}

export function randomCover(): string {
  const names = Object.keys(COVER_PRESETS) as CoverPreset[]
  return presetCover(names[Math.floor(Math.random() * names.length)] ?? 'peche')
}

/** Style CSS d'une couverture, ou null si la valeur n'est pas reconnue. */
export function coverStyle(coverUrl: string): CSSProperties | null {
  if (coverUrl.startsWith('preset:')) {
    const background = COVER_PRESETS[coverUrl.slice('preset:'.length) as CoverPreset]
    return background ? { background } : null
  }
  if (coverUrl.startsWith('https://')) {
    // JSON.stringify échappe guillemets et antislashs : l'adresse reste une simple chaîne CSS.
    return {
      backgroundImage: `url(${JSON.stringify(coverUrl)})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return null
}

/** Émojis proposés pour l'icône d'une page. */
export const PAGE_EMOJIS = [
  '📄',
  '📝',
  '📌',
  '📎',
  '📚',
  '📖',
  '🗂️',
  '🗃️',
  '📅',
  '🗓️',
  '✅',
  '☑️',
  '💡',
  '🎯',
  '🚀',
  '⭐',
  '🔥',
  '❤️',
  '🌱',
  '🌿',
  '🍀',
  '🌸',
  '🌻',
  '🍂',
  '🏠',
  '🏢',
  '🎓',
  '💼',
  '🧪',
  '🔬',
  '💻',
  '🛠️',
  '⚙️',
  '🎨',
  '🎵',
  '📷',
  '✈️',
  '🗺️',
  '🏔️',
  '🌊',
  '☕',
  '🍽️',
  '🏃',
  '🧘',
  '🐾',
  '👋',
  '🙂',
  '🤔',
] as const

export function randomEmoji(): string {
  return PAGE_EMOJIS[Math.floor(Math.random() * PAGE_EMOJIS.length)] ?? '📄'
}
