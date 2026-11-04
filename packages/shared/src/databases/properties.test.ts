import { describe, expect, it } from 'vitest'
import fixture from '../../fixtures/property-values.json'
import { databaseSchemaSchema, isValidValue, type Property, propertySchema } from './properties'

const properties = fixture.properties as Record<string, Property>

describe('valeurs des propriétés (mêmes exemples que l’API)', () => {
  it.each(
    fixture.cases.map((c) => [c.property, JSON.stringify(c.value), c.valid, c.value] as const),
  )('%s = %s → %s', (name, _shown, valid, value) => {
    expect(isValidValue(properties[name]!, value)).toBe(valid)
  })
})

describe('définition des propriétés', () => {
  it('accepte chaque propriété d’exemple', () => {
    for (const property of Object.values(properties))
      expect(propertySchema.safeParse(property).success).toBe(true)
  })

  it('une base a exactement un Titre et des identifiants uniques', () => {
    const title = { id: 'title', name: 'Nom', type: 'title' }
    const text = { id: 'txt', name: 'Notes', type: 'text' }
    expect(databaseSchemaSchema.safeParse([title, text]).success).toBe(true)
    expect(databaseSchemaSchema.safeParse([text]).success).toBe(false)
    expect(databaseSchemaSchema.safeParse([title, title]).success).toBe(false)
    expect(databaseSchemaSchema.safeParse([title, text, { ...text, name: 'Autre' }]).success).toBe(
      false,
    )
  })

  it('refuse une couleur ou un groupe de statut inconnus', () => {
    expect(
      propertySchema.safeParse({
        id: 'p',
        name: 'P',
        type: 'select',
        options: [{ id: 'x', name: 'X', color: 'fuchsia' }],
      }).success,
    ).toBe(false)
    expect(
      propertySchema.safeParse({
        id: 's',
        name: 'S',
        type: 'status',
        options: [{ id: 'x', name: 'X', color: 'gray', group: 'later' }],
      }).success,
    ).toBe(false)
  })
})
