import {
  databaseDetailSchema,
  pageDetailSchema,
  type DatabaseDetail,
  type PageDetail,
} from '@nonotion/shared'
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { apiGet, apiUrl, sendQueued } from '@/lib/api/client'
import { onReconnect, isOnline, watchNetwork } from './network'
import {
  configureOutbox,
  flushOutbox,
  hasQueued,
  loadOutbox,
  resetOutbox,
  useOutbox,
  useSavedVersions,
} from './outbox'
import { clearAll, readKey, writeKey } from './storage'

/*
 * Le travail hors ligne des applications natives (spec 6.16) : la copie locale des données (ce que
 * l'application a chargé, gardé sur l'appareil, et tout l'espace de travail tenu à jour), la file
 * d'attente des modifications, et leur envoi au retour de la connexion.
 */

/** Les données gardées sur l'appareil : profil, arbre, pages, bases, Agenda. */
const KEPT = new Set(['profile', 'tree', 'page', 'database', 'agenda'])
const QUERIES_KEY = 'queries'
/** Toutes les 5 minutes, la copie de l'espace de travail est remise à jour. */
const SYNC_EVERY_MS = 5 * 60_000

const offlineCopySchema = z.object({
  data: z.object({
    pages: z.array(pageDetailSchema),
    databases: z.array(databaseDetailSchema),
    page_ids: z.array(z.string()),
    database_ids: z.array(z.string()),
    server_time: z.string(),
  }),
})

/** Relit, avant le premier affichage, la copie locale et la file d'attente. */
export async function restoreOffline(queryClient: QueryClient): Promise<void> {
  const [state] = await Promise.all([readKey<unknown>(QUERIES_KEY), loadOutbox()])
  if (state) hydrate(queryClient, state as Parameters<typeof hydrate>[1])
}

/**
 * Garde la copie locale à jour sur l'appareil : une seconde après un changement, et tout de suite
 * quand une modification entre dans la file ou que l'application passe en arrière-plan ou se ferme
 * (ce qui est à l'écran à ce moment-là doit se retrouver à la réouverture).
 */
function persistQueries(queryClient: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const save = () => {
    if (timer) clearTimeout(timer)
    timer = null
    const state = dehydrate(queryClient, {
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' && KEPT.has(String(query.queryKey[0])),
    })
    void writeKey(QUERIES_KEY, state)
  }
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' && event.type !== 'removed') return
    timer ??= setTimeout(save, 1000)
  })
  // La file change : l'écran vient de montrer une modification pas encore envoyée.
  let queued = useOutbox.getState().entries
  useOutbox.subscribe((state) => {
    if (state.entries === queued) return
    queued = state.entries
    // Après la mise à jour de l'écran (la modification est appliquée juste après son ajout).
    setTimeout(save, 0)
  })
  window.addEventListener('pagehide', save)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save()
  })
}

let syncing = false

/**
 * Met à jour la copie de tout l'espace de travail : ce qui a changé depuis la dernière fois, en un
 * appel. Seulement quand la file est vide : une modification pas encore envoyée n'est jamais écrasée.
 */
export async function syncWorkspace(queryClient: QueryClient): Promise<void> {
  const profile = queryClient.getQueryData<{ workspaces: { id: string }[] }>(['profile'])
  const workspaceId = profile?.workspaces[0]?.id
  if (!workspaceId || syncing || hasQueued() || !isOnline()) return
  syncing = true
  try {
    const sinceKey = `since:${workspaceId}`
    const since = await readKey<string>(sinceKey)
    const query = since ? `?${new URLSearchParams({ since })}` : ''
    const { data } = await apiGet(`workspaces/${workspaceId}/offline${query}`, offlineCopySchema)
    if (hasQueued()) return
    for (const page of data.pages) queryClient.setQueryData<PageDetail>(['page', page.id], page)
    for (const database of data.databases)
      queryClient.setQueryData<DatabaseDetail>(['database', database.id], database)
    // Ce qui n'existe plus (corbeille, supprimé ailleurs) quitte la copie.
    const pages = new Set(data.page_ids)
    const databases = new Set(data.database_ids)
    for (const query of queryClient.getQueryCache().findAll({ queryKey: ['page'] }))
      if (!pages.has(String(query.queryKey[1])))
        queryClient.removeQueries({ queryKey: query.queryKey, exact: true })
    for (const query of queryClient.getQueryCache().findAll({ queryKey: ['database'] }))
      if (!databases.has(String(query.queryKey[1])))
        queryClient.removeQueries({ queryKey: query.queryKey, exact: true })
    await queryClient.invalidateQueries({ queryKey: ['tree'] })
    await writeKey(sinceKey, data.server_time)
  } catch {
    // Hors ligne ou serveur indisponible : la copie attend la prochaine fois.
  } finally {
    syncing = false
  }
}

/** Démarre le travail hors ligne : file d'attente, copie locale, synchronisation. */
export function startOffline(queryClient: QueryClient): void {
  configureOutbox({
    send: sendQueued,
    onDrained: () => {
      void queryClient.invalidateQueries().then(() => syncWorkspace(queryClient))
    },
    onRejected: (entry, message) =>
      toast.error(`Une modification faite hors ligne a été refusée (${entry.label}) : ${message}`),
    onContentSaved: (pageId, version) => {
      // D'abord la page ouverte (son prochain envoi repart de là), puis la copie.
      useSavedVersions.setState({ [pageId]: version })
      queryClient.setQueryData<PageDetail>(['page', pageId], (page) =>
        page ? { ...page, version } : page,
      )
    },
  })
  watchNetwork(apiUrl('health'))
  persistQueries(queryClient)

  const catchUp = () => {
    if (hasQueued()) void flushOutbox()
    else void syncWorkspace(queryClient)
  }
  onReconnect(catchUp)
  catchUp()
  setInterval(() => {
    if (document.visibilityState === 'visible') catchUp()
  }, SYNC_EVERY_MS)
}

/** Ce qui attend encore d'être envoyé (pour prévenir avant de se déconnecter). */
export const pendingChanges = () => useOutbox.getState().entries.length

/** Se déconnecter : la copie locale et la file d'attente disparaissent de l'appareil. */
export async function forgetOffline(queryClient: QueryClient): Promise<void> {
  resetOutbox()
  useSavedVersions.setState({}, true)
  queryClient.clear()
  await clearAll()
}
