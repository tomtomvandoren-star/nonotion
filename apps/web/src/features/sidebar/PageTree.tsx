import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragMoveEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core'
import type { PageTreeItem } from '@nonotion/shared'
import { useParams } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { displayTitle } from '@/features/pages/displayTitle'
import { PageGlyph } from '@/features/pages/PageGlyph'
import { useMovePage } from '@/features/pages/queries'
import { useUi } from '@/stores/ui'
import { PageTreeRow, ROW_HEIGHT } from './PageTreeRow'
import { dropZoneAt, indexTree, resolveDrop, visibleRows, type DropZone, type Move } from './tree'

interface DropTarget {
  overId: string
  zone: DropZone
  move: Move | null
}

// Souris : glisser après 4 px. Tactile : appui long de 250 ms, pour ne pas gêner le défilement.
// Clavier : Espace pour saisir, flèches, Espace pour déposer, Échap pour annuler (spec 1.6.7).
const KEYBOARD_STEP = ROW_HEIGHT / 3

const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
  if (event.code === 'ArrowDown')
    return { ...currentCoordinates, y: currentCoordinates.y + KEYBOARD_STEP }
  if (event.code === 'ArrowUp')
    return { ...currentCoordinates, y: currentCoordinates.y - KEYBOARD_STEP }
  return undefined
}

// À la souris, la ligne visée est celle sous le pointeur ; au clavier, la plus proche.
const collisionDetection: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)

type Point = { x: number; y: number }

function pointOf(event: Event): Point | null {
  if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
    const touch = event.touches[0] ?? event.changedTouches[0]
    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }
  return event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : null
}

/**
 * Suit la position réelle du pointeur pendant un glissement. dnd-kit ne met à jour la ligne
 * survolée qu'au rendu suivant : relâché juste après un mouvement rapide, il désignerait
 * encore une ligne dépassée. Au clavier, il n'y a pas de pointeur : on s'en remet à dnd-kit.
 */
function usePointerTracking() {
  const last = useRef<Point | null>(null)
  const stop = useRef(() => {})

  const start = (activator: Event) => {
    last.current = pointOf(activator)
    if (last.current === null) return
    const onMove = (event: MouseEvent | TouchEvent) => {
      last.current = pointOf(event) ?? last.current
    }
    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('touchmove', onMove, true)
    stop.current = () => {
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('touchmove', onMove, true)
      last.current = null
    }
  }

  return { last, start, stop: () => stop.current() }
}

/** La ligne de l'arbre sous un point de l'écran (en ignorant la copie qui suit le pointeur). */
function rowAt(point: Point): HTMLElement | null {
  for (const element of document.elementsFromPoint(point.x, point.y)) {
    const row = element.closest<HTMLElement>('[role=treeitem][data-page-id]')
    if (row) return row
  }
  return null
}

/**
 * L'arbre des pages, réorganisable par glisser-déposer (P4) : déposer au milieu d'une ligne
 * en fait une sous-page, entre deux lignes une sœur. Le résultat est montré avant de relâcher.
 */
export function PageTree({ pages }: { pages: PageTreeItem[] }) {
  const expanded = useUi((s) => s.expanded)
  const setExpanded = useUi((s) => s.setExpanded)
  const movePage = useMovePage()
  const currentPageId = useParams({ strict: false }).pageId
  const [activeId, setActiveId] = useState<string | null>(null)
  const [target, setTarget] = useState<DropTarget | null>(null)

  const index = useMemo(() => indexTree(pages), [pages])
  const rows = useMemo(() => visibleRows(index, expanded), [index, expanded])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  )

  const pointer = usePointerTracking()

  /** Où tomberait la page si on la lâchait maintenant. */
  const targetOf = (event: DragMoveEvent): DropTarget | null => {
    let overId: string
    let zone: DropZone
    const point = pointer.last.current
    if (point) {
      const row = rowAt(point)
      if (!row?.dataset.pageId) return null
      const rect = row.getBoundingClientRect()
      overId = row.dataset.pageId
      zone = dropZoneAt((point.y - rect.top) / rect.height)
    } else {
      // Au clavier : la ligne la plus proche du centre de la ligne déplacée.
      const rect = event.active.rect.current.translated
      if (!event.over || !rect) return null
      overId = String(event.over.id)
      zone = dropZoneAt((rect.top + rect.height / 2 - event.over.rect.top) / event.over.rect.height)
    }
    const move = resolveDrop(index, String(event.active.id), overId, zone, expanded)
    return move ? { overId, zone, move } : null
  }

  const reset = () => {
    pointer.stop()
    setActiveId(null)
    setTarget(null)
  }

  const activePage = activeId ? index.byId.get(activeId) : undefined
  const titleOf = (id: string | number) => displayTitle(index.byId.get(String(id))?.title ?? '')

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Page « ${titleOf(active.id)} » saisie.`,
    onDragOver: ({ active, over }) =>
      over ? `« ${titleOf(active.id)} » au niveau de « ${titleOf(over.id)} ».` : undefined,
    onDragEnd: ({ active }) => `Page « ${titleOf(active.id)} » déposée.`,
    onDragCancel: ({ active }) => `Déplacement de « ${titleOf(active.id)} » annulé.`,
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Appuyez sur Espace pour saisir la page, sur les flèches pour la déplacer, puis sur Espace pour la déposer ou Échap pour annuler.',
        },
      }}
      onDragStart={(event) => {
        pointer.start(event.activatorEvent)
        setActiveId(String(event.active.id))
      }}
      onDragMove={(event) => setTarget(targetOf(event))}
      onDragCancel={reset}
      onDragEnd={(event) => {
        // Recalculée au lâcher : l'état de l'indicateur peut avoir un rendu de retard.
        const move = targetOf(event)?.move
        if (move) {
          movePage.mutate({ pageId: String(event.active.id), ...move })
          if (move.parentId) setExpanded(move.parentId, true)
        }
        reset()
      }}
    >
      <div role="tree" aria-label="Pages" className="flex flex-col">
        {rows.map((row) => (
          <PageTreeRow
            key={row.page.id}
            row={row}
            active={row.page.id === currentPageId}
            dropIndicator={
              target?.overId === row.page.id
                ? {
                    zone: target.zone,
                    // Sous une page dépliée, la page devient sa première sous-page.
                    nested: target.zone === 'after' && row.expanded,
                  }
                : null
            }
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activePage && (
          <div className="flex h-7 max-w-56 items-center gap-1.5 rounded-sm bg-background px-2 text-sm shadow-md">
            <PageGlyph icon={activePage.icon} />
            <span className="truncate">{displayTitle(activePage.title)}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
