import type { PageDetail, SearchResult } from '@nonotion/shared'
import { excerptAround, matchesAll } from './highlight'

/*
 * La recherche hors ligne (spec 6.16) : dans le titre et le texte des pages gardées sur l'appareil,
 * comme la recherche plein texte du serveur, avec un extrait.
 */

type Item = Pick<SearchResult, 'id' | 'title' | 'icon' | 'context' | 'excerpt'>

/** Le texte d'un bloc en ligne : ses morceaux (un lien a lui-même un contenu). */
function inlineText(items: unknown): string {
  if (!Array.isArray(items)) return ''
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const node = item as { text?: unknown; content?: unknown }
      return typeof node.text === 'string' ? node.text : inlineText(node.content)
    })
    .join('')
}

/** Le texte d'un document BlockNote : chaque bloc, ses cellules de tableau, ses sous-blocs. */
export function documentText(content: unknown): string {
  const lines: string[] = []
  const walk = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue
      const {
        content: inline,
        children,
        props,
      } = block as {
        content?: unknown
        children?: unknown
        props?: { name?: unknown; caption?: unknown }
      }
      if (Array.isArray(inline)) lines.push(inlineText(inline))
      else if (inline && typeof inline === 'object' && 'rows' in inline)
        for (const row of (inline as { rows?: { cells?: unknown[] }[] }).rows ?? [])
          for (const cell of row.cells ?? [])
            lines.push(
              inlineText(Array.isArray(cell) ? cell : (cell as { content?: unknown })?.content),
            )
      // Le nom et la légende d'un fichier se cherchent aussi.
      for (const value of [props?.name, props?.caption])
        if (typeof value === 'string' && value) lines.push(value)
      walk(children)
    }
  }
  walk(content)
  return lines.filter(Boolean).join('\n')
}

/**
 * Les pages dont le titre ou le texte contient tous les mots cherchés : celles dont le titre
 * correspond d'abord, au plus `limit`.
 */
export function searchPagesLocally(
  pages: readonly PageDetail[],
  terms: readonly string[],
  contextOf: (page: PageDetail) => string | null,
  limit = 20,
): Item[] {
  if (terms.length === 0) return []
  const inTitle: Item[] = []
  const inText: Item[] = []
  for (const page of pages) {
    const text = documentText(page.content)
    if (!matchesAll(`${page.title}\n${text}`, terms)) continue
    ;(matchesAll(page.title, terms) ? inTitle : inText).push({
      id: page.id,
      title: page.title,
      icon: page.icon,
      context: contextOf(page),
      excerpt: excerptAround(text, terms),
    })
  }
  return [...inTitle, ...inText].slice(0, limit)
}
