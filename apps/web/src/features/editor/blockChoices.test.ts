import { describe, expect, it } from 'vitest'
import { BLOCK_CHOICES, filterChoices, normalizeQuery } from './blockChoices'

const titles = (query: string) => filterChoices(BLOCK_CHOICES, query).map((choice) => choice.title)

describe('filtre du menu « / »', () => {
  it('« titre » donne les trois titres, Titre 1 en premier', () => {
    expect(titles('titre')).toEqual(['Titre 1', 'Titre 2', 'Titre 3'])
  })

  it('resserre la liste à chaque lettre', () => {
    const counts = ['', 't', 'to', 'tod'].map((query) => titles(query).length)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    expect(titles('tod')).toEqual(['To-do'])
  })

  it('cherche aussi dans les mots-clés, en français et en anglais', () => {
    expect(titles('todo')).toEqual(['To-do'])
    expect(titles('checkbox')).toEqual(['To-do'])
    expect(titles('callout')).toEqual(['Encadré'])
    expect(titles('heading 2')).toEqual(['Titre 2'])
  })

  it('ignore les accents, la casse et les tirets', () => {
    expect(titles('separateur')).toEqual(['Séparateur'])
    expect(titles('ENCADRE')).toEqual(['Encadré'])
    expect(titles('to do')).toEqual(['To-do'])
  })

  it('dans un groupe, un titre qui commence par la saisie passe devant', () => {
    // « Citation » commence par « ci » ; « Encadré » ne correspond pas, aucun autre non plus.
    expect(titles('c')[0]).toBe('Citation')
    // « code » : le bloc de code est le seul dont le titre contient le mot.
    expect(titles('code')).toEqual(['Bloc de code'])
  })

  it('ne mélange jamais l’ordre des groupes', () => {
    const groups = filterChoices(BLOCK_CHOICES, 'e').map((choice) => choice.group)
    expect(groups).toEqual([...groups].sort((a, b) => (a === b ? 0 : a === 'Basique' ? -1 : 1)))
  })

  it('normalise une saisie', () => {
    expect(normalizeQuery('  Liste à Puces ')).toBe('listeapuces')
  })
})
