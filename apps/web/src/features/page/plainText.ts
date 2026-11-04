import type { PageContent } from '@nonotion/shared'

/*
 * Corps provisoire de la page (phase 1) : du texte, une ligne par paragraphe, enregistré au format
 * BlockNote ({ type: "paragraph", content: "…" }) pour que l'éditeur de blocs de la phase 2
 * reprenne ces pages telles quelles.
 */

function inlineText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((item: unknown) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        const record = item as { text?: unknown; content?: unknown }
        return typeof record.text === 'string' ? record.text : inlineText(record.content)
      }
      return ''
    })
    .join('')
}

/** Le texte d'un document : une ligne par bloc, blocs imbriqués compris. */
export function blocksToText(content: PageContent): string {
  const lines: string[] = []
  const walk = (blocks: unknown[]) => {
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue
      const record = block as { content?: unknown; children?: unknown }
      lines.push(inlineText(record.content))
      if (Array.isArray(record.children)) walk(record.children)
    }
  }
  walk(content ?? [])
  return lines.join('\n')
}

/** Un paragraphe BlockNote par ligne ; un texte vide donne une page vide (null). */
export function textToBlocks(text: string): PageContent {
  if (text === '') return null
  return text.split('\n').map((line) => ({ type: 'paragraph', content: line }))
}
