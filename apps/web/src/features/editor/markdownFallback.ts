import { createExtension } from '@blocknote/core'
import {
  type BlockShortcut,
  matchBlockShortcut,
  matchBlockShortcutAtStart,
  matchInlineShortcut,
} from './markdownShortcuts'
import type { NonotionEditor, NonotionPartialBlock } from './schema'

/** La ligne du curseur : son bloc et son texte jusqu'au curseur. */
type Snapshot = { blockId: string; type: string; prefix: string }

/** Une frappe ajoute peu de caractères ; un collage ou une annulation, davantage ou autrement. */
const MAX_TYPED = 4

/**
 * Filet de sécurité des raccourcis Markdown pour les claviers virtuels (constaté sur Android).
 *
 * BlockNote applique les raccourcis au moment où un caractère est tapé, mais les claviers des
 * téléphones regroupent la frappe en mots (« composition ») que ProseMirror ne reçoit qu'une fois
 * validés : « # » restait du texte. Ici, on regarde le document lui-même :
 * - après une modification hors composition, si la ligne vient de grandir de quelques caractères
 *   (une frappe, pas un collage ni une annulation) et que son début est un raccourci ;
 * - à la fin d'une composition, y compris quand le mot suivant est arrivé avec le raccourci
 *   (« # Titre » d'un coup), si la composition avait commencé au début de la ligne.
 * Au clavier physique, BlockNote a déjà transformé la ligne : rien ne correspond, rien ne se passe.
 */
export function createMarkdownFallback(afterDivider: (editor: NonotionEditor) => void) {
  return createExtension(({ editor: anyEditor }) => {
    const editor = anyEditor as NonotionEditor
    let last: Snapshot | null = null
    let compositionStart: Snapshot | null = null

    const current = (): Snapshot | null => {
      const { selection } = editor.prosemirrorState
      if (!selection.empty) return null
      const { $from } = selection
      if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null
      const { block } = editor.getTextCursorPosition()
      const prefix = $from.parent.textBetween(0, $from.parentOffset, '', '￼')
      return { blockId: block.id, type: block.type, prefix }
    }

    /** Retire les `length` premiers caractères de la ligne et change le type du bloc. */
    const convert = (now: Snapshot, shortcut: BlockShortcut, length: number) => {
      const block = editor.getBlock(now.blockId)
      if (!block || editor.schema.blockSchema[block.type]?.content !== 'inline') return false
      if (shortcut.type === block.type && shortcut.type !== 'heading') return false

      editor.transact((tr) => {
        const start = tr.selection.$from.start()
        tr.delete(start, start + length)
      })
      editor.updateBlock(now.blockId, shortcut as NonotionPartialBlock)
      if (shortcut.type === 'divider') afterDivider(editor)
      else if (length === now.prefix.length) editor.setTextCursorPosition(now.blockId, 'start')
      return true
    }

    /** `trailingSpace` : le mot balisé peut être suivi de l'espace qui l'a validé. */
    const applyInline = (now: Snapshot, trailingSpace: boolean) => {
      const ending = trailingSpace && /\s$/.test(now.prefix) ? 1 : 0
      const shortcut = matchInlineShortcut(now.prefix.slice(0, now.prefix.length - ending))
      if (!shortcut) return false
      editor.transact((tr) => {
        const markType = tr.doc.type.schema.marks[shortcut.style]
        if (!markType) return
        const to = tr.selection.from - ending
        const from = to - shortcut.marked.length
        const marks = markType.create().addToSet(tr.doc.resolve(from).marks())
        tr.replaceWith(from, to, tr.doc.type.schema.text(shortcut.text, marks))
        // La suite de la frappe n'est plus dans ce style.
        tr.removeStoredMark(markType)
      })
      return true
    }

    const afterTyping = () => {
      const now = current()
      const before = last
      last = now
      if (!now || editor.prosemirrorView?.composing) return
      const typed =
        before !== null &&
        before.blockId === now.blockId &&
        before.type === now.type &&
        now.prefix.startsWith(before.prefix) &&
        now.prefix.length > before.prefix.length &&
        now.prefix.length - before.prefix.length <= MAX_TYPED
      if (!typed) return

      const shortcut = matchBlockShortcut(now.prefix)
      const applied = shortcut ? convert(now, shortcut, now.prefix.length) : applyInline(now, false)
      if (applied) last = current()
    }

    const afterComposition = () => {
      const start = compositionStart
      compositionStart = null
      const now = current()
      last = now
      if (!now || editor.prosemirrorView?.composing) return

      let applied = false
      const exact = matchBlockShortcut(now.prefix)
      if (exact) applied = convert(now, exact, now.prefix.length)
      else if (start && start.blockId === now.blockId && start.type === now.type) {
        const atStart = matchBlockShortcutAtStart(now.prefix)
        // Le raccourci vient d'être tapé dans cette composition, pas des caractères déjà là.
        if (atStart && start.prefix.length < atStart.length)
          applied = convert(now, atStart.shortcut, atStart.length)
      }
      if (!applied) applied = applyInline(now, true)
      if (applied) last = current()
    }

    return {
      key: 'nonotion-markdown-fallback',
      mount: ({ dom, signal }) => {
        // Hors de la transaction en cours : BlockNote a fini d'appliquer ses propres règles.
        const offChange = editor.onChange(() => setTimeout(afterTyping))
        const offSelection = editor.onSelectionChange(() => {
          if (!editor.prosemirrorView?.composing) last = current()
        })
        dom.addEventListener(
          'compositionstart',
          () => {
            compositionStart ??= current()
          },
          { signal },
        )
        // ProseMirror termine la composition 20 ms après l'événement : on passe juste après.
        dom.addEventListener('compositionend', () => setTimeout(afterComposition, 40), { signal })
        signal.addEventListener('abort', () => {
          offChange()
          offSelection()
        })
      },
    }
  })()
}
