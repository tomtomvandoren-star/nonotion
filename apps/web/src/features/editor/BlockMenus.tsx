import { SideMenuExtension } from '@blocknote/core/extensions'
import {
  BasicTextStyleButton,
  BlockColorsItem,
  BlockTypeSelect,
  type BlockTypeSelectItem,
  ColorStyleButton,
  CreateLinkButton,
  DragHandleMenu,
  FormattingToolbar,
  RemoveBlockItem,
  SideMenu,
  useBlockNoteEditor,
  useComponentsContext,
  useExtensionState,
  usePortalElement,
  useUIMode,
} from '@blocknote/react'
import { Redo2, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { BLOCK_CHOICES } from './blockChoices'
import { withoutIds } from './content'
import type { NonotionBlock, NonotionEditor } from './schema'

/** Les types de blocs qui gardent leur texte quand on les transforme (spec 6.3c « Transformer en… »). */
const TEXT_CHOICES = BLOCK_CHOICES.filter((choice) => choice.hasText)

/**
 * La marge gauche de chaque bloc (spec 6.3c) : « + » insère un bloc en dessous, « ⠿ » se glisse
 * pour déplacer le bloc et ouvre au clic le menu Supprimer, Dupliquer, Transformer en…, Couleur.
 */
export function BlockSideMenu() {
  return <SideMenu dragHandleMenu={BlockHandleMenu} />
}

function BlockHandleMenu() {
  return (
    <DragHandleMenu>
      <RemoveBlockItem>Supprimer</RemoveBlockItem>
      <DuplicateBlockItem>Dupliquer</DuplicateBlockItem>
      <TurnIntoItem>Transformer en</TurnIntoItem>
      <BlockColorsItem>Couleur</BlockColorsItem>
    </DragHandleMenu>
  )
}

/** Le bloc dont la poignée est ouverte. */
function useHandleBlock() {
  return useExtensionState(SideMenuExtension, {
    selector: (state) => state?.block as NonotionBlock | undefined,
  })
}

function DuplicateBlockItem({ children }: { children: ReactNode }) {
  const Components = useComponentsContext()
  const editor = useBlockNoteEditor() as NonotionEditor
  const block = useHandleBlock()
  if (!Components || !block) return null

  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() => {
        // La copie reçoit de nouveaux identifiants : deux blocs ne partagent jamais le même.
        const [copy] = editor.insertBlocks([withoutIds(block)], block, 'after')
        if (copy) editor.setTextCursorPosition(copy, 'end')
      }}
    >
      {children}
    </Components.Generic.Menu.Item>
  )
}

function TurnIntoItem({ children }: { children: ReactNode }) {
  const Components = useComponentsContext()
  const editor = useBlockNoteEditor() as NonotionEditor
  const portalElement = usePortalElement()
  const block = useHandleBlock()
  // Seul un bloc qui contient du texte peut changer de type sans rien perdre.
  if (!Components || !block || editor.schema.blockSchema[block.type]?.content !== 'inline')
    return null

  return (
    <Components.Generic.Menu.Root position="right" sub portalElement={portalElement}>
      <Components.Generic.Menu.Trigger sub>
        <Components.Generic.Menu.Item className="bn-menu-item" subTrigger>
          {children}
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown sub className="bn-menu-dropdown">
        {TEXT_CHOICES.map((choice) => (
          <Components.Generic.Menu.Item
            key={choice.key}
            className="bn-menu-item"
            icon={<choice.icon aria-hidden size={16} />}
            onClick={() => editor.updateBlock(block, choice.block as never)}
          >
            {choice.title}
          </Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  )
}

/** « Transformer en ▾ » de la barre flottante : les mêmes types, avec les mêmes noms que le menu « / ». */
const BLOCK_TYPE_ITEMS: BlockTypeSelectItem[] = TEXT_CHOICES.map((choice) => ({
  name: choice.title,
  type: choice.block.type,
  props: choice.block.props,
  icon: choice.icon,
}))

/**
 * La barre de mise en forme qui apparaît au-dessus d'une sélection (spec 6.3d) :
 * Transformer en ▾, Lien, G, I, U, S, code, Couleur ▾. Sur mobile, BlockNote la colle au-dessus
 * du clavier (spec 7, responsive).
 */
export function SelectionToolbar() {
  const mobile = useUIMode() === 'mobile'
  return (
    <FormattingToolbar>
      {/* Pas de Ctrl+Z sur un téléphone : annuler et rétablir sont des boutons (spec 6.14). */}
      {mobile && <HistoryButton key="undoButton" direction="undo" />}
      {mobile && <HistoryButton key="redoButton" direction="redo" />}
      <BlockTypeSelect key="blockTypeSelect" items={BLOCK_TYPE_ITEMS} />
      <CreateLinkButton key="createLinkButton" />
      <BasicTextStyleButton basicTextStyle="bold" key="boldStyleButton" />
      <BasicTextStyleButton basicTextStyle="italic" key="italicStyleButton" />
      <BasicTextStyleButton basicTextStyle="underline" key="underlineStyleButton" />
      <BasicTextStyleButton basicTextStyle="strike" key="strikeStyleButton" />
      <BasicTextStyleButton basicTextStyle="code" key="codeStyleButton" />
      <ColorStyleButton key="colorStyleButton" />
    </FormattingToolbar>
  )
}

function HistoryButton({ direction }: { direction: 'undo' | 'redo' }) {
  const Components = useComponentsContext()
  const editor = useBlockNoteEditor() as NonotionEditor
  if (!Components) return null
  const label = direction === 'undo' ? 'Annuler' : 'Rétablir'
  const Icon = direction === 'undo' ? Undo2 : Redo2

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      label={label}
      mainTooltip={label}
      icon={<Icon aria-hidden size={16} />}
      onClick={() => {
        if (direction === 'undo') editor.undo()
        else editor.redo()
      }}
    />
  )
}
