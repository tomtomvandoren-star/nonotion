import type { DateValue, Property, PropertyWithOptions } from '@nonotion/shared'

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

const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** « New York » pour « America/New_York ». */
export const zoneName = (zone: string) => (zone.split('/').at(-1) ?? zone).replaceAll('_', ' ')

/** L'heure telle qu'elle a été saisie, dans son fuseau d'origine : « 08:30 à New York ». */
export function originalTime(value: DateValue): string {
  if (!value.time_zone || !value.start.includes('T')) return ''
  try {
    const time = new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: value.time_zone,
    }).format(new Date(value.start))
    return `${time} à ${zoneName(value.time_zone)}`
  } catch {
    // Un fuseau que ce navigateur ne connaît pas.
    return zoneName(value.time_zone)
  }
}

/** « 5 nov. 2026 », « 5 nov. 2026 14:30 », « 5 nov. 2026 → 7 nov. 2026 ». */
export function formatDate(value: DateValue): string {
  const one = (text: string) => {
    if (!text.includes('T')) {
      const [year, month, day] = text.split('-').map(Number) as [number, number, number]
      // Journée entière : jamais convertie de fuseau (spec 6.8).
      return dayFormat.format(new Date(year, month - 1, day))
    }
    const date = new Date(text)
    return `${dayFormat.format(date)} ${timeFormat.format(date)}`
  }
  return value.end ? `${one(value.start)} → ${one(value.end)}` : one(value.start)
}
