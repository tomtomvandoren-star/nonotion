import { VideoPreview } from '@blocknote/react'
import { videoEmbedUrl } from './urls'

type VideoRenderProps = Parameters<typeof VideoPreview>[0]

/** Une vidéo YouTube ou Vimeo dans son lecteur ; un fichier vidéo dans la balise <video>. */
export function VideoContent(props: VideoRenderProps) {
  const embed = videoEmbedUrl(props.block.props.url)
  if (!embed) return <VideoPreview {...props} />
  return (
    <iframe
      src={embed}
      title={props.block.props.name || 'Vidéo'}
      className="bn-visual-media"
      style={{
        width: props.block.props.previewWidth ?? 640,
        maxWidth: '100%',
        aspectRatio: '16 / 9',
        border: 0,
      }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      loading="lazy"
    />
  )
}
