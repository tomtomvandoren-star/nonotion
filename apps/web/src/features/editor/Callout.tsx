import { defaultProps } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'
import { IconPicker } from '@/features/page/IconPicker'
import { cn } from '@/lib/utils'

export const CALLOUT_DEFAULT_EMOJI = '💡'

/**
 * L'encadré (callout) : un émoji puis du texte, sur un fond doux, pour mettre une note en évidence.
 * Ce n'est pas un bloc fourni par BlockNote : il est construit ici avec son API de blocs.
 */
export const createCalloutBlockSpec = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: {
      textColor: defaultProps.textColor,
      backgroundColor: defaultProps.backgroundColor,
      emoji: { default: CALLOUT_DEFAULT_EMOJI },
    },
    content: 'inline',
  },
  {
    render: ({ block, editor, contentRef }) => (
      <div
        className={cn(
          'nn-callout',
          // Une couleur choisie dans le menu du bloc remplace le fond par défaut de l'encadré.
          block.props.backgroundColor === 'default' && 'nn-callout-default',
        )}
      >
        <span contentEditable={false} className="nn-callout-icon">
          <IconPicker
            onSelect={(emoji) => editor.updateBlock(block, { props: { emoji } })}
            trigger={
              <button
                type="button"
                aria-label="Changer l’émoji de l’encadré"
                disabled={!editor.isEditable}
                className="flex size-7 items-center justify-center rounded-sm text-lg hover:bg-accent touch:size-11"
              >
                {block.props.emoji}
              </button>
            }
          />
        </span>
        <div className="nn-callout-text" ref={contentRef} />
      </div>
    ),
  },
)
