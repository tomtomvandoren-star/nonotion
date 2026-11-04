import { describe, expect, it } from 'vitest'
import { comparePositions, positionBetween } from './position'

describe('positionBetween', () => {
  it('produit les mêmes clés que le serveur (valeurs de tests/Unit/FractionalIndexTest.php)', () => {
    expect(positionBetween(null, null)).toBe('a0')
    expect(positionBetween('a0', null)).toBe('a1')
    expect(positionBetween(null, 'a0')).toBe('Zz')
    expect(positionBetween('a0', 'a1')).toBe('a0V')
    expect(positionBetween('az', null)).toBe('b00')
  })

  it('reste triable entre deux voisines', () => {
    const key = positionBetween('a0', 'a0V')
    expect(comparePositions('a0', key)).toBe(-1)
    expect(comparePositions(key, 'a0V')).toBe(-1)
  })

  it('se place après deux voisines de même clé au lieu d’échouer', () => {
    expect(positionBetween('a1', 'a1')).toBe('a2')
  })
})
