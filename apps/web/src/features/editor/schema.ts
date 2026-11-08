import { BlockNoteSchema, createHeadingBlockSpec, defaultBlockSpecs } from '@blocknote/core'
import { createDatabaseBlockSpec } from '@/features/databases/DatabaseBlock'
import { createCalloutBlockSpec } from './Callout'
import { createBookmarkBlockSpec } from './media/Bookmark'
import { createVideoBlockSpec } from './media/VideoBlock'
import { createPageLinkBlockSpec } from './PageLink'

/**
 * Les blocs de la phase 2 (spec 9) : texte, titres, listes, to-do, liste dépliable, citation,
 * séparateur, code et encadré ; la base de données en ligne (phase 3) ; le groupe « Média » :
 * image, vidéo (fichier, YouTube, Vimeo), audio, fichier et aperçu d'un lien web. Le tableau de
 * BlockNote n'est pas proposé : les bases de données en tiennent lieu.
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
    database: createDatabaseBlockSpec(),
    pageLink: createPageLinkBlockSpec(),
    image: defaultBlockSpecs.image,
    video: createVideoBlockSpec(),
    audio: defaultBlockSpecs.audio,
    file: defaultBlockSpecs.file,
    bookmark: createBookmarkBlockSpec(),
  },
})

export type NonotionEditor = typeof schema.BlockNoteEditor
export type NonotionBlock = typeof schema.Block
export type NonotionPartialBlock = typeof schema.PartialBlock

/** Les types de blocs que l'éditeur sait afficher. */
export const BLOCK_TYPES: ReadonlySet<string> = new Set(Object.keys(schema.blockSchema))
