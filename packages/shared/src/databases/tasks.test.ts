import { describe, expect, it } from 'vitest'
import { groupRows } from './engine'
import type { Property } from './properties'
import { boardGroupable, completionProperty, completionValue, isDone, repeatLabel } from './tasks'

const status = {
  id: 'st',
  name: 'Statut',
  type: 'status',
  options: [
    { id: 'todo', name: 'À faire', color: 'gray', group: 'todo' },
    { id: 'doing', name: 'En cours', color: 'blue', group: 'in_progress' },
    { id: 'done', name: 'Terminé', color: 'green', group: 'complete' },
  ],
} as const satisfies Property

const schema: Property[] = [{ id: 'title', name: 'Nom', type: 'title' }, status]
const row = (id: string, st?: string) => ({ id, title: id, position: id, properties: { st } })

describe('case de complétion (spec 6.7)', () => {
  it('pilote le premier Statut de la base', () => {
    expect(completionProperty(schema)?.id).toBe('st')
    expect(completionProperty([schema[0]!])).toBeUndefined()
  })

  it('cocher met le premier « Terminé », décocher le premier « À faire »', () => {
    expect(completionValue(status, true)).toBe('done')
    expect(completionValue(status, false)).toBe('todo')
  })

  it('une tâche est faite quand son statut est dans le groupe Terminé', () => {
    expect(isDone(row('a', 'done'), status)).toBe(true)
    expect(isDone(row('b', 'doing'), status)).toBe(false)
    expect(isDone(row('c'), status)).toBe(false)
  })
})

describe('Board (spec 6.11)', () => {
  it('se regroupe par Statut, Sélection ou Sélection multiple', () => {
    expect(boardGroupable(schema).map((p) => p.id)).toEqual(['st'])
  })

  it('montre toujours la colonne « Sans Statut », sauf si on la masque', () => {
    const rows = [row('a', 'todo')]
    expect(
      groupRows(rows, schema, { property: 'st' }, { alwaysShowEmpty: true })!.map((g) => g.key),
    ).toEqual([null, 'todo', 'doing', 'done'])
    expect(
      groupRows(
        rows,
        schema,
        { property: 'st', hidden: [':empty', 'done'] },
        { alwaysShowEmpty: true },
      )!.map((g) => g.key),
    ).toEqual(['todo', 'doing'])
  })
})

describe('récurrence (spec 6.7)', () => {
  it('se lit en français', () => {
    expect(repeatLabel({ unit: 'day', interval: 1 })).toBe('Tous les jours')
    expect(repeatLabel({ unit: 'week', interval: 1 })).toBe('Toutes les semaines')
    expect(repeatLabel({ unit: 'week', interval: 2 })).toBe('Toutes les 2 semaines')
    expect(repeatLabel({ unit: 'month', interval: 3 })).toBe('Tous les 3 mois')
    expect(repeatLabel({ unit: 'year', interval: 1 })).toBe('Tous les ans')
  })
})
