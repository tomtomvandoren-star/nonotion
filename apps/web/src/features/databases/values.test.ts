import { describe, expect, it } from 'vitest'
import { parseNumber } from './values'

describe('saisie d’un nombre', () => {
  it('accepte la virgule française et les espaces de milliers', () => {
    expect(parseNumber('12,5')).toBe(12.5)
    expect(parseNumber('1 200')).toBe(1200)
    expect(parseNumber('-3')).toBe(-3)
  })

  it('vide = pas de valeur ; autre chose = invalide', () => {
    expect(parseNumber('  ')).toBeNull()
    expect(parseNumber('douze')).toBeUndefined()
  })
})
