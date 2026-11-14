/** Les heures de Planifier (spec 6.17) : des instants UTC, montrés dans un fuseau choisi. */

export const DEVICE_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

/** Les fuseaux connus du navigateur ; celui donné en premier s'il n'y figure pas. */
export function timeZones(current: string): string[] {
  let zones: string[]
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    zones = []
  }
  return zones.includes(current) ? zones : [current, ...zones]
}

const parts = (iso: string | Date, timeZone: string, options: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', ...options })
      .formatToParts(typeof iso === 'string' ? new Date(iso) : iso)
      .map((part) => [part.type, part.value]),
  )

/** Le jour (AAAA-MM-JJ) d'un instant dans un fuseau. */
export function dayIn(iso: string | Date, timeZone: string): string {
  const p = parts(iso, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${p.year}-${p.month}-${p.day}`
}

/** L'heure (HH:MM) d'un instant dans un fuseau. */
export function timeIn(iso: string | Date, timeZone: string): string {
  const p = parts(iso, timeZone, { hour: '2-digit', minute: '2-digit' })
  return `${p.hour}:${p.minute}`
}

/** « lundi 16 novembre 2026 » (un jour AAAA-MM-JJ). */
export function longDay(day: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`))
}

/** « lundi 16 novembre 2026 à 14:00 – 14:30 », dans un fuseau. */
export function whenLabel(start: string, end: string, timeZone: string): string {
  return `${longDay(dayIn(start, timeZone))} à ${timeIn(start, timeZone)} – ${timeIn(end, timeZone)}`
}

/** Un instant UTC au format de l'API (sans millisecondes). */
export const isoUtc = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z')

/** Le nom d'un fuseau, lisible : « Europe/Brussels (UTC+01:00) ». */
export function zoneLabel(timeZone: string, at: Date = new Date()): string {
  try {
    const name = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value
    return name ? `${timeZone.replaceAll('_', ' ')} (${name.replace('GMT', 'UTC')})` : timeZone
  } catch {
    return timeZone
  }
}

export const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

export const minutesLabel = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : minutes % 60 === 0
      ? `${minutes / 60} h`
      : `${Math.floor(minutes / 60)} h ${minutes % 60}`
