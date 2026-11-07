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
  /** Son UID iCalendar : l'Agenda (spec 6.15) n'affiche qu'une fois un événement présent dans deux agendas. */
  ics_uid: z.string().nullable().optional(),
  created_at: isoDate.nullable(),
  updated_at: isoDate.nullable(),
})

export const CALENDAR_MODES = ['subscription', 'one_shot'] as const

/** D'où vient un agenda : un lien ICS (lecture seule), ou un compte Google ou iCloud (spec 6.15). */
export const CALENDAR_KINDS = ['ics', 'google', 'icloud'] as const

/** Un agenda importé par lien ICS (spec 6.9). Le lien lui-même n'est jamais renvoyé : son domaine seulement. */
export const calendarSourceSchema = z.object({
  id: z.string(),
  database_id: z.string(),
  kind: z.enum(CALENDAR_KINDS).default('ics'),
  /** Le compte connecté d'un agenda Google ou iCloud. */
  account_id: z.string().nullable().optional(),
  /** Synchronisé dans les deux sens : ses événements se modifient dans Nonotion. */
  writable: z.boolean().default(false),
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

/** Un compte Google ou iCloud connecté (spec 6.15) ; ses identifiants ne quittent jamais le serveur. */
export const calendarAccountSchema = z.object({
  id: z.string(),
  provider: z.enum(['google', 'icloud']),
  account_email: z.string(),
  status: z.enum(['ok', 'error']),
  error_message: z.string().nullable(),
  last_sync_at: isoDate.nullable(),
})

/** Un agenda d'un compte connecté, et l'agenda Nonotion qui le synchronise déjà, s'il y en a un. */
export const remoteCalendarSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  writable: z.boolean(),
  source_id: z.string().nullable(),
})

/**
 * Les réglages de la page « Agenda » de l'espace (spec 6.15). On retient ce qui est masqué : une
 * nouvelle base, un nouvel agenda apparaissent d'eux-mêmes.
 */
export const agendaSettingsSchema = z.object({
  /** Les bases dont les éléments propres ne s'affichent pas. */
  hidden_databases: z.array(z.string()),
  /** Les agendas (ICS, Google, iCloud) masqués. */
  hidden_sources: z.array(z.string()),
  /** La couleur des éléments d'une base ; sans couleur, celle du thème. */
  colors: z.record(z.string(), z.enum(OPTION_COLORS)),
  /** La base des éléments créés depuis l'Agenda ; sinon la première affichée. */
  default_database_id: z.string().nullable(),
})

export const agendaSchema = z.object({
  settings: agendaSettingsSchema,
  /** Les bases de l'espace qui ont une Date, avec celle qui place leurs éléments. */
  databases: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      page_id: z.string(),
      date_property: z.string(),
      /** Une base créée pour un import, qui ne contient que ses événements : montrée par ses agendas. */
      imported_only: z.boolean(),
    }),
  ),
  sources: z.array(calendarSourceSchema),
  accounts: z.array(calendarAccountSchema).default([]),
  /** « Connecter Google Agenda » : seulement si le serveur a ses identifiants OAuth. */
  google_available: z.boolean().default(false),
})

export type DatabaseRowData = z.infer<typeof databaseRowSchema>
export type Agenda = z.infer<typeof agendaSchema>
export type AgendaSettings = z.infer<typeof agendaSettingsSchema>
export type CalendarAccount = z.infer<typeof calendarAccountSchema>
export type RemoteCalendar = z.infer<typeof remoteCalendarSchema>
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
  // Un agenda Google ou iCloud se modifie dans les deux sens (spec 6.15).
  if (source?.writable && source.kind !== 'ics') return new Set()
  return new Set(['title', ...Object.values(source?.property_map ?? {})])
}
