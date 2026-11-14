import type { DatabaseDetail } from '@nonotion/shared'
import { describe, expect, it } from 'vitest'
import { endRowPosition, localRow, localViewCopy, withPropertyChange } from './localChanges'

/*
 * Hors ligne (spec 6.16), l'écran montre tout de suite ce que le serveur ferait d'une modification
 * de base : mêmes règles que l'API.
 */

const base = (): DatabaseDetail =>
  ({
    id: 'db',
    workspace_id: 'ws',
    page_id: 'page',
    title: 'Tâches',
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
    views: [
      {
        id: 'v1',
        database_id: 'db',
        name: 'Tableau',
        type: 'table',
        position: 'a0',
        config: {
          visible_properties: ['status', 'due'],
          sorts: [{ property: 'due', direction: 'asc' }],
          filters: { operator: 'and', rules: [{ property: 'due', op: 'is_not_empty' }] },
          property_widths: { due: 120 },
        },
      },
      {
        id: 'v2',
        database_id: 'db',
        name: 'Calendrier',
        type: 'calendar',
        position: 'a1',
        config: { calendar_by: 'due' },
      },
    ],
    rows: [
      {
        id: 'r1',
        title: 'Pain',
        icon: null,
        properties: { status: 'todo', due: { start: '2026-11-20' } },
        position: 'a0',
        created_at: null,
        updated_at: null,
      },
    ],
    sources: [],
  }) as unknown as DatabaseDetail

describe('changements de base faits sur l’appareil', () => {
  it('supprimer une propriété : schéma, valeurs des lignes et vues, comme le serveur', () => {
    const next = withPropertyChange(base(), { kind: 'delete', propertyId: 'due' })

    expect(next.schema.map((property) => property.id)).toEqual(['title', 'status'])
    expect(next.rows[0]!.properties).toEqual({ status: 'todo' })
    expect(next.views[0]!.config).toEqual({
      visible_properties: ['status'],
      sorts: [],
      filters: { operator: 'and', rules: [] },
      property_widths: {},
    })
    expect(next.views[1]!.config.calendar_by).toBeNull()
  })

  it('ajouter une propriété : elle rejoint les vues qui choisissent leurs colonnes', () => {
    const next = withPropertyChange(base(), {
      kind: 'add',
      property: { id: 'notes', name: 'Notes', type: 'text' },
    })
    expect(next.schema.at(-1)!.id).toBe('notes')
    expect(next.views[0]!.config.visible_properties).toEqual(['status', 'due', 'notes'])
    expect(next.views[1]!.config.visible_properties).toBeUndefined()
  })

  it('une ligne créée hors ligne : en fin de base, Statut « À faire » par défaut', () => {
    const database = base()
    const position = endRowPosition(database)
    expect(position > 'a0').toBe(true)
    const row = localRow(database, { id: 'r2', title: 'Lait', position })
    expect(row).toMatchObject({ id: 'r2', title: 'Lait', properties: { status: 'todo' } })
    expect(
      localRow(database, { id: 'r3', position, properties: { status: 'done' } }).properties,
    ).toEqual({ status: 'done' })
  })

  it('la copie d’une vue se place juste après elle', () => {
    const copy = localViewCopy(base(), 'v1', 'v3')!
    expect(copy).toMatchObject({ id: 'v3', name: 'Tableau (copie)', type: 'table' })
    expect(copy.position > 'a0' && copy.position < 'a1').toBe(true)
  })
})
