import { createReactBlockSpec } from '@blocknote/react'
import { BookmarkCard, BookmarkForm } from './BookmarkView'
import { isWebUrl } from './urls'

const bookmarkConfig = {
  type: 'bookmark',
  propSchema: {
    url: { default: '' },
    title: { default: '' },
    description: { default: '' },
    image: { default: '' },
    icon: { default: '' },
    siteName: { default: '' },
  },
  content: 'none',
} as const

/**
 * Aperçu d'un lien web (« / Aperçu de lien ») : le titre, la description et l'image de la page,
 * lus une fois par le serveur et gardés dans le bloc. Toucher l'aperçu ouvre le lien.
 */
export const createBookmarkBlockSpec = createReactBlockSpec(bookmarkConfig, {
  render: ({ block, editor }) =>
    isWebUrl(block.props.url) ? (
      <BookmarkCard {...block.props} />
    ) : (
      <BookmarkForm
        editable={editor.isEditable}
        onDone={(props) => editor.updateBlock(block, { props })}
      />
    ),
  toExternalHTML: ({ block }) =>
    isWebUrl(block.props.url) ? (
      <p>
        <a href={block.props.url}>{block.props.title || block.props.url}</a>
      </p>
    ) : (
      <p />
    ),
})
