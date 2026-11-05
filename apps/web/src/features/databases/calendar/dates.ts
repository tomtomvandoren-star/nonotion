import {
  type CalendarMode,
  type DatabaseDetail,
  type DatabaseRowData,
  type DateValue,
  hasTime,
  type Property,
} from '@nonotion/shared'

/*
 * Le calcul du calendrier (spec 6.8), sans affichage. Une journée entière (« 2026-11-05 ») n'est
 * jamais convertie de fuseau ; une heure est un instant UTC, montré dans le fuseau de l'appareil.
 */

/** Un jour local, « AAAA-MM-JJ ». */
export type Day = string

export type DateProperty = Extract<Property, { type: 'date' }>

/** La propriété Date qui place les éléments (`calendar_by`), si elle existe encore. */
export function calendarProperty(
  database: DatabaseDetail,
  calendarBy: string | null | undefined,
): DateProperty | undefined {
  return database.schema.find(
    (property): property is DateProperty => property.id === calendarBy && property.type === 'date',
  )
}

export const DEVICE_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

const pad = (n: number) => String(n).padStart(2, '0')

/** Le jour local d'un instant. */
export const dayOf = (date: Date): Day =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** L'heure locale d'un instant, « HH:MM ». */
export const timeOf = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

/** Minuit local d'un jour. */
export function parseDay(day: Day): Date {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, date)
}

// L'arithmétique des jours se fait en UTC : pas de journée de 23 h au changement d'heure.
function utc(day: Day): number {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, date)
}
const fromUtc = (ms: number): Day => new Date(ms).toISOString().slice(0, 10)

export const addDays = (day: Day, days: number): Day => fromUtc(utc(day) + days * 86_400_000)

/** Combien de jours de `from` à `to` (négatif si `to` est avant). */
export const daysBetween = (from: Day, to: Day) => Math.round((utc(to) - utc(from)) / 86_400_000)

/** Lundi = 0 … dimanche = 6 : la semaine commence le lundi. */
export const weekdayIndex = (day: Day) => (new Date(utc(day)).getUTCDay() + 6) % 7

export const startOfWeek = (day: Day) => addDays(day, -weekdayIndex(day))

/** Le même jour, `months` mois plus tard (le 31 janvier + 1 mois donne le 28 février). */
export function addMonths(day: Day, months: number): Day {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const first = new Date(Date.UTC(year, month - 1 + months, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return fromUtc(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(date, last)))
}

/** Les semaines (de 7 jours, lundi en tête) qui couvrent le mois du jour donné. */
export function monthWeeks(anchor: Day): Day[][] {
  const first = `${anchor.slice(0, 7)}-01`
  const last = addDays(addMonths(first, 1), -1)
  const weeks: Day[][] = []
  for (let start = startOfWeek(first); start <= last; start = addDays(start, 7))
    weeks.push(weekDays(start))
  return weeks
}

/** Les 7 jours de la semaine du jour donné. */
export const weekDays = (anchor: Day): Day[] =>
  Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))

/** Un jour local et des minutes depuis minuit, en instant UTC. */
export function instantAt(day: Day, minutes: number): string {
  const date = parseDay(day)
  date.setMinutes(minutes)
  return date.toISOString()
}

export const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes()

/** Un élément tel que le calendrier le place : ses jours (inclus) et, s'il a une heure, ses instants. */
export type CalendarItem = {
  /** Unique dans le calendrier : la ligne, et pour une répétition à venir, sa date. */
  key: string
  row: DatabaseRowData
  value: DateValue
  /** Une répétition à venir (spec 6.7) : affichée d'avance, elle n'existe pas encore. */
  ghost: boolean
  allDay: boolean
  startDay: Day
  endDay: Day
  start: Date | null
  end: Date | null
}

export function calendarItem(row: DatabaseRowData, value: DateValue, ghost = false): CalendarItem {
  const key = ghost ? `${row.id}@${value.start}` : row.id
  if (!hasTime(value)) {
    const endDay = value.end && value.end > value.start ? value.end : value.start
    return {
      key,
      row,
      value,
      ghost,
      allDay: true,
      startDay: value.start,
      endDay,
      start: null,
      end: null,
    }
  }
  const start = new Date(value.start)
  const end = value.end ? new Date(value.end) : start
  // Une fin à minuit pile appartient encore à la veille (22 h → minuit tient sur un jour).
  const lastMoment = end > start ? new Date(end.getTime() - 1) : start
  return {
    key,
    row,
    value,
    ghost,
    allDay: false,
    startDay: dayOf(start),
    endDay: dayOf(lastMoment),
    start,
    end,
  }
}

/** L'élément touche-t-il la période (jours inclus) ? */
export const overlaps = (item: CalendarItem, from: Day, to: Day) =>
  item.startDay <= to && item.endDay >= from

/** Ordre d'affichage dans un jour : journées entières et plages d'abord, puis par heure. */
export function compareItems(a: CalendarItem, b: CalendarItem): number {
  const spanA = daysBetween(a.startDay, a.endDay)
  const spanB = daysBetween(b.startDay, b.endDay)
  return (
    a.startDay.localeCompare(b.startDay) ||
    Number(!(a.allDay || spanA > 0)) - Number(!(b.allDay || spanB > 0)) ||
    spanB - spanA ||
    (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0) ||
    a.row.position.localeCompare(b.row.position)
  )
}

/** Un morceau d'élément dans une rangée de 7 jours, sur sa ligne (lane). */
export type Segment = {
  item: CalendarItem
  /** Colonnes de début et de fin, incluses (0 = lundi). */
  startCol: number
  endCol: number
  lane: number
  /** L'élément commence avant cette rangée, ou finit après. */
  continuesBefore: boolean
  continuesAfter: boolean
}

