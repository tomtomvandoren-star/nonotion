import { describe, expect, it } from 'vitest'
import { diffVersions } from './conflictDiff'

const paragraph = (id: string, text: string, children: unknown[] = []) => ({
  id,
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text, styles: {} }],
  children,
})

describe('Gestion de conflit : ce qui diffère entre les deux versions', () => {
  it('bloc ajouté de mon côté, bloc modifié des deux, bloc seulement sur le serveur', () => {
    const mine = [
      paragraph('a', 'Liste de courses'),
      paragraph('b', 'Pain, lait'),
      paragraph('c', 'Œufs'),
    ]
    const server = [
      paragraph('a', 'Liste de courses'),
      paragraph('b', 'Pain'),
      paragraph('d', 'Beurre'),
    ]

    const diff = diffVersions(mine, server)

    expect([...diff.mine]).toEqual([
      ['b', 'changed'],
      ['c', 'added'],
    ])
    expect([...diff.server]).toEqual([
      ['b', 'changed'],
      ['d', 'only-server'],
    ])
    expect(diff.changes).toBe(3)
  })

  it('compare aussi les blocs imbriqués, et le type d’un bloc', () => {
    const mine = [paragraph('a', 'Projet', [paragraph('a1', 'Étape 1')])]
    const server = [
      { ...paragraph('a', 'Projet', [paragraph('a1', 'Étape 1 faite')]), type: 'heading' },
    ]

    const diff = diffVersions(mine, server)

    expect(diff.mine.get('a')).toBe('changed')
    expect(diff.mine.get('a1')).toBe('changed')
  })

  it('deux versions identiques, ou vides : rien à signaler', () => {
    expect(diffVersions([paragraph('a', 'x')], [paragraph('a', 'x')]).changes).toBe(0)
    expect(diffVersions(null, []).changes).toBe(0)
  })
})
