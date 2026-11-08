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
import { Database, FilePlus, Link2, ListTodo, SmilePlus, Table2 } from 'lucide-react'
import { toast } from 'sonner'
import { useResolvedTheme } from '@/lib/theme'
import { useEffect, useImperativeHandle, useRef } from 'react'
import { BlockSideMenu, SelectionToolbar } from './BlockMenus'
import { BLOCK_CHOICES, filterChoices } from './blockChoices'
import { toEditorContent } from './content'
import { createMarkdownFallback } from './markdownFallback'
import { mediaItems } from './media/mediaItems'
import { isWebUrl } from './media/urls'
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
  // « Télécharger » veut dire recevoir : ici, on envoie un fichier de l'appareil, ou on colle un lien.
  file_panel: {
    upload: {
      title: 'Depuis l’appareil',
      file_placeholder: {
        image: 'Choisir une image',
        video: 'Choisir une vidéo',
        audio: 'Choisir un fichier audio',
        file: 'Choisir un fichier',
      },
      upload_error: 'Le fichier n’a pas pu être envoyé.',
    },
    embed: {
      title: 'Lien',
      embed_button: {
        image: 'Insérer l’image',
        video: 'Insérer la vidéo',
        audio: 'Insérer l’audio',
        file: 'Insérer le fichier',
      },
      url_placeholder: 'Collez le lien (https://…)',
    },
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

/** Ce que la page sait faire pour l'éditeur : créer une base (absent dans le bac à sable). */
export type DatabaseActions = {
  /** Crée une base en ligne dans la page (ou le Gestionnaire de tâches) ; renvoie son identifiant. */
  createInline: (template?: 'tasks') => Promise<string>
  /** Crée une base dans une nouvelle sous-page et l'ouvre. */
  createFullPage: () => Promise<void>
}

/** Ce que la page sait faire pour les liens : créer une sous-page, en choisir une, l'ouvrir. */
export type PageActions = {
  /** Crée une sous-page de la page ouverte et renvoie son identifiant. */
  createSubpage: () => Promise<string>
  /** Laisse choisir une page existante (null : annulé). */
  pick: () => Promise<{ id: string } | null>
  /** Ouvre une page, après avoir enregistré celle-ci. */
  open: (pageId: string) => void
}

/** « Nouvelle page » et « Lien vers une page » : un bloc lien, vers une page neuve ou existante. */
function pageItems(editor: NonotionEditor, pages: PageActions): DefaultReactSuggestionItem[] {
  const insertLink = () =>
    insertOrUpdateBlockForSlashMenu(editor, {
      type: 'pageLink',
      props: { pageId: '' },
    } as NonotionPartialBlock)
  return [
    {
      title: 'Nouvelle page',
      subtext: 'Une sous-page, avec son lien ici',
      aliases: ['page', 'sous-page', 'nouvelle page', 'subpage', 'new page'],
      group: 'Basique',
      icon: <FilePlus aria-hidden size={18} />,
      onItemClick: () => {
        const block = insertLink()
        pages
          .createSubpage()
          .then((pageId) => {
            editor.updateBlock(block, { props: { pageId } } as NonotionPartialBlock)
            pages.open(pageId)
          })
          .catch(() => {
            editor.removeBlocks([block])
            toast.error('La page n’a pas pu être créée.')
          })
      },
    },
    {
      title: 'Lien vers une page',
      subtext: 'Un lien vers une page qui existe déjà',
      aliases: ['lien', 'link', 'page', 'relier', 'mention', 'renvoi'],
      group: 'Basique',
      icon: <Link2 aria-hidden size={18} />,
      onItemClick: () => {
        const block = insertLink()
        void pages.pick().then((picked) => {
          if (picked)
            editor.updateBlock(block, { props: { pageId: picked.id } } as NonotionPartialBlock)
          else editor.removeBlocks([block])
        })
      },
    },
  ]
}

function databaseItems(
  editor: NonotionEditor,
  databases: DatabaseActions,
): DefaultReactSuggestionItem[] {
  const insertInline = (template?: 'tasks') => {
    // Le bloc apparaît tout de suite ; la base se crée sur le serveur pendant ce temps.
    const block = insertOrUpdateBlockForSlashMenu(editor, {
      type: 'database',
      props: { databaseId: '' },
    } as NonotionPartialBlock)
    databases
      .createInline(template)
      .then((databaseId) =>
        editor.updateBlock(block, { props: { databaseId } } as NonotionPartialBlock),
      )
      .catch(() => {
        editor.removeBlocks([block])
        toast.error('La base de données n’a pas pu être créée.')
      })
  }
  return [
    {
      title: 'Base de données',
      subtext: 'Un tableau de pages avec des propriétés, dans cette page',
      aliases: ['database', 'base', 'tableau', 'table', 'bdd', 'données'],
      group: 'Bases de données',
      icon: <Database aria-hidden size={18} />,
      onItemClick: () => insertInline(),
    },
    {
      title: 'Base de données en pleine page',
      subtext: 'Une nouvelle sous-page qui n’est qu’une base',
      aliases: ['database', 'full page', 'pleine page', 'base', 'tableau'],
      group: 'Bases de données',
      icon: <Table2 aria-hidden size={18} />,
      onItemClick: () => {
        databases
          .createFullPage()
          .catch(() => toast.error('La base de données n’a pas pu être créée.'))
      },
    },
    {
      title: 'Gestionnaire de tâches',
      subtext: 'Statut, échéance, priorité ; vues Aujourd’hui et Par statut',
      // Pas « todo » : « /todo » mène à la case à cocher d'une page (spec 6.3a).
      aliases: ['tâches', 'taches', 'tasks', 'kanban', 'board', 'projet'],
      group: 'Bases de données',
      icon: <ListTodo aria-hidden size={18} />,
      onItemClick: () => insertInline('tasks'),
    },
  ]
}

function slashMenuItems(
  editor: NonotionEditor,
  databases?: DatabaseActions,
  pages?: PageActions,
): DefaultReactSuggestionItem[] {
  const blocks = BLOCK_CHOICES.map((choice) => ({
    title: choice.title,
    subtext: choice.subtext,
    aliases: choice.aliases,
    group: choice.group,
    badge: choice.badge,
    icon: <choice.icon aria-hidden size={18} />,
    onItemClick: () => {
      insertOrUpdateBlockForSlashMenu(editor, choice.block as NonotionPartialBlock)
    },
  }))
  // Groupes dans l'ordre de la spec 6.3a : Basique, Média, Bases de données, Avancé.
  return [
    ...blocks.filter((item) => item.group === 'Basique'),
    ...(pages ? pageItems(editor, pages) : []),
    ...mediaItems(editor),
    ...(databases ? databaseItems(editor, databases) : []),
    ...blocks.filter((item) => item.group !== 'Basique'),
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
  databases,
  pages,
  uploadFile,
}: {
  ref?: React.Ref<BlockEditorHandle>
  /** Le document enregistré ; il n'est lu qu'à la création de l'éditeur. */
  content: PageContent
  onChange: () => void
  /** Flèche haut au tout début du document : on revient au titre. */
  onExitTop: () => void
  databases?: DatabaseActions
  pages?: PageActions
  /** Envoie un fichier de la page et renvoie son adresse (absent : fichiers par lien seulement). */
  uploadFile?: (file: File) => Promise<string>
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
    uploadFile,
    // Une image, une vidéo ou un fichier ne s'affiche ou ne s'ouvre que depuis le web : jamais un
    // « javascript: » collé comme lien. (blob: : l'aperçu pendant l'envoi.)
    resolveFileUrl: async (url) => (isWebUrl(url) || url.startsWith('blob:') ? url : ''),
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

  const theme = useResolvedTheme()

  return (
    <BlockNoteView
      editor={editor}
      theme={theme}
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
        getItems={async (query) => filterChoices(slashMenuItems(editor, databases, pages), query)}
      />
      <SideMenuController sideMenu={BlockSideMenu} floatingUIOptions={SIDE_MENU_FLOATING} />
      <FormattingToolbarController formattingToolbar={SelectionToolbar} />
    </BlockNoteView>
  )
}
