import type { DateValue, Repeat } from './properties'

/*
 * Les occurrences suivantes d'une date qui se répète (spec 6.7). Le serveur crée la suivante quand
 * la tâche est terminée (App\Support\Databases\Recurrence, mêmes règles) ; le calendrier montre
 * les prochaines à l'avance.
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** Ajoute « tous les N … » à une date ; « tous les mois » le 31 janvier donne le 28 février. */
function shiftParts(
  year: number,
  month: number,
  day: number,
  repeat: Pick<Repeat, 'unit' | 'interval'>,
): [number, number, number] {
  if (repeat.unit === 'day' || repeat.unit === 'week') {
    const date = new Date(Date.UTC(year, month - 1, day))
    date.setUTCDate(date.getUTCDate() + (repeat.unit === 'week' ? 7 : 1) * repeat.interval)
    return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
  }
  const months = month - 1 + (repeat.unit === 'year' ? 12 : 1) * repeat.interval
  const nextYear = year + Math.floor(months / 12)
  const nextMonth = (months % 12) + 1
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate()
  return [nextYear, nextMonth, Math.min(day, lastDay)]
}

/** Une journée (« AAAA-MM-JJ ») décalée, ou un instant décalé à la même heure locale. */
function shift(text: string, repeat: Repeat): string {
  if (!text.includes('T')) {
    const [y, m, d] = text.split('-').map(Number) as [number, number, number]
    const [ny, nm, nd] = shiftParts(y, m, d, repeat)
    return `${ny}-${pad(nm)}-${pad(nd)}`
  }
  const date = new Date(text)
  const [ny, nm, nd] = shiftParts(date.getFullYear(), date.getMonth() + 1, date.getDate(), repeat)
  return new Date(
    ny,
    nm - 1,
    nd,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ).toISOString()
}

/** Le jour (local) d'un début : « AAAA-MM-JJ ». */
function dayOf(text: string): string {
  if (!text.includes('T')) return text
  const date = new Date(text)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** L'occurrence suivante, ou null si la répétition est finie (date dépassée, dernière fois). */
export function nextOccurrence(value: DateValue): DateValue | null {
  const repeat = value.repeat
  if (!repeat) return null
  if (repeat.count != null && repeat.count <= 1) return null
  const start = shift(value.start, repeat)
  if (repeat.until && dayOf(start) > repeat.until) return null
  const next: DateValue = {
    ...value,
    start,
    ...(value.end ? { end: shift(value.end, repeat) } : {}),
  }
  if (repeat.count != null) next.repeat = { ...repeat, count: repeat.count - 1 }
  return next
}

/** Les occurrences à venir après celle-ci, jusqu'au jour `lastDay` inclus (au plus `max`). */
export function upcomingOccurrences(value: DateValue, lastDay: string, max = 100): DateValue[] {
  const result: DateValue[] = []
  let current = nextOccurrence(value)
  while (current && dayOf(current.start) <= lastDay && result.length < max) {
    result.push(current)
    current = nextOccurrence(current)
  }
  return result
}
