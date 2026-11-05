import { type Property, TITLE_PROPERTY_ID, type ViewConfig } from '@nonotion/shared'

export const DEFAULT_COLUMN_WIDTH = 180
export const TITLE_COLUMN_WIDTH = 260
export const MIN_COLUMN_WIDTH = 60

/**
 * Les colonnes d'une vue, dans l'ordre : celles de `visible_properties`, sinon toutes. Le Titre est
 * toujours affiché (il ouvre la ligne) ; une propriété supprimée entre-temps est ignorée.
 */
export function visibleColumns(schema: readonly Property[], config: ViewConfig): Property[] {
  const byId = new Map(schema.map((property) => [property.id, property]))
  const ids = config.visible_properties ?? schema.map((property) => property.id)
  const columns = ids.flatMap((id) => byId.get(id) ?? [])
  const title = schema.find((property) => property.type === 'title')
  return title && !columns.includes(title) ? [title, ...columns] : columns
}

export function columnWidth(property: Property, config: ViewConfig): number {
  return (
    config.property_widths?.[property.id] ??
    (property.id === TITLE_PROPERTY_ID || property.type === 'title'
      ? TITLE_COLUMN_WIDTH
      : DEFAULT_COLUMN_WIDTH)
  )
}

/** L'ordre des colonnes après avoir glissé `moved` à la place de `target`. */
export function moveColumn(ids: readonly string[], moved: string, target: string): string[] {
  const from = ids.indexOf(moved)
  const to = ids.indexOf(target)
  if (from < 0 || to < 0 || from === to) return [...ids]
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
