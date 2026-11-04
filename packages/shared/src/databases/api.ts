import { z } from 'zod'
import { propertySchema } from './properties'
import { VIEW_TYPES, viewConfigSchema } from './views'

const isoDate = z.iso.datetime({ offset: true })

/** Une ligne telle que la renvoie l'API : une page, sans son contenu (chargé à l'ouverture). */
export const databaseRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().nullable(),
  properties: z.record(z.string(), z.unknown()),
  position: z.string(),
  created_at: isoDate.nullable(),
  updated_at: isoDate.nullable(),
})

export const databaseViewSchema = z.object({
  id: z.string(),
  database_id: z.string(),
  name: z.string(),
  type: z.enum(VIEW_TYPES),
  position: z.string(),
  config: viewConfigSchema,
})

/** Une base, ses vues et toutes ses lignes : une seule requête (filtrage côté client, spec 6.6). */
export const databaseDetailSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  page_id: z.string(),
  title: z.string(),
  schema: z.array(propertySchema),
  views: z.array(databaseViewSchema),
  rows: z.array(databaseRowSchema),
})

export type DatabaseRowData = z.infer<typeof databaseRowSchema>
export type DatabaseView = z.infer<typeof databaseViewSchema>
export type DatabaseDetail = z.infer<typeof databaseDetailSchema>
