import { z } from 'zod'
import { OPTION_COLORS, propertySchema } from './properties'
import { VIEW_TYPES, viewConfigSchema } from './views'

const isoDate = z.iso.datetime({ offset: true })

/** Une ligne telle que la renvoie l'API : une page, sans son contenu (chargé à l'ouverture). */
export const databaseRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().nullable(),
  properties: z.record(z.string(), z.unknown()),
  position: z.string(),
  /** Un événement importé d'un agenda (spec 6.9) : titre et date en lecture seule. */
  calendar_source_id: z.string().nullable().optional(),
  created_at: isoDate.nullable(),
  updated_at: isoDate.nullable(),
})

export const CALENDAR_MODES = ['subscription', 'one_shot'] as const

/** Un agenda importé par lien ICS (spec 6.9). Le lien lui-même n'est jamais renvoyé : son domaine seulement. */
export const calendarSourceSchema = z.object({
  id: z.string(),
  database_id: z.string(),
  name: z.string(),
  color: z.enum(OPTION_COLORS),
  url_host: z.string(),
  mode: z.enum(CALENDAR_MODES),
  status: z.enum(['pending', 'ok', 'error']),
  error_message: z.string().nullable(),
  last_sync_at: isoDate.nullable(),
  events_count: z.number().int(),
  /** Les propriétés que l'agenda remplit : date, lieu, lien. */
  property_map: z.record(z.string(), z.string()),
})

/** L'aperçu avant import (spec 6.9, étape 2). */
export const calendarPreviewSchema = z.object({
  /** Le nom que l'agenda se donne (X-WR-CALNAME), proposé pour le nôtre. */
  name: z.string().nullable(),
  total: z.number().int(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  events: z.array(
    z.object({
      title: z.string(),
      start: z.string(),
      end: z.string().nullable(),
      time_zone: z.string().nullable(),
      location: z.string(),
    }),
  ),
  warnings: z.array(z.string()),
  duplicate: z.object({ id: z.string(), name: z.string(), database_id: z.string() }).nullable(),
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
  sources: z.array(calendarSourceSchema).default([]),
  /** Le lien d'abonnement pour Google Agenda ou le Calendrier Apple, s'il est créé. */
  feed_url: z.string().nullable().optional(),
})

export type DatabaseRowData = z.infer<typeof databaseRowSchema>
export type DatabaseView = z.infer<typeof databaseViewSchema>
export type DatabaseDetail = z.infer<typeof databaseDetailSchema>
export type CalendarSource = z.infer<typeof calendarSourceSchema>
export type CalendarPreview = z.infer<typeof calendarPreviewSchema>

/**
 * Ce qu'on ne modifie pas dans un événement importé : son titre et les propriétés que l'agenda
 * remplit (une resynchronisation les écraserait). Vide pour une ligne ordinaire.
 */
export function importedLocks(
  database: Pick<DatabaseDetail, 'sources'>,
  row: Pick<DatabaseRowData, 'calendar_source_id'>,
): Set<string> {
  if (!row.calendar_source_id) return new Set()
  const source = database.sources.find((item) => item.id === row.calendar_source_id)
  return new Set(['title', ...Object.values(source?.property_map ?? {})])
}
