/*
 * Les raccourcis Markdown de la spec 6.3b, sous forme de fonctions pures : elles disent quel bloc
 * ou quel style le texte tapé appelle. BlockNote les applique déjà au clavier physique ; ces
 * fonctions servent au filet de sécurité des claviers virtuels (voir markdownFallback.ts).
 */

export type BlockShortcut = {
  type: string
  props?: Record<string, string | number | boolean>
}

/** Raccourcis de bloc : ils portent sur tout le début de la ligne, jusqu'au curseur. */
const BLOCK_SHORTCUTS: [RegExp, (match: RegExpMatchArray) => BlockShortcut][] = [
  [/^#\s$/, () => ({ type: 'heading', props: { level: 1 } })],
  [/^##\s$/, () => ({ type: 'heading', props: { level: 2 } })],
  [/^###\s$/, () => ({ type: 'heading', props: { level: 3 } })],
  [/^[-+*]\s$/, () => ({ type: 'bulletListItem' })],
  [/^\d+\.\s$/, () => ({ type: 'numberedListItem' })],
  [/^\[\s*\]\s$/, () => ({ type: 'checkListItem', props: { checked: false } })],
  [/^\[[xX]\]\s$/, () => ({ type: 'checkListItem', props: { checked: true } })],
  // Comme dans Notion : « > » donne une liste dépliable, un guillemet (droit ou typographique) une citation.
  [/^>\s$/, () => ({ type: 'toggleListItem' })],
  [/^\p{Quotation_Mark}\s$/u, () => ({ type: 'quote' })],
  [/^---$/, () => ({ type: 'divider' })],
  [
    /^```([\w+#-]*)\s$/,
    (match) => ({ type: 'codeBlock', props: { language: match[1] || 'text' } }),
  ],
]

/** Le bloc qu'appelle le début de ligne `prefix` (le texte avant le curseur), ou null. */
export function matchBlockShortcut(prefix: string): BlockShortcut | null {
  for (const [pattern, toBlock] of BLOCK_SHORTCUTS) {
    const match = prefix.match(pattern)
    if (match) return toBlock(match)
  }
  return null
}

/**
 * Un raccourci de bloc au début d'un texte qui continue (« # Titre ») : le clavier d'un téléphone
 * peut livrer le raccourci et le mot suivant d'un seul coup. Le séparateur et le bloc de code ne
 * sont pas concernés : ils ne gardent pas le texte qui suit.
 */
export function matchBlockShortcutAtStart(
  text: string,
): { shortcut: BlockShortcut; length: number } | null {
  for (let length = 2; length <= Math.min(5, text.length - 1); length++) {
    const shortcut = matchBlockShortcut(text.slice(0, length))
    if (shortcut && shortcut.type !== 'divider' && shortcut.type !== 'codeBlock')
      return { shortcut, length }
  }
  return null
}

export type InlineStyle = 'bold' | 'italic' | 'strike' | 'code'

export type InlineShortcut = {
  style: InlineStyle
  /** Le texte balisé à remplacer, juste avant le curseur (ex. « **gras** »). */
  marked: string
  /** Le texte qui reste, mis en forme (ex. « gras »). */
  text: string
}

/*
 * Styles en ligne : le balisage doit être précédé d'un début de ligne ou d'un espace, et ne pas
 * commencer ni finir par une espace (« 2 * 3 * 4 » n'est pas de l'italique). Le gras passe avant
 * l'italique, sinon « **x** » serait lu comme de l'italique.
 */
const INLINE_SHORTCUTS: [RegExp, InlineStyle][] = [
  [/(?:^|\s)(\*\*([^*\s](?:[^*]*[^*\s])?)\*\*)$/, 'bold'],
  [/(?:^|\s)(__([^_\s](?:[^_]*[^_\s])?)__)$/, 'bold'],
  [/(?:^|\s)(\*([^*\s](?:[^*]*[^*\s])?)\*)$/, 'italic'],
  [/(?:^|\s)(_([^_\s](?:[^_]*[^_\s])?)_)$/, 'italic'],
  [/(?:^|\s)(~~([^~\s](?:[^~]*[^~\s])?)~~)$/, 'strike'],
  [/(?:^|[^`])(`([^`]+)`)$/, 'code'],
]

/** Le style qu'appelle la fin du texte avant le curseur, ou null. */
export function matchInlineShortcut(textBefore: string): InlineShortcut | null {
  for (const [pattern, style] of INLINE_SHORTCUTS) {
    const match = textBefore.match(pattern)
    if (match?.[1] && match[2]) return { style, marked: match[1], text: match[2] }
  }
  return null
}
