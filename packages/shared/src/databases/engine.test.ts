import { describe, expect, it } from 'vitest'
import {
  applyView,
  type DatabaseRow,
  type EngineContext,
  groupRows,
  matchesFilters,
  prefillFromFilters,
  prefillFromGroup,
  sortRows,
  todayIn,
} from './engine'
import type { Property } from './properties'

const schema: Property[] = [
  { id: 'title', name: 'Nom', type: 'title' },
  {
    id: 'st',
    name: 'Statut',
    type: 'status',
    options: [
      { id: 'todo', name: 'À faire', color: 'gray', group: 'todo' },
      { id: 'doing', name: 'En cours', color: 'blue', group: 'in_progress' },
      { id: 'done', name: 'Terminé', color: 'green', group: 'complete' },
    ],
  },
  { id: 'due', name: 'Échéance', type: 'date' },
  { id: 'price', name: 'Prix', type: 'number' },
  { id: 'ok', name: 'Vérifié', type: 'checkbox' },
  {
    id: 'tags',
    name: 'Étiquettes',
    type: 'multi_select',
    options: [
      { id: 'work', name: 'Travail', color: 'blue' },
      { id: 'home', name: 'Maison', color: 'green' },
    ],
  },
  { id: 'notes', name: 'Notes', type: 'text' },
]

const ctx: EngineContext = { today: '2026-11-05', timeZone: 'Europe/Brussels' }

const row = (
  id: string,
  title: string,
  properties: Record<string, unknown> = {},
  position = id,
): DatabaseRow => ({ id, title, properties, position })

const rows = [
  row('a', 'Rapport', { st: 'todo', due: { start: '2026-11-04' }, price: 30 }),
  row('b', 'Courses', { st: 'done', due: { start: '2026-11-03' }, price: 12 }),
  row('c', 'Dentiste', { st: 'doing', due: { start: '2026-11-05' }, tags: ['home'] }),
  row('d', 'Vacances', { st: 'todo', due: { start: '2026-12-20', end: '2026-12-27' } }),
  row('e', 'Idée', { tags: ['work', 'home'], notes: 'À creuser' }),
  // 23 h 30 à Bruxelles le 5 novembre, soit 22 h 30 UTC : c'est bien « aujourd'hui » là-bas.
  row('f', 'Appel', { st: 'todo', due: { start: '2026-11-05T22:30:00Z' }, ok: true }),
]

const ids = (list: DatabaseRow[]) => list.map((r) => r.id)

describe('filtres (spec 6.6)', () => {
  it('critère : Statut ≠ Terminé ET Échéance ≤ aujourd’hui', () => {
    const result = applyView(
      rows,
      schema,
      {
        filters: {
          operator: 'and',
          rules: [
            { property: 'st', op: 'is_not', value: 'done' },
            { property: 'due', op: 'on_or_before', value: 'today' },
          ],
        },
      },
      ctx,
    )
    // « Courses » est terminée, « Vacances » est plus tard, « Idée » n'a pas de date.
    expect(ids(result)).toEqual(['a', 'c', 'f'])
  })

  it('un instant compte dans le fuseau de l’utilisateur', () => {
    const tomorrowInTokyo = applyView(
      rows,
      schema,
      { filters: { operator: 'and', rules: [{ property: 'due', op: 'is', value: 'tomorrow' }] } },
      { today: '2026-11-05', timeZone: 'Asia/Tokyo' },
    )
    expect(ids(tomorrowInTokyo)).toEqual(['f'])
  })

  it('une plage de dates contient les jours entre son début et sa fin', () => {
    const match = (value: string) =>
      matchesFilters(
        rows[3]!,
        schema,
        { operator: 'and', rules: [{ property: 'due', op: 'is', value }] },
        ctx,
      )
    expect(match('2026-12-24')).toBe(true)
    expect(match('2026-12-28')).toBe(false)
  })

  it('OU garde les lignes qui passent au moins une règle', () => {
    const result = applyView(
      rows,
      schema,
      {
        filters: {
          operator: 'or',
          rules: [
            { property: 'st', op: 'is', value: 'done' },
            { property: 'tags', op: 'contains', value: 'work' },
          ],
        },
      },
      ctx,
    )
    expect(ids(result)).toEqual(['b', 'e'])
  })

  it('texte sans accent ni casse, nombres, cases et vides', () => {
    const only = (rule: Record<string, unknown>) =>
      ids(applyView(rows, schema, { filters: { operator: 'and', rules: [rule as never] } }, ctx))
    expect(only({ property: 'title', op: 'contains', value: 'IDEE' })).toEqual(['e'])
    expect(only({ property: 'notes', op: 'starts_with', value: 'a cr' })).toEqual(['e'])
    expect(only({ property: 'price', op: 'greater_than', value: 20 })).toEqual(['a'])
    expect(only({ property: 'price', op: 'is_empty' })).toEqual(['c', 'd', 'e', 'f'])
    expect(only({ property: 'ok', op: 'is', value: true })).toEqual(['f'])
    expect(only({ property: 'ok', op: 'is', value: false })).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(only({ property: 'tags', op: 'does_not_contain', value: 'home' })).toEqual([
      'a',
      'b',
      'd',
      'f',
    ])
  })

  it('une règle pas encore remplie, ou sur une propriété supprimée, ne filtre rien', () => {
    for (const rule of [
      { property: 'st', op: 'is' },
      { property: 'price', op: 'equals', value: '' },
      { property: 'gone', op: 'is', value: 'x' },
      { property: 'st', op: 'is', value: 'unknown-option' },
    ])
      expect(
        applyView(rows, schema, { filters: { operator: 'and', rules: [rule as never] } }, ctx),
      ).toHaveLength(rows.length)
  })

  it('la recherche porte sur le titre', () => {
    expect(ids(applyView(rows, schema, {}, ctx, 'dent'))).toEqual(['c'])
  })
})

