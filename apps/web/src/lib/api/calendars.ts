import {
  calendarAccountSchema,
  calendarPreviewSchema,
  calendarSourceSchema,
  databaseDetailSchema,
  type OptionColor,
  pageDetailSchema,
  remoteCalendarSchema,
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

/*
 * Comptes Google et iCloud connectés (spec 6.15). Aucun jeton ni mot de passe ne revient : le
 * serveur les garde chiffrés.
 */

/** L'adresse de la page de connexion de Google, à ouvrir dans le navigateur. */
export const connectGoogle = (workspaceId: string) =>
  apiRequest(
    'POST',
    `workspaces/${workspaceId}/calendar-accounts/google`,
    z.object({ data: z.object({ url: z.string() }) }),
  ).then((r) => r.data)

export const connectICloud = (
  workspaceId: string,
  credentials: { username: string; password: string },
) =>
  apiRequest(
    'POST',
    `workspaces/${workspaceId}/calendar-accounts/icloud`,
    z.object({ data: calendarAccountSchema }),
    credentials,
  ).then((r) => r.data)

export const fetchAccountCalendars = (accountId: string) =>
  apiRequest(
    'GET',
    `calendar-accounts/${accountId}/calendars`,
    z.object({ data: z.array(remoteCalendarSchema) }),
  ).then((r) => r.data)

export type AddAccountCalendarInput = {
  remote_id: string
  name: string
  color: OptionColor
  /** Une base existante, ou une nouvelle base d'événements au premier niveau de l'espace. */
  database_id?: string
  workspace_id?: string
}

export const addAccountCalendar = (accountId: string, input: AddAccountCalendarInput) =>
  apiRequest(
    'POST',
    `calendar-accounts/${accountId}/calendars`,
    z.object({
      data: calendarSourceSchema,
      imported: z.number().int(),
      database: databaseDetailSchema,
      page: pageDetailSchema.nullable(),
    }),
    input,
  )

export const disconnectAccount = (accountId: string) =>
  apiRequest(
    'DELETE',
    `calendar-accounts/${accountId}`,
    z.object({ data: z.object({ moved_to_trash: z.number().int() }) }),
  ).then((r) => r.data)
