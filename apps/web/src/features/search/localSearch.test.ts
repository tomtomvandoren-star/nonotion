import type { PageDetail } from '@nonotion/shared'
import { describe, expect, it } from 'vitest'
import { searchTerms } from './highlight'
import { documentText, searchPagesLocally } from './localSearch'

const page = (id: string, title: string, content: unknown[]): PageDetail =>
  ({
    id,
    title,
    icon: null,
    parent_page_id: null,
    is_favorite: false,
    position: 'a0',
    updated_at: null,
    workspace_id: 'w',
    cover_url: null,
    content,
    version: 1,
    created_at: null,
  }) as PageDetail

const paragraph = (...texts: string[]) => ({
  type: 'paragraph',
  content: texts.map((text) => ({ type: 'text', text, styles: {} })),
  children: [],
})

describe('recherche hors ligne', () => {
  it('lit le texte des blocs, des liens, des tableaux, des sous-blocs et des fichiers', () => {
    const text = documentText([
      paragraph('Bon', 'jour'),
      {
        type: 'paragraph',
        content: [{ type: 'link', href: 'https://x', content: [{ type: 'text', text: 'lien' }] }],
        children: [paragraph('enfant')],
      },
      {
        type: 'table',
        content: { type: 'tableContent', rows: [{ cells: [[{ type: 'text', text: 'cellule' }]] }] },
      },
      { type: 'image', props: { name: 'plage.png', caption: 'Été à Nice' }, children: [] },
    ])
    expect(text.split('\n')).toEqual([
      'Bonjour',
      'lien',
      'enfant',
      'cellule',
      'plage.png',
      'Été à Nice',
    ])
  })

  it('trouve une page par un mot de son texte, sans accents ni majuscules, avec un extrait', () => {
    const pages = [
      page('a', 'Courses', [paragraph('Acheter du pain')]),
      page('b', 'Voyage', [paragraph('Une semaine à la plage, en été, avec Léa.')]),
    ]
    const results = searchPagesLocally(pages, searchTerms('ete lea'), () => null)
    expect(results.map((item) => item.id)).toEqual(['b'])
    expect(results[0]!.excerpt).toContain('en été, avec Léa')
  })

  it('les titres qui correspondent d’abord', () => {
    const pages = [
      page('a', 'Notes', [paragraph('Penser au budget')]),
      page('b', 'Budget 2027', [paragraph('Tableau')]),
    ]
    expect(
      searchPagesLocally(pages, searchTerms('budget'), (item) => `dans ${item.id}`).map((item) => [
        item.id,
        item.context,
      ]),
    ).toEqual([
      ['b', 'dans b'],
      ['a', 'dans a'],
    ])
  })
})
