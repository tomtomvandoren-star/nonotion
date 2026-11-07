import type { DatabaseDetail, DatabaseRowData } from '@nonotion/shared'
import { describe, expect, it } from 'vitest'
import { MAX_REMINDERS, taskReminders } from './reminders'

/*
 * Les rappels des tâches (phase 10). Les heures locales sont celles de Bruxelles (vite.config.ts).
 */

const NOW = new Date('2026-11-07T10:00:00Z') // 11 h à Bruxelles

const row = (
  id: string,
  title: string,
  properties: Record<string, unknown>,
  extra: Partial<DatabaseRowData> = {},
): DatabaseRowData => ({
  id,
  title,
  icon: null,
  properties,
  position: 'a0',
  created_at: null,
  updated_at: null,
  ...extra,
})

function tasks(rows: DatabaseRowData[], title = 'Tâches'): DatabaseDetail {
  return {
    id: 'base',
    workspace_id: 'ws',
    page_id: 'page',
    title,
    schema: [
      { id: 'title', name: 'Nom', type: 'title' },
      {
        id: 'status',
        name: 'Statut',
        type: 'status',
        options: [
          { id: 'todo', name: 'À faire', color: 'gray', group: 'todo' },
          { id: 'done', name: 'Terminé', color: 'green', group: 'complete' },
        ],
      },
      { id: 'due', name: 'Échéance', type: 'date' },
    ],
    views: [],
    rows,
    sources: [],
  } as unknown as DatabaseDetail
}

describe('taskReminders', () => {
  it('à l’heure de l’échéance, ou à 9 h pour une journée entière ; jamais pour le passé', () => {
    const reminders = taskReminders(
      [
        {
          database: tasks([
            row('a', 'Dentiste', { status: 'todo', due: { start: '2026-11-08T13:30:00Z' } }),
            row('b', 'Courses', { status: 'todo', due: { start: '2026-11-09' } }),
            row('c', 'Hier', { status: 'todo', due: { start: '2026-11-06' } }),
            // Aujourd'hui, mais 9 h est déjà passé.
            row('d', 'Ce matin', { status: 'todo', due: { start: '2026-11-07' } }),
          ]),
          dateProperty: 'due',
        },
      ],
      NOW,
    )
    expect(reminders.map((r) => [r.pageId, r.at.toISOString(), r.body])).toEqual([
      ['a', '2026-11-08T13:30:00.000Z', 'À 14:30 · Tâches'],
      ['b', '2026-11-09T08:00:00.000Z', 'Aujourd’hui · Tâches'],
    ])
    expect(reminders[0]!.title).toBe('Dentiste')
  })

  it('ni tâche faite, ni sans date, ni au-delà de 30 jours, ni événement importé, ni base sans Statut', () => {
    const plain = {
      ...tasks([row('e', 'Note', { due: { start: '2026-11-08' } })]),
      schema: [{ id: 'due', name: 'Date', type: 'date' }],
    } as unknown as DatabaseDetail
    const reminders = taskReminders(
      [
        {
          database: tasks([
            row('f', 'Faite', { status: 'done', due: { start: '2026-11-08' } }),
            row('g', 'Sans date', { status: 'todo' }),
            row('h', 'Plus tard', { status: 'todo', due: { start: '2027-01-15' } }),
            row(
              'i',
              'Réunion importée',
              { status: 'todo', due: { start: '2026-11-08' } },
              { calendar_source_id: 'ics' },
            ),
          ]),
          dateProperty: 'due',
        },
        { database: plain, dateProperty: 'due' },
      ],
      NOW,
    )
    expect(reminders).toEqual([])
  })

  it('les plus proches d’abord, 50 au plus ; un identifiant stable et positif', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      row(`t${i}`, `Tâche ${i}`, {
        status: 'todo',
        due: { start: `2026-11-${String(8 + (i % 20)).padStart(2, '0')}T0${i % 10}:00:00Z` },
      }),
    )
    const first = taskReminders([{ database: tasks(many), dateProperty: 'due' }], NOW)
    const again = taskReminders([{ database: tasks(many), dateProperty: 'due' }], NOW)
    expect(first).toHaveLength(MAX_REMINDERS)
    expect(first.map((r) => r.at.getTime())).toEqual(
      [...first.map((r) => r.at.getTime())].sort((a, b) => a - b),
    )
    expect(first.map((r) => r.id)).toEqual(again.map((r) => r.id))
    expect(first.every((r) => Number.isInteger(r.id) && r.id > 0 && r.id < 2 ** 31)).toBe(true)
  })
})
