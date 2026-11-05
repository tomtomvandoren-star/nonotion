import { createReactBlockSpec } from '@blocknote/react'
import { DatabaseView } from './DatabaseView'

/**
 * Le bloc qui affiche une base dans le document d'une page (spec 6.4, « base en ligne »).
 * Il n'est pas sélectionnable comme du texte : cliquer, taper ou glisser dedans appartient à la base,
 * jamais à l'éditeur de la page (une lettre tapée dans une cellule ne part pas dans le document).
 */
export const createDatabaseBlockSpec = createReactBlockSpec(
  {
    type: 'database',
    propSchema: {
      databaseId: { default: '' },
      /** Base « en pleine page » : la page n'a qu'elle, son titre est celui de la page. */
      fullPage: { default: false },
    },
    content: 'none',
  },
  {
    meta: { selectable: false },
    render: ({ block }) => (
      <div contentEditable={false} className="w-full min-w-0">
        {block.props.databaseId ? (
          <DatabaseView databaseId={block.props.databaseId} showTitle={!block.props.fullPage} />
        ) : (
          <p className="my-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            Création de la base de données…
          </p>
        )}
      </div>
    ),
    // Copier-coller ou exporter : le contenu de la base ne voyage pas, seulement sa mention.
    toExternalHTML: () => <p>Base de données</p>,
  },
)
