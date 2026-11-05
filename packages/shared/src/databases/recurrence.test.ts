import { describe, expect, it } from 'vitest'
import { isValidValue, type Property } from './properties'
import { nextOccurrence, upcomingOccurrences } from './recurrence'
import { repeatLabel } from './tasks'

const date: Property = { id: 'd', name: 'Date', type: 'date' }

describe('répéter jusqu’à une date ou un nombre de fois (spec 6.7)', () => {
  it('sans fin : une occurrence après l’autre', () => {
    expect(nextOccurrence({ start: '2026-11-05', repeat: { unit: 'week', interval: 1 } })).toEqual({
      start: '2026-11-12',
      repeat: { unit: 'week', interval: 1 },
    })
  })

  it('jusqu’à une date, incluse', () => {
    const value = {
      start: '2026-11-05',
      repeat: { unit: 'week' as const, interval: 1, until: '2026-11-19' },
    }
    expect(upcomingOccurrences(value, '2027-12-31').map((v) => v.start)).toEqual([
      '2026-11-12',
      '2026-11-19',
    ])
  })

  it('un nombre de fois : celle-ci comprise, la dernière n’a pas de suite', () => {
    const value = { start: '2026-11-30', repeat: { unit: 'month' as const, interval: 1, count: 3 } }
    const next = upcomingOccurrences(value, '2027-12-31')
    expect(next.map((v) => [v.start, v.repeat?.count])).toEqual([
      ['2026-12-30', 2],
      ['2027-01-30', 1],
    ])
    expect(nextOccurrence(next[1]!)).toBeNull()
  })

  it('une plage garde sa durée', () => {
    expect(
      nextOccurrence({
        start: '2026-11-05',
        end: '2026-11-06',
        repeat: { unit: 'day', interval: 2 },
      }),
    ).toMatchObject({ start: '2026-11-07', end: '2026-11-08' })
  })

  it('valide la fin d’une répétition', () => {
    const repeat = (extra: object) => ({
      start: '2026-11-05',
      repeat: { unit: 'day', interval: 1, ...extra },
    })
    expect(isValidValue(date, repeat({ until: '2026-12-31' }))).toBe(true)
    expect(isValidValue(date, repeat({ count: 5 }))).toBe(true)
    expect(isValidValue(date, repeat({ until: '2026-12-31', count: 5 }))).toBe(false)
    expect(isValidValue(date, repeat({ count: 0 }))).toBe(false)
  })

  it('se lit en français, avec sa fin', () => {
    expect(repeatLabel({ unit: 'week', interval: 1, until: '2026-12-31' })).toBe(
      'Toutes les semaines, jusqu’au 31 déc. 2026',
    )
    expect(repeatLabel({ unit: 'day', interval: 2, count: 4 })).toBe(
      'Tous les 2 jours, encore 4 fois',
    )
    expect(repeatLabel({ unit: 'day', interval: 1, count: 1 })).toBe(
      'Tous les jours, dernière fois',
    )
  })
})
