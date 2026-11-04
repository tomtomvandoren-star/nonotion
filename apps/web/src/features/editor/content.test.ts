import { describe, expect, it } from 'vitest'
import { toEditorContent, withoutIds } from './content'

const known = new Set(['paragraph', 'heading', 'checkListItem'])

describe('toEditorContent', () => {
  it('une page vide s’ouvre sans contenu imposé', () => {
    expect(toEditorContent(null, known)).toBeUndefined()
    expect(toEditorContent([], known)).toBeUndefined()
  })

  it('garde tel quel un document que l’éditeur connaît', () => {
    const content = [
      { id: 'a', type: 'checkListItem', props: { checked: true }, content: 'Fait', children: [] },
    ]
    expect(toEditorContent(content, known)).toEqual(content)
  })

  it('reprend les pages de la phase 1 (paragraphes en texte simple)', () => {
    expect(toEditorContent([{ type: 'paragraph', content: 'Bonjour' }], known)).toEqual([
      { type: 'paragraph', content: 'Bonjour', children: [] },
    ])
  })

  it('un type inconnu devient un paragraphe qui garde son texte, enfants compris', () => {
    const content = [
      {
        type: 'bloc-du-futur',
        props: { x: 1 },
        content: [{ type: 'text', text: 'Lisible' }],
        children: [{ type: 'autre-inconnu', content: { rows: [] } }],
      },
    ]
    expect(toEditorContent(content, known)).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Lisible' }],
        children: [{ type: 'paragraph', children: [] }],
      },
    ])
  })

  it('ramène un niveau de titre hors limites au titre 3', () => {
    const [heading] = toEditorContent(
      [{ type: 'heading', props: { level: 5 }, content: 'X' }],
      known,
    )!
    expect(heading?.props).toEqual({ level: 3 })
  })
})

describe('withoutIds', () => {
  it('retire les identifiants du bloc et de tous ses enfants', () => {
    const block = {
      id: '1',
      type: 'paragraph',
      children: [{ id: '2', type: 'paragraph', children: [{ id: '3', type: 'paragraph' }] }],
    }
    expect(withoutIds(block)).toEqual({
      type: 'paragraph',
      children: [{ type: 'paragraph', children: [{ type: 'paragraph', children: [] }] }],
    })
    expect(block.id).toBe('1')
  })
})
