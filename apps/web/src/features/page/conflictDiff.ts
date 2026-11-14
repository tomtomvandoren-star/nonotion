/**
 * Ce qui diffère entre deux versions d'une page (mode « Gestion de conflit », spec 6.16), bloc par
 * bloc : chaque bloc garde son identifiant d'une version à l'autre. Un bloc présent d'un seul côté
 * est ajouté (ma version) ou n'existe que sur le serveur ; un bloc des deux côtés dont le texte, le
 * type ou les réglages ont changé est modifié.
 */

export type MineMark = 'added' | 'changed'
export type ServerMark = 'only-server' | 'changed'

type Block = {
  id?: unknown
  type?: unknown
  props?: unknown
  content?: unknown
  children?: unknown
}

/** Chaque bloc (enfants compris) : son identifiant et ce qui le décrit, sans ses enfants. */
function flatten(blocks: unknown, into = new Map<string, string>()): Map<string, string> {
  if (!Array.isArray(blocks)) return into
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue
    const block = raw as Block
    if (typeof block.id === 'string')
      into.set(
        block.id,
        JSON.stringify({ type: block.type, props: block.props, content: block.content }),
      )
    flatten(block.children, into)
  }
  return into
}

export function diffVersions(
  mine: unknown,
  server: unknown,
): { mine: Map<string, MineMark>; server: Map<string, ServerMark>; changes: number } {
  const ours = flatten(mine)
  const theirs = flatten(server)
  const marksMine = new Map<string, MineMark>()
  const marksServer = new Map<string, ServerMark>()
  for (const [id, signature] of ours) {
    const other = theirs.get(id)
    if (other === undefined) marksMine.set(id, 'added')
    else if (other !== signature) {
      marksMine.set(id, 'changed')
      marksServer.set(id, 'changed')
    }
  }
  for (const id of theirs.keys()) if (!ours.has(id)) marksServer.set(id, 'only-server')
  const changes =
    [...marksMine.values()].filter((mark) => mark === 'added').length + marksServer.size
  return { mine: marksMine, server: marksServer, changes }
}
