import type { Property, PropertyWithOptions } from '@nonotion/shared'

/** « 12,5 » ou « 12.5 » ; vide = pas de valeur ; autre chose = invalide (la valeur ne change pas). */
export function parseNumber(text: string): number | null | undefined {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.')
  if (cleaned === '') return null
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : undefined
}

export function isOptionProperty(property: Property): property is PropertyWithOptions {
  return (
    property.type === 'select' || property.type === 'multi_select' || property.type === 'status'
  )
}
