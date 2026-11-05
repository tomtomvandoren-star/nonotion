import {
  databaseDetailSchema,
  databaseRowSchema,
  databaseViewSchema,
  pageDetailSchema,
  type Property,
  type ViewConfig,
  type ViewType,
} from '@nonotion/shared'
import { z } from 'zod'
import { apiGet, apiRequest } from './client'

const dataOf = <T extends z.ZodType>(schema: T) => z.object({ data: schema })

export const fetchDatabase = (databaseId: string) =>
  apiGet(`databases/${databaseId}`, dataOf(databaseDetailSchema)).then((r) => r.data)

/**
 * Une nouvelle base : en ligne dans `pageId`, ou dans une nouvelle sous-page (pleine page).
 * `template: 'tasks'` crée le Gestionnaire de tâches (spec 6.7).
 */
export const createDatabase = (
  workspaceId: string,
  input: { page_id: string; full_page?: boolean; title?: string; template?: 'tasks' },
) =>
  apiRequest(
    'POST',
    `workspaces/${workspaceId}/databases`,
    z.object({ data: databaseDetailSchema, page: pageDetailSchema }),
    input,
  )

/** Le lien d'abonnement (ICS) de la base, pour Google Agenda ou le Calendrier Apple. */
export const createFeed = (databaseId: string) =>
  apiRequest(
    'POST',
    `databases/${databaseId}/feed`,
    dataOf(z.object({ feed_url: z.string() })),
  ).then((r) => r.data)

export const deleteFeed = (databaseId: string) =>
  apiRequest('DELETE', `databases/${databaseId}/feed`, z.unknown())

export const renameDatabase = (databaseId: string, title: string) =>
  apiRequest('PATCH', `databases/${databaseId}`, z.unknown(), { title })

export const createRow = (
  databaseId: string,
  input: { title?: string; properties?: Record<string, unknown>; position?: string },
) =>
  apiRequest('POST', `databases/${databaseId}/rows`, dataOf(databaseRowSchema), input).then(
    (r) => r.data,
  )

/** Ce qui change d'une ligne : son titre, des valeurs, ou sa place (glisser une carte). */
export type RowPatch = { title?: string; properties?: Record<string, unknown>; position?: string }

/**
 * Titre ou valeurs d'une ligne : seules les propriétés envoyées changent. `created` : la prochaine
 * occurrence d'une tâche récurrente qui vient d'être terminée (spec 6.7).
 */
export const updateRow = (rowId: string, patch: RowPatch, options?: { keepalive?: boolean }) =>
  apiRequest(
    'PATCH',
    `pages/${rowId}`,
    z.object({
      data: z.object({ id: z.string(), properties: z.record(z.string(), z.unknown()) }),
      created: databaseRowSchema.optional(),
    }),
    patch,
    options,
  )

export const addProperty = (databaseId: string, property: Property) =>
  apiRequest('POST', `databases/${databaseId}/properties`, dataOf(databaseDetailSchema), {
    property,
  }).then((r) => r.data)

export const updateProperty = (databaseId: string, property: Property) =>
  apiRequest(
    'PATCH',
    `databases/${databaseId}/properties/${property.id}`,
    dataOf(databaseDetailSchema),
    { property },
  ).then((r) => r.data)

export const deleteProperty = (databaseId: string, propertyId: string) =>
  apiRequest(
    'DELETE',
    `databases/${databaseId}/properties/${propertyId}`,
    dataOf(databaseDetailSchema),
  ).then((r) => r.data)

export const createView = (
  databaseId: string,
  input: { name: string; type: ViewType; config: ViewConfig },
) =>
  apiRequest('POST', `databases/${databaseId}/views`, dataOf(databaseViewSchema), input).then(
    (r) => r.data,
  )

export const updateView = (
  viewId: string,
  patch: { name?: string; config?: ViewConfig; position?: string },
  options?: { keepalive?: boolean },
) =>
  apiRequest('PATCH', `views/${viewId}`, dataOf(databaseViewSchema), patch, options).then(
    (r) => r.data,
  )

export const duplicateView = (viewId: string) =>
  apiRequest('POST', `views/${viewId}/duplicate`, dataOf(databaseViewSchema)).then((r) => r.data)

export const deleteView = (viewId: string) => apiRequest('DELETE', `views/${viewId}`, z.unknown())
