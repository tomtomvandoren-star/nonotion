import {
  agendaSchema,
  databaseDetailSchema,
  pageDetailSchema,
  trashItemSchema,
  type DatabaseDetail,
  type PageDetail,
} from '@nonotion/shared'
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { apiGet, apiUrl, fetchUploadContent, sendQueued } from '@/lib/api/client'
import {
  clearFiles,
  configureFiles,
  evictFiles,
  loadReplaced,
  LOCAL_FILE,
  settleLocalFile,
} from './files'
import { onReconnect, isOnline, watchNetwork } from './network'
import {
  configureOutbox,
  flushOutbox,
  hasQueued,
  isUpload,
  loadOutbox,
  replaceInQueue,
  resetOutbox,
  type OutboxEntry,
  useOutbox,
  useSavedVersions,
} from './outbox'
import { clearAll, readKey, writeKey } from './storage'

/*
 * Le travail hors ligne des applications natives (spec 6.16) : la copie locale des données (ce que
 * l'application a chargé, gardé sur l'appareil, et tout l'espace de travail tenu à jour), la file
 * d'attente des modifications, et leur envoi au retour de la connexion.
 */

/**
 * Les données gardées sur l'appareil : profil, arbre, pages, bases, Agenda, corbeille, et les
 * listes de Planifier telles que vues la dernière fois.
 */
const KEPT = new Set([
  'profile',
  'tree',
  'page',
  'database',
  'agenda',
  'trash',
  'scheduling-links',
  'freebusy-shares',
])
const QUERIES_KEY = 'queries'
/** Toutes les 5 minutes, la copie de l'espace de travail est remise à jour. */
const SYNC_EVERY_MS = 5 * 60_000

const offlineCopySchema = z.object({
  data: z.object({
    pages: z.array(pageDetailSchema),
    databases: z.array(databaseDetailSchema),
    page_ids: z.array(z.string()),
    database_ids: z.array(z.string()),
    agenda: agendaSchema,
    trash: z.array(trashItemSchema),
    server_time: z.string(),
  }),
})

/** Relit, avant le premier affichage, la copie locale et la file d'attente. */
export async function restoreOffline(queryClient: QueryClient): Promise<void> {
  const [state] = await Promise.all([readKey<unknown>(QUERIES_KEY), loadOutbox(), loadReplaced()])
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
    queryClient.setQueryData(['agenda', workspaceId], data.agenda)
    queryClient.setQueryData(['trash', workspaceId], data.trash)
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

/** Remplace une adresse dans les pages gardées (l'adresse locale d'un fichier ajouté hors ligne). */
function replaceInPages(queryClient: QueryClient, from: string, to: string) {
  const needle = JSON.stringify(from).slice(1, -1)
  const target = JSON.stringify(to).slice(1, -1)
  for (const query of queryClient.getQueryCache().findAll({ queryKey: ['page'] })) {
    const json = JSON.stringify(query.state.data)
    if (json?.includes(needle))
      queryClient.setQueryData(query.queryKey, JSON.parse(json.split(needle).join(target)))
  }
}

/**
 * Un fichier ajouté hors ligne est arrivé (ou a été refusé : '') : ce qui attend encore, et les pages
 * gardées, citent désormais sa vraie adresse ; sa copie passe sous cette adresse.
 */
function settleUpload(queryClient: QueryClient, entry: OutboxEntry, url: string) {
  const { id } = (entry.body as { upload: { id: string } }).upload
  replaceInQueue(`${LOCAL_FILE}${id}`, url)
  replaceInPages(queryClient, `${LOCAL_FILE}${id}`, url)
  void settleLocalFile(id, url)
}

/** Démarre le travail hors ligne : file d'attente, copie locale, synchronisation. */
export function startOffline(queryClient: QueryClient): void {
  configureFiles(fetchUploadContent)
  void evictFiles()
  configureOutbox({
    send: sendQueued,
    onDrained: () => {
      void queryClient.invalidateQueries().then(() => syncWorkspace(queryClient))
    },
    onSent: (entry, data) => {
      const url = (data as { url?: unknown } | null)?.url
      if (isUpload(entry) && typeof url === 'string') settleUpload(queryClient, entry, url)
    },
    onRejected: (entry, message) => {
      if (isUpload(entry)) settleUpload(queryClient, entry, '')
      toast.error(`Une modification faite hors ligne a été refusée (${entry.label}) : ${message}`)
    },
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
  // Juste après la connexion (ou au premier lancement), le profil arrive après ce premier essai : la
  // copie de l'espace de travail se fait dès qu'il est là, sans attendre 5 minutes.
  let copiedFor: string | undefined = queryClient.getQueryData<{ workspaces: { id: string }[] }>([
    'profile',
  ])?.workspaces[0]?.id
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.query.queryKey[0] !== 'profile') return
    const workspaceId = (event.query.state.data as { workspaces?: { id: string }[] } | undefined)
      ?.workspaces?.[0]?.id
    if (!workspaceId || workspaceId === copiedFor) return
    copiedFor = workspaceId
    catchUp()
  })
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
  await Promise.all([clearAll(), clearFiles()])
}
