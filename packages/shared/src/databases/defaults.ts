import {
  OPTION_COLORS,
  type OptionColor,
  type Property,
  type PropertyOption,
  type PropertyType,
  type StatusOption,
} from './properties'
import type { ViewConfig, ViewType } from './views'

/** Libellés français des types de propriétés, dans l'ordre où on les propose. */
export const PROPERTY_TYPE_LABELS: Record<Exclude<PropertyType, 'title'>, string> = {
  text: 'Texte',
  number: 'Nombre',
  select: 'Sélection',
  multi_select: 'Sélection multiple',
  status: 'Statut',
  date: 'Date',
  checkbox: 'Case à cocher',
}

export const VIEW_TYPE_LABELS: Record<ViewType, string> = {
  table: 'Tableau',
  board: 'Board',
  list: 'Liste',
  calendar: 'Calendrier',
  gallery: 'Galerie',
}

/** Noms des teintes d'options, pour les menus « Couleur ». */
export const OPTION_COLOR_LABELS: Record<OptionColor, string> = {
  default: 'Par défaut',
  gray: 'Gris',
  brown: 'Marron',
  orange: 'Orange',
  yellow: 'Jaune',
  green: 'Vert',
  blue: 'Bleu',
  purple: 'Violet',
  pink: 'Rose',
  red: 'Rouge',
}

/** La teinte d'une nouvelle option : la première pas encore prise, puis on reprend le cycle. */
export function nextOptionColor(options: readonly PropertyOption[]): OptionColor {
  const used = new Set(options.map((option) => option.color))
  return (
    OPTION_COLORS.find((color) => color !== 'default' && !used.has(color)) ??
    OPTION_COLORS[(options.length % (OPTION_COLORS.length - 1)) + 1]!
  )
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Un identifiant court pour une propriété ou une option (unique dans sa base). */
export function newId(length = 8): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('')
}

/** Les trois statuts d'office (spec 4.3) : À faire, En cours, Terminé. */
export function defaultStatusOptions(): StatusOption[] {
  return [
    { id: newId(), name: 'À faire', color: 'gray', group: 'todo' },
    { id: newId(), name: 'En cours', color: 'blue', group: 'in_progress' },
    { id: newId(), name: 'Terminé', color: 'green', group: 'complete' },
  ]
}

/** Un nom libre dans la base : « Date », sinon « Date 2 », « Date 3 »… */
export function uniquePropertyName(schema: readonly Property[], wanted: string): string {
  const taken = new Set(schema.map((property) => property.name.toLowerCase()))
  if (!taken.has(wanted.toLowerCase())) return wanted
  for (let n = 2; ; n++) if (!taken.has(`${wanted} ${n}`.toLowerCase())) return `${wanted} ${n}`
}

/** Une nouvelle propriété du type voulu, avec un nom libre et ses options par défaut. */
export function newProperty(
  schema: readonly Property[],
  type: Exclude<PropertyType, 'title'>,
  name?: string,
): Property {
  const base = {
    id: newId(),
    name: uniquePropertyName(schema, name?.trim() || PROPERTY_TYPE_LABELS[type]),
  }
  if (type === 'status') return { ...base, type, options: defaultStatusOptions() }
  if (type === 'select' || type === 'multi_select') return { ...base, type, options: [] }
  return { ...base, type }
}

/**
 * La configuration de départ d'une nouvelle vue (spec 6.5) : un Board se regroupe par Statut
 * (ou à défaut par la première Sélection), un Calendrier se cale sur la première Date.
 */
export function defaultViewConfig(type: ViewType, schema: readonly Property[]): ViewConfig {
  if (type === 'board') {
    const groupBy =
      schema.find((property) => property.type === 'status') ??
      schema.find((property) => property.type === 'select')
    return groupBy ? { group_by: { property: groupBy.id } } : {}
  }
  if (type === 'calendar') {
    const date = schema.find((property) => property.type === 'date')
    return date ? { calendar_by: date.id } : {}
  }
  return {}
}

/** Le nom d'une nouvelle vue : celui de son type, numéroté s'il existe déjà. */
export function defaultViewName(type: ViewType, existing: readonly { name: string }[]): string {
  const label = VIEW_TYPE_LABELS[type]
  const taken = new Set(existing.map((view) => view.name.toLowerCase()))
  if (!taken.has(label.toLowerCase())) return label
  for (let n = 2; ; n++) if (!taken.has(`${label} ${n}`.toLowerCase())) return `${label} ${n}`
}
