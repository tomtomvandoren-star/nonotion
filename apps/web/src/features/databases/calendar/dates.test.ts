import type { DatabaseRowData, DateValue } from '@nonotion/shared'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  calendarItem,
  daysBetween,
  layoutRow,
  layoutTimed,
  monthWeeks,
  moveToDay,
  moveToTime,
  periodLabel,
  resizeTo,
  snapMinutes,
  weekDays,
} from './dates'

// Les heures locales de ces tests sont celles de Bruxelles (UTC+1 l'hiver, UTC+2 l'été) : voir
// `test.env` dans vite.config.ts.

const row = (id: string, position = id): DatabaseRowData => ({
  id,
  title: id,
  icon: null,
  properties: {},
  position,
  created_at: null,
  updated_at: null,
})
const item = (id: string, value: DateValue) => calendarItem(row(id), value)

describe('jours', () => {
  it('compte et décale les jours, même au changement d’heure', () => {
    expect(addDays('2027-03-27', 2)).toBe('2027-03-29')
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
  })

  it('une semaine commence le lundi ; le mois est couvert par des semaines entières', () => {
    expect(weekDays('2026-11-05')[0]).toBe('2026-11-02')
    const weeks = monthWeeks('2026-11-05')
    expect(weeks[0]![0]).toBe('2026-10-26')
    // Le 30 novembre 2026 est un lundi : une sixième rangée.
    expect(weeks.at(-1)!.at(-1)).toBe('2026-12-06')
    expect(weeks).toHaveLength(6)
    expect(monthWeeks('2027-02-10')).toHaveLength(4)
  })

  it('nomme la période en français', () => {
    expect(periodLabel('month', '2026-11-05')).toBe('novembre 2026')
    expect(periodLabel('week', '2026-11-05')).toBe('2 nov. – 8 nov. 2026')
  })
})

describe('placement', () => {
  it('une plage est une barre sur plusieurs jours ; les autres prennent la ligne suivante', () => {
    const days = weekDays('2026-11-02')
    const segments = layoutRow(
      [
        item('court', { start: '2026-11-03' }),
        item('long', { start: '2026-10-30', end: '2026-11-04' }),
        item('après', { start: '2026-11-05' }),
      ],
      days,
    )
    expect(
      segments.map((s) => [s.item.row.id, s.startCol, s.endCol, s.lane, s.continuesBefore]),
    ).toEqual([
      ['long', 0, 2, 0, true],
      ['court', 1, 1, 1, false],
      ['après', 3, 3, 0, false],
    ])
  })

  it('une heure de 22 h à minuit tient sur un seul jour', () => {
    const late = item('tard', {
      start: '2026-11-05T21:00:00.000Z',
      end: '2026-11-05T23:00:00.000Z',
    })
    expect([late.startDay, late.endDay]).toEqual(['2026-11-05', '2026-11-05'])
  })

  it('des événements qui se chevauchent se partagent la largeur', () => {
    const placed = layoutTimed([
      { id: 'a', top: 540, bottom: 600 },
      { id: 'b', top: 570, bottom: 630 },
      { id: 'c', top: 700, bottom: 760 },
    ])
    expect(placed.map((e) => [e.id, e.col, e.cols])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
    ])
  })
})

describe('glisser et redimensionner', () => {
  it('une journée entière ou une plage glisse d’un bloc', () => {
    expect(moveToDay({ start: '2026-11-05', end: '2026-11-07' }, '2026-11-10')).toMatchObject({
      start: '2026-11-10',
      end: '2026-11-12',
    })
  })

  it('une heure glisse sur un autre jour à la même heure locale, même après le changement d’heure', () => {
    // 9 h à Bruxelles en hiver (8 h UTC), puis 9 h à Bruxelles en été (7 h UTC).
    const moved = moveToDay(
      { start: '2027-03-25T08:00:00.000Z', end: '2027-03-25T09:00:00.000Z' },
      '2027-03-29',
    )
    expect(moved).toMatchObject({
      start: '2027-03-29T07:00:00.000Z',
      end: '2027-03-29T08:00:00.000Z',
      time_zone: 'Europe/Brussels',
    })
  })

  it('sur la grille des heures, l’événement prend l’heure visée et garde sa durée', () => {
    expect(
      moveToTime(
        { start: '2026-11-05T08:00:00.000Z', end: '2026-11-05T09:30:00.000Z' },
        '2026-11-06',
        14 * 60,
      ),
    ).toMatchObject({ start: '2026-11-06T13:00:00.000Z', end: '2026-11-06T14:30:00.000Z' })
  })

  it('tirer le bord change la fin, jamais avant le début', () => {
    expect(resizeTo({ start: '2026-11-05' }, '2026-11-08').end).toBe('2026-11-08')
    expect(resizeTo({ start: '2026-11-05', end: '2026-11-08' }, '2026-11-03').end).toBeNull()
    expect(resizeTo({ start: '2026-11-05T08:00:00.000Z' }, '2026-11-05', 9 * 60).end).toBe(
      '2026-11-05T08:15:00.000Z',
    )
  })

  it('arrondit au quart d’heure', () => {
    expect(snapMinutes(68)).toBe(75)
    expect(snapMinutes(-20)).toBe(0)
    expect(snapMinutes(24 * 60 + 5)).toBe(24 * 60 - 15)
  })
})
