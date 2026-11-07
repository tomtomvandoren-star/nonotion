import {
  completionProperty,
  type DatabaseDetail,
  dateValueSchema,
  hasTime,
  isDone,
} from '@nonotion/shared'
import type { Reminder } from '@/platform'

/** Au plus 50 rappels programmés à la fois (iOS n'en garde que 64). */
export const MAX_REMINDERS = 50
/** Les rappels des 30 prochains jours : les suivants sont programmés au fil des ouvertures. */
const HORIZON_DAYS = 30
/** Une tâche d'une journée entière : rappel à 9 h, le jour même. */
const ALL_DAY_HOUR = 9

const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** Un entier positif stable (FNV-1a) : le même rappel garde le même identifiant. */
function reminderId(key: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % 0x7fffffff || 1
}

/**
 * Les rappels des tâches (spec 9, phase 10) : chaque tâche pas encore faite, d'une base qui a un
 * Statut, avec une échéance dans les 30 prochains jours. À l'heure de l'échéance si elle en a une,
 * sinon à 9 h le jour même. Un événement importé d'un agenda n'est pas une tâche.
 */
export function taskReminders(
  bases: readonly { database: DatabaseDetail; dateProperty: string }[],
  now: Date,
): Reminder[] {
  const horizon = now.getTime() + HORIZON_DAYS * 86_400_000
  const reminders: Reminder[] = []
  for (const { database, dateProperty } of bases) {
    const status = completionProperty(database.schema)
    if (!status) continue
    for (const row of database.rows) {
      if (row.calendar_source_id || isDone(row, status)) continue
      const parsed = dateValueSchema.safeParse(row.properties[dateProperty])
      if (!parsed.success) continue
      const value = parsed.data
      const timed = hasTime(value)
      let at: Date
      if (timed) at = new Date(value.start)
      else {
        const [year, month, day] = value.start.split('-').map(Number) as [number, number, number]
        at = new Date(year, month - 1, day, ALL_DAY_HOUR)
      }
      if (at.getTime() <= now.getTime() || at.getTime() > horizon) continue
      const where = database.title || 'Sans titre'
      reminders.push({
        id: reminderId(`${row.id}@${at.toISOString()}`),
        pageId: row.id,
        title: row.title || 'Sans titre',
        body: timed ? `À ${timeFormat.format(at)} · ${where}` : `Aujourd’hui · ${where}`,
        at,
      })
    }
  }
  return reminders.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_REMINDERS)
}
