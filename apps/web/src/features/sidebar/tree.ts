import { comparePositions, positionBetween, type PageTreeItem } from '@nonotion/shared'

/** L'arbre des pages indexé : chaque page par identifiant, et les enfants de chaque parent dans l'ordre. */
export interface TreeIndex {
  byId: Map<string, PageTreeItem>
  /** Enfants de chaque page (clé null = racine), triés par position puis par identifiant. */
  children: Map<string | null, PageTreeItem[]>
}

export function indexTree(pages: PageTreeItem[]): TreeIndex {
  const byId = new Map(pages.map((page) => [page.id, page]))
  const children = new Map<string | null, PageTreeItem[]>()
  for (const page of pages) {
    // Une page dont la parente n'est pas chargée s'affiche à la racine plutôt que de disparaître.
    const parent =
      page.parent_page_id !== null && byId.has(page.parent_page_id) ? page.parent_page_id : null
    const siblings = children.get(parent) ?? []
    siblings.push(page)
    children.set(parent, siblings)
  }
  for (const siblings of children.values()) {
    siblings.sort(
      (a, b) => comparePositions(a.position, b.position) || comparePositions(a.id, b.id),
    )
  }
  return { byId, children }
}

export const childrenOf = (index: TreeIndex, parentId: string | null) =>
  index.children.get(parentId) ?? []

/** Parent effectif (null si la parente n'est pas dans l'arbre). */
export function parentOf(index: TreeIndex, pageId: string): string | null {
  const parent = index.byId.get(pageId)?.parent_page_id ?? null
  return parent !== null && index.byId.has(parent) ? parent : null
}

export interface TreeRow {
  page: PageTreeItem
  depth: number
  hasChildren: boolean
  expanded: boolean
}

/** Les lignes affichées dans la barre latérale : les pages dont tous les ancêtres sont dépliés. */
export function visibleRows(index: TreeIndex, expanded: Record<string, true>): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const page of childrenOf(index, parentId)) {
      const hasChildren = childrenOf(index, page.id).length > 0
      const isExpanded = hasChildren && expanded[page.id] === true
      rows.push({ page, depth, hasChildren, expanded: isExpanded })
      if (isExpanded) walk(page.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

/** Vrai si `pageId` est `ancestorId` ou se trouve dans sa descendance. */
export function isSelfOrDescendant(index: TreeIndex, ancestorId: string, pageId: string): boolean {
  let current: string | null = pageId
  for (let guard = 0; current !== null && guard < 1000; guard++) {
    if (current === ancestorId) return true
    current = parentOf(index, current)
  }
  return false
}

/** Ancêtres d'une page, de la racine jusqu'à elle (fil d'Ariane). */
export function pathTo(index: TreeIndex, pageId: string): PageTreeItem[] {
  const path: PageTreeItem[] = []
  let current: string | null = pageId
  for (let guard = 0; current !== null && guard < 1000; guard++) {
    const page = index.byId.get(current)
    if (!page) break
    path.unshift(page)
    current = parentOf(index, current)
  }
  return path
}

/** Position qui place une page à la fin des enfants de `parentId`. */
export function positionAtEnd(index: TreeIndex, parentId: string | null): string {
  const siblings = childrenOf(index, parentId)
  return positionBetween(siblings.at(-1)?.position ?? null, null)
}

/**
 * Où tombe une page glissée sur une ligne : dans le tiers central elle devient l'enfant
 * de la ligne, sur les bords elle se place avant ou après, comme sœur (spec 6.1).
 */
export type DropZone = 'before' | 'inside' | 'after'

export function dropZoneAt(offsetRatio: number): DropZone {
  if (offsetRatio < 0.25) return 'before'
  if (offsetRatio > 0.75) return 'after'
  return 'inside'
}

export interface Move {
  parentId: string | null
  position: string
}

/**
 * Le déplacement qui correspond à un dépôt, ou null s'il est impossible (boucle) ou sans effet.
 * Déposer « après » une page dépliée la place en tête de ses enfants, juste sous la ligne.
 */
export function resolveDrop(
  index: TreeIndex,
  activeId: string,
  overId: string,
  zone: DropZone,
  expanded: Record<string, true>,
): Move | null {
  // Une page ne peut pas aller dans elle-même ni dans ses descendantes (spec 6.1).
  if (isSelfOrDescendant(index, activeId, overId)) return null
  const over = index.byId.get(overId)
  const active = index.byId.get(activeId)
  if (!over || !active) return null

  const without = (parentId: string | null) =>
    childrenOf(index, parentId).filter((page) => page.id !== activeId)

  let parentId: string | null
  let insertAt: number
  const overChildren = without(over.id)

  if (zone === 'inside') {
    parentId = over.id
    insertAt = overChildren.length
  } else if (zone === 'after' && expanded[over.id] && overChildren.length > 0) {
    parentId = over.id
    insertAt = 0
  } else {
    parentId = parentOf(index, over.id)
    const siblings = without(parentId)
    const overIndex = siblings.findIndex((page) => page.id === over.id)
    insertAt = zone === 'before' ? overIndex : overIndex + 1
  }

  const siblings = without(parentId)
  // Même parent, même rang : rien ne change.
  if (parentId === parentOf(index, activeId)) {
    const currentIndex = childrenOf(index, parentId).findIndex((page) => page.id === activeId)
    if (currentIndex === insertAt) return null
  }

  const before = siblings[insertAt - 1]?.position ?? null
  const after = siblings[insertAt]?.position ?? null
  return { parentId, position: positionBetween(before, after) }
}