describe('tris', () => {
  it('par date croissante, les vides à la fin', () => {
    expect(ids(sortRows(rows, schema, [{ property: 'due', direction: 'asc' }], ctx))).toEqual([
      'b',
      'a',
      'c',
      'f',
      'd',
      'e',
    ])
  })

  it('les vides restent à la fin même en ordre décroissant', () => {
    expect(ids(sortRows(rows, schema, [{ property: 'price', direction: 'desc' }], ctx))).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ])
  })

  it('plusieurs règles, dans l’ordre ; un statut se trie dans l’ordre de ses options', () => {
    const result = sortRows(
      rows,
      schema,
      [
        { property: 'st', direction: 'asc' },
        { property: 'title', direction: 'desc' },
      ],
      ctx,
    )
    expect(ids(result)).toEqual(['d', 'a', 'f', 'c', 'b', 'e'])
  })

  it('sans règle, l’ordre manuel', () => {
    const shuffled = [row('x', 'X', {}, 'a2'), row('y', 'Y', {}, 'a0'), row('z', 'Z', {}, 'a1')]
    expect(ids(sortRows(shuffled, schema, [], ctx))).toEqual(['y', 'z', 'x'])
  })
})

describe('regroupement', () => {
  it('une section par option, « Sans … » seulement s’il y a des lignes sans valeur', () => {
    const groups = groupRows(rows, schema, { property: 'st' })!
    expect(groups.map((g) => [g.key, g.label, ids(g.rows)])).toEqual([
      [null, 'Sans Statut', ['e']],
      ['todo', 'À faire', ['a', 'd', 'f']],
      ['doing', 'En cours', ['c']],
      ['done', 'Terminé', ['b']],
    ])
  })

  it('une ligne à plusieurs étiquettes apparaît dans chacune ; hide_empty masque les vides', () => {
    const groups = groupRows(rows.slice(0, 3), schema, { property: 'tags', hide_empty: true })!
    expect(groups.map((g) => [g.key, ids(g.rows)])).toEqual([
      [null, ['a', 'b']],
      ['home', ['c']],
    ])
  })

  it('par case à cocher, et pas par un type qui ne se regroupe pas', () => {
    expect(groupRows(rows, schema, { property: 'ok' })!.map((g) => g.rows.length)).toEqual([1, 5])
    expect(groupRows(rows, schema, { property: 'price' })).toBeNull()
    expect(groupRows(rows, schema, null)).toBeNull()
  })
})

describe('le « + » hérite du contexte', () => {
  it('« Nouveau » dans une vue filtrée sur Statut = En cours crée une tâche en cours', () => {
    const filters = {
      operator: 'and' as const,
      rules: [
        { property: 'st', op: 'is' as const, value: 'doing' },
        { property: 'tags', op: 'contains' as const, value: 'work' },
        { property: 'due', op: 'is' as const, value: 'today' },
        { property: 'price', op: 'greater_than' as const, value: 3 },
      ],
    }
    expect(prefillFromFilters(schema, filters, ctx)).toEqual({
      st: 'doing',
      tags: ['work'],
      due: { start: '2026-11-05' },
    })
  })

  it('un filtre OU à plusieurs règles ne fixe rien', () => {
    expect(
      prefillFromFilters(
        schema,
        {
          operator: 'or',
          rules: [
            { property: 'st', op: 'is', value: 'doing' },
            { property: 'st', op: 'is', value: 'todo' },
          ],
        },
        ctx,
      ),
    ).toEqual({})
  })

  it('le « + » d’une section range l’élément dans cette section', () => {
    expect(prefillFromGroup(schema, { property: 'st' }, 'doing')).toEqual({ st: 'doing' })
    expect(prefillFromGroup(schema, { property: 'tags' }, 'home')).toEqual({ tags: ['home'] })
    expect(prefillFromGroup(schema, { property: 'ok' }, 'true')).toEqual({ ok: true })
    expect(prefillFromGroup(schema, { property: 'st' }, null)).toEqual({})
  })
})

describe('aujourd’hui', () => {
  it('dépend du fuseau', () => {
    const now = new Date('2026-11-05T23:30:00Z')
    expect(todayIn('Europe/Brussels', now)).toBe('2026-11-06')
    expect(todayIn('America/New_York', now)).toBe('2026-11-05')
  })
})
