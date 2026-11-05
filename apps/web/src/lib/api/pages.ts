import {
  pageDetailSchema,
  pageTreeItemSchema,
  searchResultSchema,
  trashItemSchema,
  type PageContent,
} from '@nonotion/shared'
import { z } from 'zod'
import { apiGet, apiRequest } from './client'

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

export const createPage = (
  workspaceId: string,
  input: { title?: string; parent_page_id?: string | null; position?: string },
) =>
  apiRequest('POST', `workspaces/${workspaceId}/pages`, dataOf(pageDetailSchema), input).then(
    (r) => r.data,
  )

export type PagePatch = Partial<{
  title: string
  icon: string | null
  cover_url: string | null
  is_favorite: boolean
}>

export const updatePage = (pageId: string, patch: PagePatch) =>
  apiRequest('PATCH', `pages/${pageId}`, dataOf(pageTreeItemSchema), patch).then((r) => r.data)

/** Enregistre le document ; lève une ApiError 409 si la page a changé ailleurs (verrouillage optimiste). */
export const savePageContent = (pageId: string, content: PageContent, version: number) =>
  apiRequest('PUT', `pages/${pageId}/content`, dataOf(z.object({ version: z.number().int() })), {
    content,
    version,
  }).then((r) => r.data.version)

export const movePage = (pageId: string, parentId: string | null, position: string) =>
  apiRequest('POST', `pages/${pageId}/move`, dataOf(pageTreeItemSchema), {
    parent_page_id: parentId,
    position,
  }).then((r) => r.data)

export const duplicatePage = (pageId: string) =>
  apiRequest('POST', `pages/${pageId}/duplicate`, dataOf(pageDetailSchema)).then((r) => r.data)

export const trashPage = (pageId: string) => apiRequest('DELETE', `pages/${pageId}`, okSchema)

export const fetchTrash = (workspaceId: string) =>
  apiGet(`workspaces/${workspaceId}/trash`, dataOf(z.array(trashItemSchema))).then((r) => r.data)

export const restorePage = (pageId: string) =>
  apiRequest('POST', `pages/${pageId}/restore`, dataOf(pageTreeItemSchema)).then((r) => r.data)

export const deletePagePermanently = (pageId: string) =>
  apiRequest('DELETE', `pages/${pageId}/permanent`, okSchema)
