import { SideMenuExtension } from '@blocknote/core/extensions'
import { useBlockNoteEditor, useExtension, useExtensionState } from '@blocknote/react'
import { type ReactNode, useRef } from 'react'
import type { NonotionEditor } from './schema'

type Drop = { id: string; placement: 'before' | 'after'; rect: DOMRect }

/** Distance à parcourir avant que l'appui devienne un glisser (en dessous, c'est un tap : le menu). */
const DRAG_THRESHOLD = 8
/** Près du haut ou du bas de la zone qui défile, la page défile pendant le glisser. */
const SCROLL_EDGE = 64

function scrollParent(element: HTMLElement | null | undefined): HTMLElement {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight)
      return node
  }
  return document.scrollingElement as HTMLElement
}

/** Le bloc sous le doigt, et de quel côté le déposer. Jamais lui-même ni l'un de ses enfants. */
function dropTarget(editor: NonotionEditor, dragId: string, x: number, y: number): Drop | null {
  const root = editor.domElement
  if (!root) return null
  const bounds = root.getBoundingClientRect()
  // On sonde dans la colonne du texte, même si le doigt est dans la marge.
  const probeX = Math.min(Math.max(x, bounds.left + 8), bounds.right - 8)
  const outer = document
    .elementFromPoint(probeX, y)
    ?.closest<HTMLElement>('.bn-block-outer[data-id]')
  const id = outer?.dataset.id
  if (!outer || !id || id === dragId || !root.contains(outer)) return null
  const dragged = root.querySelector(`.bn-block-outer[data-id="${CSS.escape(dragId)}"]`)
  if (dragged?.contains(outer)) return null
  const content = outer.querySelector(':scope > .bn-block > .bn-block-content') ?? outer
  const rect = content.getBoundingClientRect()
  return { id, placement: y < rect.top + rect.height / 2 ? 'before' : 'after', rect }
}

/**
 * La poignée ⠿ au doigt. BlockNote déplace les blocs par le glisser-déposer natif du navigateur,
 * qu'Android et iOS ne déclenchent pas au toucher : ici, appuyer puis glisser déplace le bloc, une
 * ligne montrant où il va tomber (P4), et la page défile près des bords. Un simple tap ouvre
 * toujours le menu du bloc. À la souris, rien ne change.
 */
export function TouchDragHandle({ children }: { children: ReactNode }) {
  const editor = useBlockNoteEditor() as NonotionEditor
  const sideMenu = useExtension(SideMenuExtension)
  const blockId = useExtensionState(SideMenuExtension, { selector: (state) => state?.block?.id })
  const justDragged = useRef(false)

  const onPointerDown = (down: React.PointerEvent) => {
    if (down.pointerType === 'mouse' || !blockId) return
    const dragId = blockId
    const scroller = scrollParent(editor.domElement)
    const line = document.createElement('div')
    line.className = 'nn-touch-drop-line'
    let dragging = false
    let target: Drop | null = null
    let last = { x: down.clientX, y: down.clientY }
    let frame = 0

    const showTarget = () => {
      target = dropTarget(editor, dragId, last.x, last.y)
      line.hidden = target === null
      if (!target) return
      const top = target.placement === 'before' ? target.rect.top : target.rect.bottom
      Object.assign(line.style, {
        top: `${top - 1.5}px`,
        left: `${target.rect.left}px`,
        width: `${target.rect.width}px`,
      })
    }

    const autoScroll = () => {
      const bounds =
        scroller === document.scrollingElement
          ? { top: 0, bottom: window.innerHeight }
          : scroller.getBoundingClientRect()
      if (last.y < bounds.top + SCROLL_EDGE) scroller.scrollTop -= 12
      else if (last.y > bounds.bottom - SCROLL_EDGE) scroller.scrollTop += 12
      showTarget()
      frame = requestAnimationFrame(autoScroll)
    }

    const move = (event: PointerEvent) => {
      if (event.pointerId !== down.pointerId) return
      last = { x: event.clientX, y: event.clientY }
      if (!dragging) {
        if (Math.hypot(last.x - down.clientX, last.y - down.clientY) < DRAG_THRESHOLD) return
        dragging = true
        sideMenu?.freezeMenu()
        document.body.append(line)
        frame = requestAnimationFrame(autoScroll)
      }
      showTarget()
    }

    const end = (event: PointerEvent) => {
      if (event.pointerId !== down.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      cancelAnimationFrame(frame)
      line.remove()
      if (!dragging) return
      // Le relâcher ne doit pas ouvrir le menu du bloc.
      justDragged.current = true
      setTimeout(() => {
        justDragged.current = false
      }, 400)
      sideMenu?.unfreezeMenu()
      const drop = event.type === 'pointerup' ? target : null
      const moving = editor.getBlock(dragId)
      const anchor = drop ? editor.getBlock(drop.id) : undefined
      if (!drop || !moving || !anchor) return
      // Une seule étape d'annulation : retirer puis réinsérer dans la même transaction.
      editor.transact(() => {
        editor.removeBlocks([moving])
        editor.insertBlocks([moving], anchor, drop.placement)
      })
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  return (
    <span
      className="nn-touch-drag flex"
      onPointerDownCapture={onPointerDown}
      onClickCapture={(event) => {
        if (justDragged.current) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      {children}
    </span>
  )
}
