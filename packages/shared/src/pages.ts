import { z } from 'zod'

const isoDate = z.iso.datetime({ offset: true })

/** Une page telle que la montre l'arbre de la barre latérale (sans son contenu). */
export const pageTreeItemSchema = z.object({
  id: z.string(),
  parent_page_id: z.string().nullable(),
  title: z.string(),
  icon: z.string().nullable(),
  is_favorite: z.boolean(),
  position: z.string(),
  updated_at: isoDate.nullable(),
})

/**
 * Document BlockNote : une liste de blocs. Le front le transmet tel quel,
 * sa structure détaillée appartient à l'éditeur (phase 2).
 */
export const pageContentSchema = z.array(z.record(z.string(), z.unknown())).nullable()

export const pageDetailSchema = pageTreeItemSchema.extend({
  workspace_id: z.string(),
  cover_url: z.string().nullable(),
  content: pageContentSchema,
  version: z.number().int().min(1),
  created_at: isoDate.nullable(),
})

export const trashItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().nullable(),
  deleted_at: isoDate,
})

export type PageTreeItem = z.infer<typeof pageTreeItemSchema>
export type PageDetail = z.infer<typeof pageDetailSchema>
export type PageContent = z.infer<typeof pageContentSchema>
export type TrashItem = z.infer<typeof trashItemSchema>