/**
 * Place les éléments d'une rangée de jours sur des lignes, sans chevauchement : une plage de dates
 * est une barre qui s'étire sur plusieurs jours (spec 6.8).
 */
export function layoutRow(items: readonly CalendarItem[], days: readonly Day[]): Segment[] {
  const first = days[0]!
  const last = days[days.length - 1]!
  const lanes: number[] = []
  const segments: Segment[] = []
  for (const item of [...items].filter((i) => overlaps(i, first, last)).sort(compareItems)) {
    const startCol = Math.max(0, daysBetween(first, item.startDay))
    const endCol = Math.min(days.length - 1, daysBetween(first, item.endDay))
    let lane = lanes.findIndex((lastCol) => lastCol < startCol)
    if (lane === -1) lane = lanes.length
    lanes[lane] = endCol
    segments.push({
      item,
      startCol,
      endCol,
      lane,
      continuesBefore: item.startDay < first,
      continuesAfter: item.endDay > last,
    })
  }
  return segments
}

/**
 * Les événements à heure d'une journée, côte à côte quand ils se chevauchent : chacun reçoit sa
 * colonne et le nombre de colonnes de son groupe.
 */
export function layoutTimed<T extends { top: number; bottom: number }>(
  events: readonly T[],
): (T & { col: number; cols: number })[] {
  const sorted = [...events].sort((a, b) => a.top - b.top || b.bottom - a.bottom)
  const placed: (T & { col: number; cols: number })[] = []
  let group: (T & { col: number; cols: number })[] = []
  let groupEnd = -Infinity
  const close = () => {
    const cols = Math.max(1, ...group.map((event) => event.col + 1))
    for (const event of group) event.cols = cols
    group = []
  }
  for (const event of sorted) {
    if (event.top >= groupEnd) close()
    const taken = new Set(
      group.filter((other) => other.bottom > event.top).map((other) => other.col),
    )
    let col = 0
    while (taken.has(col)) col++
    const entry = { ...event, col, cols: 1 }
    group.push(entry)
    placed.push(entry)
    groupEnd = Math.max(groupEnd, event.bottom)
  }
  close()
  return placed
}

/** Une valeur qui garde ses autres champs (répétition) ; une heure prend le fuseau de l'appareil. */
function withTimes(value: DateValue, start: string, end: string | null | undefined): DateValue {
  const timed = start.includes('T')
  return {
    ...value,
    start,
    end: end ?? null,
    ...(timed ? { time_zone: DEVICE_TIME_ZONE } : { time_zone: null }),
  }
}

/** Glissée sur un autre jour (vue mois) : même heure, même durée (spec 6.8). */
export function moveToDay(value: DateValue, day: Day): DateValue {
  if (!hasTime(value)) {
    const shift = daysBetween(value.start, day)
    return withTimes(value, day, value.end ? addDays(value.end, shift) : null)
  }
  const start = new Date(value.start)
  const minutes = minutesOf(start)
  const nextStart = instantAt(day, minutes)
  const duration = value.end ? Date.parse(value.end) - start.getTime() : null
  return withTimes(
    value,
    nextStart,
    duration === null ? null : new Date(Date.parse(nextStart) + duration).toISOString(),
  )
}

/** Glissée sur la grille des heures (vue semaine) : ce jour, cette heure, même durée. */
export function moveToTime(value: DateValue, day: Day, minutes: number): DateValue {
  const start = instantAt(day, minutes)
  const duration =
    hasTime(value) && value.end ? Date.parse(value.end) - Date.parse(value.start) : 60 * 60_000
  return withTimes(value, start, new Date(Date.parse(start) + duration).toISOString())
}

/** Le bord tiré jusqu'à ce jour (et cette heure) : la fin change, jamais avant le début. */
export function resizeTo(value: DateValue, day: Day, minutes?: number): DateValue {
  if (!hasTime(value)) {
    const end = day > value.start ? day : null
    return withTimes(value, value.start, end)
  }
  const earliest = Date.parse(value.start) + 15 * 60_000
  const end = Math.max(Date.parse(instantAt(day, minutes ?? 24 * 60)), earliest)
  return withTimes(value, value.start, new Date(end).toISOString())
}

/** Arrondi au quart d'heure, dans la journée. */
export const snapMinutes = (minutes: number) =>
  Math.min(24 * 60 - 15, Math.max(0, Math.round(minutes / 15) * 15))

const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const shortFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const longFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** « novembre 2026 », pour une semaine « 2 – 8 nov. 2026 », pour un jour « jeudi 5 novembre 2026 ». */
export function periodLabel(mode: CalendarMode, anchor: Day): string {
  if (mode === 'month') return monthFormat.format(parseDay(anchor))
  if (mode === 'day') return dayLabel(anchor)
  const days = weekDays(anchor)
  const first = parseDay(days[0]!)
  const last = parseDay(days[6]!)
  return `${shortFormat.format(first)} – ${shortFormat.format(last)} ${last.getFullYear()}`
}

/** « jeudi 5 novembre 2026 ». */
export function dayLabel(day: Day): string {
  return longFormat.format(parseDay(day))
}

/** Les jours qu'affiche un calendrier : le mois (semaines entières), la semaine ou le jour. */
export function visibleDays(mode: CalendarMode, anchor: Day): Day[] {
  if (mode === 'day') return [anchor]
  return mode === 'week' ? weekDays(anchor) : monthWeeks(anchor).flat()
}
