import type { PageTreeItem } from '@nonotion/shared'
import { describe, expect, it } from 'vitest'
import {
  dropZoneAt,
  indexTree,
  isSelfOrDescendant,
  pathTo,
  resolveDrop,
  visibleRows,
  type Move,
  type TreeIndex,
} from './tree'

function page(id: string, parent: string | null, position: string): PageTreeItem {
  return {
    id,
    parent_page_id: parent,
    title: id,
    icon: null,
    is_favorite: false,
    position,
    updated_at: null,
  }
}

// A ─ A1 ─ A1a      B      C
//   └ A2
const pages = [
  page('C', null, 'a2'),
  page('A', null, 'a0'),
  page('A2', 'A', 'a1'),
  page('A1', 'A', 'a0'),
  page('A1a', 'A1', 'a0'),
  page('B', null, 'a1'),
]

/** Applique un déplacement, pour vérifier l'ordre obtenu. */
function apply(index: TreeIndex, id: string, move: Move | null): TreeIndex {
  if (!move) throw new Error('déplacement refusé')
  const moved = [...index.byId.values()].map((p) =>
    p.id === id ? { ...p, parent_page_id: move.parentId, position: move.position } : p,
  )
  return indexTree(moved)
}

const titlesUnder = (index: TreeIndex, parent: string | null) =>
  (index.children.get(parent) ?? []).map((p) => p.id)

describe('indexTree', () => {
  it('range les enfants par position, sur trois niveaux', () => {
    const index = indexTree(pages)
    expect(titlesUnder(index, null)).toEqual(['A', 'B', 'C'])
    expect(titlesUnder(index, 'A')).toEqual(['A1', 'A2'])
    expect(titlesUnder(index, 'A1')).toEqual(['A1a'])
  })

  it('affiche à la racine une page dont la parente est absente', () => {
    const index = indexTree([page('orpheline', 'inconnue', 'a0')])
    expect(titlesUnder(index, null)).toEqual(['orpheline'])
  })
})

describe('visibleRows', () => {
  it('ne montre que les pages dont les ancêtres sont dépliés, avec leur profondeur', () => {
    const index = indexTree(pages)
    expect(visibleRows(index, {}).map((r) => r.page.id)).toEqual(['A', 'B', 'C'])

    const rows = visibleRows(index, { A: true, A1: true })
    expect(rows.map((r) => [r.page.id, r.depth])).toEqual([
      ['A', 0],
      ['A1', 1],
      ['A1a', 2],
      ['A2', 1],
      ['B', 0],
      ['C', 0],
    ])
  })
})

describe('pathTo', () => {
  it('donne le fil d’Ariane de la racine à la page', () => {
    expect(pathTo(indexTree(pages), 'A1a').map((p) => p.id)).toEqual(['A', 'A1', 'A1a'])
  })
})

describe('dropZoneAt', () => {
  it('découpe la ligne en avant / dedans / après', () => {
    expect(dropZoneAt(0.1)).toBe('before')
    expect(dropZoneAt(0.5)).toBe('inside')
    expect(dropZoneAt(0.9)).toBe('after')
  })
})

describe('resolveDrop', () => {
  const index = indexTree(pages)

  it('réordonne entre deux sœurs', () => {
    const next = apply(index, 'C', resolveDrop(index, 'C', 'B', 'before', {}))
    expect(titlesUnder(next, null)).toEqual(['A', 'C', 'B'])
  })

  it('place après la dernière page', () => {
    const next = apply(index, 'A', resolveDrop(index, 'A', 'C', 'after', {}))
    expect(titlesUnder(next, null)).toEqual(['B', 'C', 'A'])
  })

  it('fait d’une page l’enfant de la ligne visée (dépôt au milieu)', () => {
    const next = apply(index, 'C', resolveDrop(index, 'C', 'B', 'inside', {}))
    expect(titlesUnder(next, 'B')).toEqual(['C'])
    expect(titlesUnder(next, null)).toEqual(['A', 'B'])
  })

  it('remonte une sous-page à la racine', () => {
    const next = apply(
      index,
      'A1a',
      resolveDrop(index, 'A1a', 'B', 'before', { A: true, A1: true }),
    )
    expect(titlesUnder(next, null)).toEqual(['A', 'A1a', 'B', 'C'])
    expect(titlesUnder(next, 'A1')).toEqual([])
  })

  it('met en tête des enfants quand on dépose sous une page dépliée', () => {
    const next = apply(index, 'B', resolveDrop(index, 'B', 'A', 'after', { A: true }))
    expect(titlesUnder(next, 'A')).toEqual(['B', 'A1', 'A2'])
  })

  it('refuse toute boucle : une page ne va ni en elle-même ni dans ses descendantes', () => {
    expect(resolveDrop(index, 'A', 'A', 'inside', {})).toBeNull()
    expect(resolveDrop(index, 'A', 'A1', 'inside', {})).toBeNull()
    expect(resolveDrop(index, 'A', 'A1a', 'before', { A: true, A1: true })).toBeNull()
    expect(isSelfOrDescendant(index, 'A', 'A1a')).toBe(true)
  })

  it('ignore un dépôt qui ne change rien', () => {
    expect(resolveDrop(index, 'B', 'A', 'after', {})).toBeNull()
    expect(resolveDrop(index, 'B', 'C', 'before', {})).toBeNull()
  })
})
