import { createVideoBlockConfig, videoParse } from '@blocknote/core'
import {
  createReactBlockSpec,
  ResizableFileBlockWrapper,
  VideoToExternalHTML,
} from '@blocknote/react'
import { Video } from 'lucide-react'
import { VideoContent } from './VideoContent'

type WrapperProps = Omit<Parameters<typeof ResizableFileBlockWrapper>[0], 'children' | 'buttonIcon'>

/**
 * Le bloc Vidéo de BlockNote (envoi d'un fichier ou lien, légende, largeur ajustable), qui sait
 * aussi lire un lien YouTube ou Vimeo : c'est ce que la plupart des gens collent.
 */
export const createVideoBlockSpec = createReactBlockSpec(createVideoBlockConfig, (config) => ({
  meta: { fileBlockAccept: ['video/*'] },
  render: (props) => (
    // Le cadre des blocs fichier de BlockNote est typé pour son bloc « file » : même forme ici.
    <ResizableFileBlockWrapper
      {...(props as unknown as WrapperProps)}
      buttonIcon={<Video aria-hidden size={24} />}
    >
      <VideoContent {...props} />
    </ResizableFileBlockWrapper>
  ),
  parse: videoParse(config),
  toExternalHTML: VideoToExternalHTML,
  runsBefore: ['file'],
}))
