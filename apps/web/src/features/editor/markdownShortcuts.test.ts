import { describe, expect, it } from 'vitest'
import {
  matchBlockShortcut,
  matchBlockShortcutAtStart,
  matchInlineShortcut,
} from './markdownShortcuts'

describe('raccourcis de bloc (spec 6.3b)', () => {
  it.each([
    ['# ', { type: 'heading', props: { level: 1 } }],
    ['## ', { type: 'heading', props: { level: 2 } }],
    ['### ', { type: 'heading', props: { level: 3 } }],
    ['- ', { type: 'bulletListItem' }],
    ['* ', { type: 'bulletListItem' }],
    ['1. ', { type: 'numberedListItem' }],
    ['12. ', { type: 'numberedListItem' }],
    ['[] ', { type: 'checkListItem', props: { checked: false } }],
    ['[x] ', { type: 'checkListItem', props: { checked: true } }],
    ['> ', { type: 'toggleListItem' }],
    ['" ', { type: 'quote' }],
    ['« ', { type: 'quote' }],
    ['“ ', { type: 'quote' }],
    ['---', { type: 'divider' }],
    ['``` ', { type: 'codeBlock', props: { language: 'text' } }],
    ['```js ', { type: 'codeBlock', props: { language: 'js' } }],
  ])('« %s »', (prefix, expected) => {
    expect(matchBlockShortcut(prefix)).toEqual(expected)
  })

  it('ne réagit qu’au début de la ligne, et seulement à un raccourci complet', () => {
    for (const prefix of ['#', 'a # ', ' #  ', '####', '#Titre', '--', '----', '1.', 'x. '])
      expect(matchBlockShortcut(prefix)).toBeNull()
  })
})

describe('raccourci de bloc suivi du mot tapé (clavier de téléphone)', () => {
  it('reconnaît le raccourci et sa longueur', () => {
    expect(matchBlockShortcutAtStart('# Titre')).toEqual({
      shortcut: { type: 'heading', props: { level: 1 } },
      length: 2,
    })
    expect(matchBlockShortcutAtStart('### Petit')?.length).toBe(4)
    expect(matchBlockShortcutAtStart('[] Lait')?.shortcut.type).toBe('checkListItem')
    expect(matchBlockShortcutAtStart('> Plus')?.shortcut.type).toBe('toggleListItem')
  })

  it('ignore le séparateur, le code et le texte ordinaire', () => {
    for (const text of ['---x', '``` x', 'Bonjour', '#Titre', '# ', 'a # b'])
      expect(matchBlockShortcutAtStart(text)).toBeNull()
  })
})

describe('styles en ligne (spec 6.3b)', () => {
  it('gras, italique, barré et code', () => {
    expect(matchInlineShortcut('Du **gras**')).toEqual({
      style: 'bold',
      marked: '**gras**',
      text: 'gras',
    })
    expect(matchInlineShortcut('un *mot*')).toEqual({
      style: 'italic',
      marked: '*mot*',
      text: 'mot',
    })
    expect(matchInlineShortcut('_mot_')).toEqual({ style: 'italic', marked: '_mot_', text: 'mot' })
    expect(matchInlineShortcut('~~non~~')).toEqual({
      style: 'strike',
      marked: '~~non~~',
      text: 'non',
    })
    expect(matchInlineShortcut('le `code`')).toEqual({
      style: 'code',
      marked: '`code`',
      text: 'code',
    })
    expect(matchInlineShortcut('**deux mots**')?.text).toBe('deux mots')
  })

  it('ne confond pas un calcul ni un balisage à moitié tapé avec un style', () => {
    for (const text of ['2 * 3 * 4', '**gras*', 'a**b**', '* x *', '**', 'snake_case_name', 'x``'])
      expect(matchInlineShortcut(text)).toBeNull()
  })
})
