import '@blocknote/shadcn/style.css'
import { createExtension } from '@blocknote/core'
import {
  insertOrUpdateBlockForSlashMenu,
  SuggestionMenu,
  type SuggestionMenuOptions,
} from '@blocknote/core/extensions'
import { fr } from '@blocknote/core/locales'
import {
  type DefaultReactSuggestionItem,
  FormattingToolbarController,
  SideMenuController,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/shadcn'
import type { PageContent } from '@nonotion/shared'
import { SmilePlus } from 'lucide-react'
import { useEffect, useImperativeHandle, useRef } from 'react'
import { BlockSideMenu, SelectionToolbar } from './BlockMenus'
import { BLOCK_CHOICES, filterChoices } from './blockChoices'
import { toEditorContent } from './content'
import { createMarkdownFallback } from './markdownFallback'
import type { NonotionBlock, NonotionEditor, NonotionPartialBlock } from './schema'
import { SIDE_MENU_FLOATING } from './sideMenuPosition'
import { BLOCK_TYPES, schema } from './schema'

export type BlockEditorHandle = {
  /** Place le curseur au début du premier bloc (Entrée dans le titre, spec 6.2). */
  focusStart: () => void
  isFocused: () => boolean
  getDocument: () => NonotionBlock[]
}

const dictionary = {
  ...fr,
  drag_handle: { ...fr.drag_handle, colors_menuitem: 'Couleur' },
  side_menu: {
    add_block_label: 'Insérer un bloc en dessous',
    drag_handle_label: 'Glisser pour déplacer, cliquer pour le menu',
  },
  formatting_toolbar: {
    ...fr.formatting_toolbar,
    underline: { ...fr.formatting_toolbar.underline, tooltip: 'Souligné' },
    colors: { ...fr.formatting_toolbar.colors, tooltip: 'Couleur' },
  },
}

const placeholders = {
  default: 'Écrivez, ou tapez « / » pour choisir un bloc',
  heading: 'Titre',
  bulletListItem: 'Liste',
  numberedListItem: 'Liste',
  checkListItem: 'À faire',
  toggleListItem: 'Liste dépliable',
  emptyDocument: 'Écrivez, ou tapez « / » pour choisir un bloc',
}

type Transaction = Parameters<NonNullable<SuggestionMenuOptions['shouldOpen']>>[0]

/**
 * « / » ouvre le menu au début d'une ligne ou après un espace (spec 6.3a) : dans « 1/2 » ou une
 * adresse web, c'est un caractère comme un autre.
 */
function opensSlashMenu(tr: Transaction): boolean {
  const { $from } = tr.selection
  if ($from.parentOffset === 0) return true
  return /\s/.test($from.parent.textBetween($from.parentOffset - 1, $from.parentOffset, '', ' '))
}

function slashMenuItems(editor: NonotionEditor): DefaultReactSuggestionItem[] {
  return [
    ...BLOCK_CHOICES.map((choice) => ({
      title: choice.title,
      subtext: choice.subtext,
      aliases: choice.aliases,
      group: choice.group,
      badge: choice.badge,
      icon: <choice.icon aria-hidden size={18} />,
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, choice.block as NonotionPartialBlock)
      },
    })),
    {
      title: 'Émoji',
      subtext: 'Insérer un émoji (ou tapez « : » suivi de son nom)',
      aliases: ['emoji', 'émoticône', 'smiley'],
      group: 'Avancé',
      icon: <SmilePlus aria-hidden size={18} />,
      onItemClick: () =>
        editor.getExtension(SuggestionMenu)?.openSuggestionMenu(':', {
          deleteTriggerCharacter: true,
          ignoreQueryLength: true,
        }),
    },
  ]
}

/**
 * Après « --- », l'écriture continue sur la ligne suivante (un paragraphe vide, créé au besoin),
 * comme dans Notion : sinon le séparateur resterait sélectionné et la frappe se perdrait.
 */
