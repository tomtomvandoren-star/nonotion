import type { PageContent } from '@nonotion/shared'

type StoredBlock = Record<string, unknown>

const HEADING_LEVELS = [1, 2, 3]

/** Le texte d'un bloc s'il est du texte (chaîne ou suite d'éléments en ligne), sinon rien. */
function inlineContent(content: unknown): unknown {
  return typeof content === 'string' || Array.isArray(content) ? content : undefined
}

function toEditorBlock(block: StoredBlock, knownTypes: ReadonlySet<string>): StoredBlock {
  const children = Array.isArray(block.children)
    ? block.children
        .filter((child): child is StoredBlock => !!child && typeof child === 'object')
        .map((child) => toEditorBlock(child, knownTypes))
    : []
  const type = typeof block.type === 'string' ? block.type : ''

  // Un type que l'éditeur ne connaît pas (bloc d'une version future…) devient un paragraphe :
  // son texte reste lisible au lieu d'empêcher l'ouverture de la page.
  if (!knownTypes.has(type)) {
    const content = inlineContent(block.content)
    return { type: 'paragraph', ...(content === undefined ? {} : { content }), children }
  }

  const props =
    block.props && typeof block.props === 'object'
      ? { ...(block.props as Record<string, unknown>) }
      : undefined
  if (type === 'heading' && props && !HEADING_LEVELS.includes(Number(props.level))) props.level = 3

  return { ...block, ...(props ? { props } : {}), children }
}

/**
 * Le document enregistré, prêt à être ouvert par l'éditeur : undefined pour une page vide
 * (BlockNote crée alors un premier paragraphe), et jamais de bloc qu'il ne saurait afficher.
 */
export function toEditorContent(
  content: PageContent,
  knownTypes: ReadonlySet<string>,
): StoredBlock[] | undefined {
  const blocks = (content ?? []).filter((block) => !!block && typeof block === 'object')
  return blocks.length === 0 ? undefined : blocks.map((block) => toEditorBlock(block, knownTypes))
}

/** Un bloc et ses enfants sans leurs identifiants, pour en insérer une copie. */
export function withoutIds<T extends { id?: string; children?: readonly object[] }>(block: T): T {
  const children = (block.children ?? []).map((child) => withoutIds(child as T))
  const copy = { ...block, children }
  delete copy.id
  return copy
}
