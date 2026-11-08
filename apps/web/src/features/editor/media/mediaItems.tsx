import {
  FilePanelExtension,
  FormattingToolbarExtension,
  insertOrUpdateBlockForSlashMenu,
} from '@blocknote/core/extensions'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { AudioLines, Globe, Image, type LucideIcon, Paperclip, Video } from 'lucide-react'
import type { NonotionEditor, NonotionPartialBlock } from '../schema'

/** Le groupe « Média » du menu « / » : des fichiers (envoyés ou par un lien) et l'aperçu d'un lien. */
export function mediaItems(editor: NonotionEditor): DefaultReactSuggestionItem[] {
  // Le bloc apparaît vide, avec le panneau « Depuis l'appareil » / « Lien » ouvert dessus.
  const fileItem = (
    type: 'image' | 'video' | 'audio' | 'file',
    title: string,
    subtext: string,
    aliases: string[],
    Icon: LucideIcon,
  ): DefaultReactSuggestionItem => ({
    title,
    subtext,
    aliases,
    group: 'Média',
    icon: <Icon aria-hidden size={18} />,
    onItemClick: () => {
      const block = insertOrUpdateBlockForSlashMenu(editor, { type } as NonotionPartialBlock)
      editor.getExtension(FilePanelExtension)?.showMenu(block.id)
      editor.getExtension(FormattingToolbarExtension)?.store.setState(false)
    },
  })

  return [
    fileItem(
      'image',
      'Image',
      'Depuis vos fichiers, ou par un lien',
      ['image', 'photo', 'img', 'picture', 'média', 'media'],
      Image,
    ),
    fileItem(
      'video',
      'Vidéo',
      'Un fichier vidéo, ou un lien (YouTube, Vimeo…)',
      ['vidéo', 'video', 'film', 'youtube', 'vimeo', 'mp4', 'média', 'media'],
      Video,
    ),
    fileItem(
      'audio',
      'Audio',
      'Un son ou un enregistrement, depuis vos fichiers ou par un lien',
      ['audio', 'son', 'musique', 'mp3', 'podcast', 'enregistrement', 'média', 'media'],
      AudioLines,
    ),
    fileItem(
      'file',
      'Fichier',
      'Un document (PDF…), depuis vos fichiers ou par un lien',
      ['fichier', 'file', 'document', 'pdf', 'pièce jointe', 'attachment', 'média', 'media'],
      Paperclip,
    ),
    {
      title: 'Aperçu de lien',
      subtext: 'Un lien web, avec le titre et l’image de la page',
      aliases: ['aperçu', 'lien web', 'signet', 'bookmark', 'link preview', 'url', 'web', 'média'],
      group: 'Média',
      icon: <Globe aria-hidden size={18} />,
      onItemClick: () => {
        const block = insertOrUpdateBlockForSlashMenu(editor, {
          type: 'bookmark',
        } as NonotionPartialBlock)
        // Le champ du lien prend la main dès que le bloc est affiché.
        requestAnimationFrame(() =>
          editor.domElement
            ?.querySelector<HTMLInputElement>(`[data-id="${block.id}"] .nn-bookmark-form input`)
            ?.focus(),
        )
      },
    },
  ]
}
