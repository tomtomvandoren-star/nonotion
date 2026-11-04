import { describe, expect, it } from 'vitest'
import { blocksToText, textToBlocks } from './plainText'

describe('corps de page en texte simple', () => {
  it('enregistre une ligne par paragraphe BlockNote, espaces compris', () => {
    expect(textToBlocks('Bonjour \n\nMonde')).toEqual([
      { type: 'paragraph', content: 'Bonjour ' },
      { type: 'paragraph', content: '' },
      { type: 'paragraph', content: 'Monde' },
    ])
    expect(textToBlocks('')).toBeNull()
  })

  it('relit un document BlockNote, y compris liens et blocs imbriqués', () => {
    const text = blocksToText([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Voir ' },
          { type: 'link', content: [{ type: 'text', text: 'ici' }] },
        ],
      },
      { type: 'heading', content: 'Titre', children: [{ type: 'paragraph', content: 'Dedans' }] },
    ])
    expect(text).toBe('Voir ici\nTitre\nDedans')
  })

  it('fait l’aller-retour sans perte', () => {
    const original = 'Ligne 1\nLigne 2'
    expect(blocksToText(textToBlocks(original))).toBe(original)
  })
})
