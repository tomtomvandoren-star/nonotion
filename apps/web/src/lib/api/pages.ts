import {
  pageDetailSchema,
  pageTreeItemSchema,
  searchResultSchema,
  trashItemSchema,
  type PageContent,
  type PageDetail,
  type PageTreeItem,
} from '@nonotion/shared'
import { z } from 'zod'
import { apiGet, apiRequest, inData, type OfflineWrite } from './client'

const okSchema = z.object({ status: z.literal('ok') })
const dataOf = <T extends z.ZodType>(schema: T) => z.object({ data: schema })

export const fetchTree = (workspaceId: string) =>
  apiGet(`workspaces/${workspaceId}/pages`, dataOf(z.array(pageTreeItemSchema))).then((r) => r.data)

/** Recherche plein texte dans les titres et le texte des pages (spec 6.12). */
export const searchPages = (workspaceId: string, q: string, signal?: AbortSignal) =>
  apiGet(
    `workspaces/${workspaceId}/search?${new URLSearchParams({ q })}`,
    dataOf(z.array(searchResultSchema)),
    signal,
  ).then((r) => r.data)

export const fetchPage = (pageId: string) =>
  apiGet(`pages/${pageId}`, dataOf(pageDetailSchema)).then((r) => r.data)

/** `id` : choisi sur l'appareil, pour une page créée hors ligne (spec 6.16). */
export const createPage = (
  workspaceId: string,
  input: { id?: string; title?: string; parent_page_id?: string | null; position?: string },
  offline?: OfflineWrite<PageDetail>,
) =>
  apiRequest('POST', `workspaces/${workspaceId}/pages`, dataOf(pageDetailSchema), input, {
    offline: inData(offline),
  }).then((r) => r.data)

export type PagePatch = Partial<{
  title: string
  icon: string | null
  cover_url: string | null
  is_favorite: boolean
  /** « Ignorer » la version écartée d'un conflit de synchronisation (spec 6.15). */
  sync_conflict: null
}>

/**
 * Les navigateurs gardent en vie au plus 64 Ko de requêtes keepalive à la fois : un document plus
 * gros part en requête ordinaire.
 */
const KEEPALIVE_MAX_CHARS = 48_000

// Keepalive : un titre tapé juste avant de recharger ou de fermer l'onglet arrive quand même.
export const updatePage = (
  pageId: string,
  patch: PagePatch,
  offline?: OfflineWrite<PageTreeItem>,
) =>
  apiRequest('PATCH', `pages/${pageId}`, dataOf(pageTreeItemSchema), patch, {
    keepalive: true,
    offline: inData(offline),
  }).then((r) => r.data)

/** Enregistre le document ; lève une ApiError 409 si la page a changé ailleurs (verrouillage optimiste). */
export const savePageContent = (
  pageId: string,
  content: PageContent,
  version: number,
  offline?: OfflineWrite<{ version: number }>,
) => {
  const body = { content, version }
  return apiRequest(
    'PUT',
    `pages/${pageId}/content`,
    dataOf(z.object({ version: z.number().int() })),
    body,
    {
      keepalive: JSON.stringify(body).length <= KEEPALIVE_MAX_CHARS,
      offline: inData(offline),
    },
  ).then((r) => r.data.version)
}

export const movePage = (
  pageId: string,
  parentId: string | null,
  position: string,
  offline?: OfflineWrite<PageTreeItem>,
) =>
  apiRequest(
    'POST',
    `pages/${pageId}/move`,
    dataOf(pageTreeItemSchema),
    { parent_page_id: parentId, position },
    { offline: inData(offline) },
  ).then((r) => r.data)

export const duplicatePage = (pageId: string) =>
  apiRequest('POST', `pages/${pageId}/duplicate`, dataOf(pageDetailSchema)).then((r) => r.data)

export const trashPage = (pageId: string, offline?: OfflineWrite<{ status: 'ok' }>) =>
  apiRequest('DELETE', `pages/${pageId}`, okSchema, undefined, { offline })

export const fetchTrash = (workspaceId: string) =>
  apiGet(`workspaces/${workspaceId}/trash`, dataOf(z.array(trashItemSchema))).then((r) => r.data)

export const restorePage = (pageId: string, offline?: OfflineWrite<PageTreeItem>) =>
  apiRequest('POST', `pages/${pageId}/restore`, dataOf(pageTreeItemSchema), undefined, {
    offline: inData(offline),
  }).then((r) => r.data)

export const deletePagePermanently = (pageId: string) =>
  apiRequest('DELETE', `pages/${pageId}/permanent`, okSchema)
