/*
 * Surligner les mots cherchés dans un titre ou un extrait (spec 6.12), sans tenir compte des
 * majuscules ni des accents : « ete » surligne « Été ».
 */

/** Sans accents ni majuscules, caractère par caractère (même longueur que le texte d'origine). */
function fold(text: string): string {
  return Array.from(text, (char) => {
    const base = char
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
    return base.length === 1 ? base : char.toLowerCase().slice(0, 1) || char
  }).join('')
}

/** Les mots d'une recherche, repliés (sans accents, en minuscules), sans doublon. */
export function searchTerms(query: string): string[] {
  return [
    ...new Set(
      fold(query)
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean),
    ),
  ]
}

export type Segment = { text: string; match: boolean }

/** Le texte découpé en morceaux, ceux qui correspondent à un mot cherché marqués. */
export function highlight(text: string, terms: readonly string[]): Segment[] {
  const chars = Array.from(text)
  const folded = fold(text)
  const marked = new Array<boolean>(chars.length).fill(false)
  for (const term of terms) {
    let from = 0
    for (;;) {
      const at = folded.indexOf(term, from)
      if (at === -1) break
      for (let i = at; i < at + term.length; i++) marked[i] = true
      from = at + term.length
    }
  }
  const segments: Segment[] = []
  chars.forEach((char, i) => {
    const last = segments.at(-1)
    if (last && last.match === marked[i]) last.text += char
    else segments.push({ text: char, match: marked[i]! })
  })
  return segments
}

/** Le titre contient-il tous les mots cherchés (recherche locale instantanée) ? */
export function matchesAll(text: string, terms: readonly string[]): boolean {
  const folded = fold(text)
  return terms.length > 0 && terms.every((term) => folded.includes(term))
}
