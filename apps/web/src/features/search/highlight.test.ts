import { describe, expect, it } from 'vitest'
import { highlight, matchesAll, searchTerms } from './highlight'

describe('surlignage de la recherche (spec 6.12)', () => {
  it('ignore les majuscules et les accents', () => {
    expect(searchTerms('Été  ÉCOLE')).toEqual(['ete', 'ecole'])
    expect(highlight('Rentrée de l’été', ['ete'])).toEqual([
      { text: 'Rentrée de l’', match: false },
      { text: 'été', match: true },
    ])
  })

  it('marque chaque mot, même plusieurs fois', () => {
    expect(
      highlight('projet : budget du projet', searchTerms('projet budget'))
        .filter((s) => s.match)
        .map((s) => s.text),
    ).toEqual(['projet', 'budget', 'projet'])
  })

  it('garde les caractères qui ne se replient pas (œ, émoji)', () => {
    expect(
      highlight('Œufs 🥚 frais', ['frais'])
        .map((s) => s.text)
        .join(''),
    ).toBe('Œufs 🥚 frais')
  })

  it('un titre doit contenir tous les mots', () => {
    expect(matchesAll('Réunion de projet', searchTerms('proj réu'))).toBe(true)
    expect(matchesAll('Réunion de projet', searchTerms('projet budget'))).toBe(false)
    expect(matchesAll('Réunion', [])).toBe(false)
  })
})
