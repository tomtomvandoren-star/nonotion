import { z } from 'zod'
import { keepUploaded, storeLocalFile } from '@/lib/offline/files'
import { isNetworkError, isOnline } from '@/lib/offline/network'
import { enqueue, hasQueued } from '@/lib/offline/outbox'
import { newId } from '@/lib/offline/ulid'
import { platform } from '@/platform'
import { apiRequest } from './client'

const uploadSchema = z.object({
  id: z.string(),
  url: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
})

export type Upload = z.infer<typeof uploadSchema>

/**
 * Envoie un fichier dans une page (blocs Image, Vidéo, Audio, Fichier) ; renvoie son adresse. Dans
 * les applications, hors ligne, il attend sur l'appareil et la page reçoit une adresse locale,
 * remplacée par la vraie à son envoi (spec 6.16) ; envoyé, il y reste aussi en copie.
 */
export async function uploadFile(pageId: string, file: File): Promise<Upload> {
  // Choisi ici : renvoyé après une coupure, le fichier n'est jamais rangé deux fois.
  const id = newId()
  const queue = async (): Promise<Upload> => {
    const url = await storeLocalFile(id, file)
    enqueue({
      method: 'POST',
      path: `pages/${pageId}/files`,
      body: { upload: { id, name: file.name, type: file.type } },
      key: `upload:${id}`,
      label: `le fichier « ${file.name} »`,
    })
    return { id, url, name: file.name, mime: file.type, size: file.size }
  }
  // Hors ligne, ou la page elle-même attend encore son envoi : le fichier prend son tour.
  if (platform.offline && (!isOnline() || hasQueued())) return queue()
  const form = new FormData()
  form.append('file', file)
  form.append('id', id)
  try {
    const stored = await apiRequest('POST', `pages/${pageId}/files`, uploadSchema, form)
    void keepUploaded(stored.url, file)
    return stored
  } catch (error) {
    if (platform.offline && isNetworkError(error)) return queue()
    throw error
  }
}

export const linkPreviewSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  image: z.string().nullable(),
  icon: z.string().nullable(),
  site_name: z.string().nullable(),
})
export type LinkPreview = z.infer<typeof linkPreviewSchema>

/** L'aperçu d'un lien web, lu par le serveur (titre, description, image, icône). */
export const fetchLinkPreview = (url: string) =>
  apiRequest('POST', 'link-preview', z.object({ data: linkPreviewSchema }), { url }).then(
    (r) => r.data,
  )