function continueAfterDivider(editor: NonotionEditor) {
  const { block, nextBlock } = editor.getTextCursorPosition()
  if (block.type !== 'divider') return
  const nextIsEmptyParagraph =
    nextBlock?.type === 'paragraph' &&
    Array.isArray(nextBlock.content) &&
    nextBlock.content.length === 0
  const target = nextIsEmptyParagraph
    ? nextBlock
    : editor.insertBlocks([{ type: 'paragraph' }], block, 'after')[0]
  if (target) editor.setTextCursorPosition(target, 'start')
}

/** Le curseur est-il tout au début du document ? (Flèche haut y remonte alors au titre.) */
function isAtDocumentStart(editor: NonotionEditor): boolean {
  const { selection } = editor.prosemirrorState
  if (!selection.empty || selection.$from.parentOffset !== 0) return false
  const { block, prevBlock } = editor.getTextCursorPosition()
  return prevBlock === undefined && editor.getParentBlock(block) === undefined
}

/**
 * L'éditeur de blocs du corps de la page (spec 6.3). BlockNote fournit le menu « / », la poignée
 * de glisser-déposer, la barre flottante, l'imbrication par Tab et l'annulation ; ce composant
 * les configure en français et ajoute ce qui est propre à Nonotion.
 */
export default function BlockEditor({
  ref,
  content,
  onChange,
  onExitTop,
}: {
  ref?: React.Ref<BlockEditorHandle>
  /** Le document enregistré ; il n'est lu qu'à la création de l'éditeur. */
  content: PageContent
  onChange: () => void
  /** Flèche haut au tout début du document : on revient au titre. */
  onExitTop: () => void
}) {
  const exitTop = useRef(onExitTop)
  useEffect(() => {
    exitTop.current = onExitTop
  }, [onExitTop])

  const editor = useCreateBlockNote({
    schema,
    dictionary,
    placeholders,
    initialContent: toEditorContent(content, BLOCK_TYPES) as NonotionPartialBlock[] | undefined,
    // La ligne qui montre où le bloc glissé va tomber (P4), dans la couleur d'accent.
    dropCursor: { color: 'var(--accent)', width: 3 },
    extensions: [
      createMarkdownFallback(continueAfterDivider),
      createExtension({
        key: 'nonotion-shortcuts',
        // Nos règles passent avant celles de BlockNote, qui font de « > » une citation.
        runsBefore: ['quote-block-shortcuts', 'divider-block-shortcuts'],
        inputRules: [
          // Comme dans Notion (spec 6.3b) : « > » crée une liste dépliable, « " » une citation.
          { find: /^>\s$/, replace: () => ({ type: 'toggleListItem', props: {} }) },
          {
            find: /^---$/,
            replace: ({ editor: current }) => {
              // Le séparateur existe une fois la transaction appliquée : on place le curseur ensuite.
              queueMicrotask(() => continueAfterDivider(current as NonotionEditor))
              return { type: 'divider', props: {}, content: [] }
            },
          },
        ],
        keyboardShortcuts: {
          ArrowUp: ({ editor: current }) => {
            if (!isAtDocumentStart(current as NonotionEditor)) return false
            exitTop.current()
            return true
          },
        },
      }),
    ],
  })

  useImperativeHandle(
    ref,
    () => ({
      focusStart: () => {
        const first = editor.document[0]
        if (first) editor.setTextCursorPosition(first, 'start')
        editor.focus()
      },
      isFocused: () => editor.isFocused(),
      getDocument: () => editor.document,
    }),
    [editor],
  )

  return (
    <BlockNoteView
      editor={editor}
      onChange={onChange}
      slashMenu={false}
      sideMenu={false}
      formattingToolbar={false}
      className="nn-editor"
      data-testid="page-editor"
    >
      <SuggestionMenuController
        triggerCharacter="/"
        shouldOpen={opensSlashMenu}
        getItems={async (query) => filterChoices(slashMenuItems(editor), query)}
      />
      <SideMenuController sideMenu={BlockSideMenu} floatingUIOptions={SIDE_MENU_FLOATING} />
      <FormattingToolbarController formattingToolbar={SelectionToolbar} />
    </BlockNoteView>
  )
}
