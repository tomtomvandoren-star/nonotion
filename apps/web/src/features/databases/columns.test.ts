import type { Property } from '@nonotion/shared'
import { describe, expect, it } from 'vitest'
import { columnWidth, moveColumn, visibleColumns } from './columns'

const schema: Property[] = [
  { id: 'title', name: 'Nom', type: 'title' },
  { id: 'a', name: 'A', type: 'text' },
  { id: 'b', name: 'B', type: 'number' },
]

describe('colonnes d’une vue', () => {
  it('toutes, dans l’ordre du schéma, tant que la vue ne les liste pas', () => {
    expect(visibleColumns(schema, {}).map((p) => p.id)).toEqual(['title', 'a', 'b'])
  })

  it('celles de la vue, dans son ordre ; le Titre toujours là ; les disparues ignorées', () => {
    expect(visibleColumns(schema, { visible_properties: ['b', 'gone'] }).map((p) => p.id)).toEqual([
      'title',
      'b',
    ])
    expect(visibleColumns(schema, { visible_properties: ['b', 'title'] }).map((p) => p.id)).toEqual(
      ['b', 'title'],
    )
  })

  it('largeur enregistrée, sinon par défaut', () => {
    expect(columnWidth(schema[1]!, { property_widths: { a: 320 } })).toBe(320)
    expect(columnWidth(schema[0]!, {})).toBe(260)
    expect(columnWidth(schema[2]!, {})).toBe(180)
  })

  it('glisser une colonne la met à la place de la cible', () => {
    expect(moveColumn(['title', 'a', 'b'], 'b', 'title')).toEqual(['b', 'title', 'a'])
    expect(moveColumn(['title', 'a', 'b'], 'title', 'b')).toEqual(['a', 'b', 'title'])
    expect(moveColumn(['title', 'a'], 'x', 'a')).toEqual(['title', 'a'])
  })
})
