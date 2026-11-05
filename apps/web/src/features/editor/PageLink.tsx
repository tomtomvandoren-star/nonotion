import { createReactBlockSpec } from '@blocknote/react'
import { PageLink } from './PageLinkView'

/**
 * Un lien vers une autre page, dans le document (« / Lien vers une page », « / Nouvelle page »).
 * Le titre et l'icône sont toujours ceux de la page liée, à jour : renommer la page renomme le lien.
 */
export const createPageLinkBlockSpec = createReactBlockSpec(
  {
    type: 'pageLink',
    propSchema: { pageId: { default: '' } },
    content: 'none',
  },
  {
    render: ({ block }) => <PageLink pageId={block.props.pageId} />,
    toExternalHTML: ({ block }) => (
      <p>
        <a href={`/p/${block.props.pageId}`}>Page liée</a>
      </p>
    ),
  },
)
