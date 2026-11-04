import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  Lightbulb,
  List,
  ListCollapse,
  ListOrdered,
  ListTodo,
  type LucideIcon,
  Minus,
  TextQuote,
  Type,
} from 'lucide-react'

/** Un type de bloc proposé par le menu « / » et par « Transformer en… ». */
export type BlockChoice = {
  key: string
  title: string
  subtext: string
  /** Mots-clés de recherche, en français et en anglais (spec 6.3a). */
  aliases: string[]
  group: 'Basique' | 'Avancé'
  /** Le raccourci Markdown équivalent, affiché à droite pour qu'on l'apprenne en passant. */
  badge?: string
  icon: LucideIcon
  block: { type: string; props?: Record<string, string | number | boolean> }
  /** Faux pour les blocs sans texte (séparateur) : on ne peut pas y « transformer » un texte. */
  hasText: boolean
}

/*
 * L'ordre compte : c'est celui du menu, et à égalité de pertinence le premier gagne
 * (« /titre » doit donner Titre 1). Les groupes Médias et Bases de données arrivent avec leurs phases.
 */
export const BLOCK_CHOICES: BlockChoice[] = [
  {
    key: 'paragraph',
    title: 'Texte',
    subtext: 'Un simple paragraphe',
    aliases: ['paragraphe', 'paragraph', 'text', 'p'],
    group: 'Basique',
    icon: Type,
    block: { type: 'paragraph' },
    hasText: true,
  },
  {
    key: 'heading_1',
    title: 'Titre 1',
    subtext: 'Grand titre de section',
    aliases: ['h1', 'heading 1', 'heading1', 'titre1', 'title'],
    group: 'Basique',
    badge: '#',
    icon: Heading1,
    block: { type: 'heading', props: { level: 1 } },
    hasText: true,
  },
  {
    key: 'heading_2',
    title: 'Titre 2',
    subtext: 'Titre de section moyen',
    aliases: ['h2', 'heading 2', 'heading2', 'titre2', 'sous-titre', 'subtitle'],
    group: 'Basique',
    badge: '##',
    icon: Heading2,
    block: { type: 'heading', props: { level: 2 } },
    hasText: true,
  },
  {
    key: 'heading_3',
    title: 'Titre 3',
    subtext: 'Petit titre de section',
    aliases: ['h3', 'heading 3', 'heading3', 'titre3'],
    group: 'Basique',
    badge: '###',
    icon: Heading3,
    block: { type: 'heading', props: { level: 3 } },
    hasText: true,
  },
  {
    key: 'bullet_list',
    title: 'Liste à puces',
    subtext: 'Une liste simple',
    aliases: ['puces', 'liste', 'bullet', 'bulleted list', 'ul'],
    group: 'Basique',
    badge: '-',
    icon: List,
    block: { type: 'bulletListItem' },
    hasText: true,
  },
  {
    key: 'numbered_list',
    title: 'Liste numérotée',
    subtext: 'Une liste avec des numéros',
    aliases: ['numéros', 'liste', 'numbered list', 'ordered', 'ol'],
    group: 'Basique',
    badge: '1.',
    icon: ListOrdered,
    block: { type: 'numberedListItem' },
    hasText: true,
  },
  {
    key: 'check_list',
    title: 'To-do',
    subtext: 'Une case à cocher pour suivre une tâche',
    aliases: ['todo', 'tâche', 'case à cocher', 'checkbox', 'checklist', 'task'],
    group: 'Basique',
    badge: '[]',
    icon: ListTodo,
    block: { type: 'checkListItem' },
    hasText: true,
  },
  {
    key: 'toggle_list',
    title: 'Liste dépliable',
    subtext: 'Masque ou affiche ce qu’elle contient',
    aliases: ['toggle', 'dépliable', 'repliable', 'déroulant', 'collapse'],
    group: 'Basique',
    badge: '>',
    icon: ListCollapse,
    block: { type: 'toggleListItem' },
    hasText: true,
  },
  {
    key: 'quote',
    title: 'Citation',
    subtext: 'Une citation ou un extrait',
    aliases: ['quote', 'blockquote', 'extrait'],
    group: 'Basique',
    badge: '"',
    icon: TextQuote,
    block: { type: 'quote' },
    hasText: true,
  },
  {
    key: 'divider',
    title: 'Séparateur',
    subtext: 'Une ligne pour séparer des parties',
    aliases: ['divider', 'ligne', 'line', 'hr', 'trait'],
    group: 'Basique',
    badge: '---',
    icon: Minus,
    block: { type: 'divider' },
    hasText: false,
  },
  {
    key: 'callout',
    title: 'Encadré',
    subtext: 'Une note mise en évidence, avec un émoji',
    aliases: ['callout', 'note', 'encart', 'remarque', 'info'],
    group: 'Basique',
    icon: Lightbulb,
    block: { type: 'callout' },
    hasText: true,
  },
  {
    key: 'code_block',
    title: 'Bloc de code',
    subtext: 'Du code, en police à chasse fixe',
    aliases: ['code', 'snippet', 'pre'],
    group: 'Avancé',
    badge: '```',
    icon: Code,
    block: { type: 'codeBlock' },
    hasText: true,
  },
]

/** Minuscules, sans accents ni espaces ni tirets : « To-do », « todo » et « to do » se valent. */
export function normalizeQuery(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

/**
 * Filtre du menu « / » : à chaque lettre, on garde les entrées dont le titre ou un mot-clé contient
 * la saisie. Dans chaque groupe, celles dont le titre commence par la saisie passent devant
 * (l'ordre des groupes ne bouge pas, sinon un groupe s'afficherait deux fois).
 */
export function filterChoices<
  T extends { title: string; aliases?: readonly string[]; group?: string },
>(items: readonly T[], query: string): T[] {
  const q = normalizeQuery(query)
  if (q === '') return [...items]

  const groups = [...new Set(items.map((item) => item.group))]
  const rank = (item: T) => (normalizeQuery(item.title).startsWith(q) ? 0 : 1)

  return items
    .filter(
      (item) =>
        normalizeQuery(item.title).includes(q) ||
        (item.aliases ?? []).some((alias) => normalizeQuery(alias).includes(q)),
    )
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        groups.indexOf(a.item.group) - groups.indexOf(b.item.group) ||
        rank(a.item) - rank(b.item) ||
        a.index - b.index,
    )
    .map(({ item }) => item)
}
