import { BlockNoteSchema, createHeadingBlockSpec, defaultBlockSpecs } from '@blocknote/core'
import { createCalloutBlockSpec } from './Callout'

/**
 * Les blocs de la phase 2 (spec 9) : texte, titres, listes, to-do, liste dépliable, citation,
 * séparateur, code et encadré. Les blocs médias (image, fichier…) et le tableau ne sont pas
 * proposés tant que l'envoi de fichiers n'existe pas : un bloc qui ne marche pas n'a rien à faire
 * dans le menu.
 */
export const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    // Trois niveaux de titre, comme Notion : au-delà, la hiérarchie ne se lit plus.
    heading: createHeadingBlockSpec({ levels: [1, 2, 3] }),
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    toggleListItem: defaultBlockSpecs.toggleListItem,
    quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock,
    divider: defaultBlockSpecs.divider,
    callout: createCalloutBlockSpec(),
  },
})

export type NonotionEditor = typeof schema.BlockNoteEditor
export type NonotionBlock = typeof schema.Block
export type NonotionPartialBlock = typeof schema.PartialBlock

/** Les types de blocs que l'éditeur sait afficher. */
export const BLOCK_TYPES: ReadonlySet<string> = new Set(Object.keys(schema.blockSchema))
