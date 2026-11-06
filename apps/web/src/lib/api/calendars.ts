import {
  calendarPreviewSchema,
  calendarSourceSchema,
  databaseDetailSchema,
  type OptionColor,
  pageDetailSchema,
} from '@nonotion/shared'
import { z } from 'zod'
import { apiRequest } from './client'

/*
 * Agendas importés par lien ICS (spec 6.9). Le serveur télécharge et lit l'agenda : le navigateur
 * ne le pourrait pas (CORS), et le lien est un secret qu'il garde chiffré.
 */

export const previewCalendar = (input: { workspace_id: string; url: string; time_zone: string }) =>
  apiRequest(
    'POST',
    'calendar-sources/preview',
    z.object({ data: calendarPreviewSchema }),
    input,
  ).then((r) => r.data)

export type ImportInput = {
  url: string
  name: string
  color: OptionColor
  mode: 'subscription' | 'one_shot'
  /**
   * Une base existante, ou une nouvelle base d'événements créée sous cette page, ou au premier
   * niveau de cet espace de travail (depuis l'Agenda, spec 6.15).
   */
  database_id?: string
  page_id?: string
  workspace_id?: string
  time_zone: string
}

export const importCalendar = (input: ImportInput) =>
  apiRequest(
    'POST',
    'calendar-sources',
    z.object({
      data: calendarSourceSchema,
      imported: z.number().int(),
      database: databaseDetailSchema,
      page: pageDetailSchema.nullable(),
    }),
    input,
  )

export const syncCalendar = (sourceId: string) =>
  apiRequest(
    'POST',
    `calendar-sources/${sourceId}/sync`,
    z.object({ data: calendarSourceSchema, database: databaseDetailSchema }),
  )

export const updateCalendar = (
  sourceId: string,
  patch: { name?: string; color?: OptionColor; mode?: 'subscription' | 'one_shot' },
) =>
  apiRequest(
    'PATCH',
    `calendar-sources/${sourceId}`,
    z.object({ data: calendarSourceSchema }),
    patch,
  ).then((r) => r.data)

export const deleteCalendar = (sourceId: string) =>
  apiRequest(
    'DELETE',
    `calendar-sources/${sourceId}`,
    z.object({ data: z.object({ moved_to_trash: z.number().int() }) }),
  ).then((r) => r.data)
