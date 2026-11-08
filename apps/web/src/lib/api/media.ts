import { z } from 'zod'
import { apiRequest } from './client'

const uploadSchema = z.object({
  id: z.string(),
  url: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
})

/** Envoie un fichier dans une page (blocs Image, Vidéo, Audio, Fichier) ; renvoie son adresse. */
export function uploadFile(pageId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return apiRequest('POST', `pages/${pageId}/files`, uploadSchema, form)
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
