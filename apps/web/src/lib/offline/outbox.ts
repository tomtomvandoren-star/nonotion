import type { PageContent } from '@nonotion/shared'
import { create } from 'zustand'
import { isNetworkError, isOnline, markOffline, markOnline } from './network'
import { readKey, writeKey } from './storage'
import { newId } from './ulid'

/**
 * La file d'attente des modifications faites hors ligne (spec 6.16). Chacune est la requête qui
 * serait partie, gardée sur l'appareil (elle survit à la fermeture de l'application) et envoyée dans
 * l'ordre au retour de la connexion. Deux modifications du même objet n'en font qu'une : le dernier
 * document d'une page, les champs d'une ligne réunis.
 */

export type WriteMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * Comment une modification se fond dans celle du même objet qui attend déjà : `replace` garde la
 * dernière, `patch` réunit les champs (et les valeurs des propriétés), `content` garde le dernier
 * document mais la version de départ (celle d'où l'on a commencé à écrire hors ligne).
 */
export type Merge = 'replace' | 'patch' | 'content'

export interface OutboxEntry {
  id: string
  method: WriteMethod
  path: string
  body?: unknown
  /** Le même objet : deux entrées de même clé fusionnent. */
  key?: string
  merge?: Merge
  /** Ce que c'est, pour le dire si le serveur la refuse (« le titre de la page »…). */
  label: string
  /** Le corps d'une page : un refus 409 est un conflit à résoudre, pas une erreur. */
  pageId?: string
}

/** Une page modifiée ici et sur le serveur depuis la même version : à résoudre (spec 6.16). */
export interface PageConflict {
  pageId: string
  title: string
  /** Notre document, et la version du serveur d'où il est parti. */
  document: PageContent
  baseVersion: number
  /** La version actuelle du serveur. */
  serverVersion: number
  at: string
}

export interface SendResult {
  status: number
  data: unknown
}

interface OutboxState {
  entries: OutboxEntry[]
  syncing: boolean
  conflicts: Record<string, PageConflict>
}

export const useOutbox = create<OutboxState>(() => ({ entries: [], syncing: false, conflicts: {} }))

/**
 * La dernière version enregistrée du corps de chaque page, quand c'est la file qui l'a envoyé : la
 * page ouverte repart de là pour son envoi suivant (sinon il serait refusé comme un conflit).
 */
export const useSavedVersions = create<Record<string, number>>(() => ({}))

interface Handlers {
  send(entry: OutboxEntry): Promise<SendResult>
  /** Tout est parti : les données du serveur peuvent être relues. */
  onDrained(): void
  /** Le serveur a refusé une modification : elle est retirée, on le dit. */
  onRejected(entry: OutboxEntry, message: string): void
  /** Le corps d'une page est enregistré : sa nouvelle version. */
  onContentSaved(pageId: string, version: number): void
  /** Une modification est arrivée (un fichier ajouté hors ligne : sa vraie adresse). */
  onSent?(entry: OutboxEntry, data: unknown): void
}

let handlers: Handlers | null = null

export function configureOutbox(next: Handlers) {
  handlers = next
}

export const hasQueued = () => useOutbox.getState().entries.length > 0

function persist() {
  const { entries, conflicts } = useOutbox.getState()
  void writeKey('outbox', entries)
  void writeKey('conflicts', conflicts)
}

/** Relit la file et les conflits gardés sur l'appareil (au démarrage). */
export async function loadOutbox(): Promise<void> {
  const [entries, conflicts] = await Promise.all([
    readKey<OutboxEntry[]>('outbox'),
    readKey<Record<string, PageConflict>>('conflicts'),
  ])
  useOutbox.setState({ entries: entries ?? [], conflicts: conflicts ?? {} })
}

function mergeBodies(merge: Merge, before: unknown, after: unknown): unknown {
  const a = (before ?? {}) as Record<string, unknown>
  const b = (after ?? {}) as Record<string, unknown>
  if (merge === 'content') return { ...b, version: a.version }
  if (merge === 'patch') {
    const properties =
      a.properties || b.properties
        ? {
            properties: {
              ...(a.properties as Record<string, unknown>),
              ...(b.properties as Record<string, unknown>),
            },
          }
        : {}
    return { ...a, ...b, ...properties }
  }
  return after
}

/** Un fichier ajouté hors ligne, qui attend son envoi. */
export const isUpload = (entry: Pick<OutboxEntry, 'body'>) =>
  typeof entry.body === 'object' && entry.body !== null && 'upload' in entry.body

/** Ajoute une modification à la file (ou la fond dans celle du même objet), puis tente l'envoi. */
export function enqueue(entry: Omit<OutboxEntry, 'id'>) {
  useOutbox.setState((state) => {
    const same = entry.key
      ? state.entries.findLastIndex(
          (item) => item.key === entry.key && item.method === entry.method,
        )
      : -1
    // Un fichier ajouté après elle : ce qui suit peut citer son adresse, qui n'existe pas encore sur
    // le serveur. La modification prend son tour derrière lui.
    const uploadAfter = state.entries.slice(same + 1).some(isUpload)
    // Pas la première de la file : elle est peut-être en route, on ne la change plus.
    if (!uploadAfter && (same > 0 || (same === 0 && !state.syncing))) {
      const entries = [...state.entries]
      const before = entries[same]!
      entries[same] = {
        ...before,
        ...entry,
        id: before.id,
        body: mergeBodies(entry.merge ?? 'replace', before.body, entry.body),
      }
      return { entries }
    }
    return { entries: [...state.entries, { ...entry, id: newId() }] }
  })
  persist()
  if (isOnline()) void flushOutbox()
}

function remove(id: string) {
  useOutbox.setState((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) }))
  persist()
}

/**
 * Remplace une adresse dans tout ce qui attend encore (l'adresse locale d'un fichier ajouté hors
 * ligne, par sa vraie adresse une fois envoyé ; par '' s'il est refusé).
 */
export function replaceInQueue(from: string, to: string) {
  const needle = JSON.stringify(from).slice(1, -1)
  const target = JSON.stringify(to).slice(1, -1)
  useOutbox.setState((state) => ({
    entries: state.entries.map((entry) => {
      if (entry.body === undefined) return entry
      const json = JSON.stringify(entry.body)
      return json.includes(needle)
        ? { ...entry, body: JSON.parse(json.split(needle).join(target)) as unknown }
        : entry
    }),
  }))
  persist()
}

/** Le corps d'une page enregistré : ses envois suivants partent de cette version. */
function advanceVersion(pageId: string, version: number) {
  useOutbox.setState((state) => ({
    entries: state.entries.map((entry) =>
      entry.pageId === pageId && typeof entry.body === 'object' && entry.body !== null
        ? { ...entry, body: { ...(entry.body as object), version } }
        : entry,
    ),
  }))
}

export function setConflict(conflict: PageConflict) {
  useOutbox.setState((state) => ({
    conflicts: { ...state.conflicts, [conflict.pageId]: conflict },
  }))
  persist()
}

export function resolveConflict(pageId: string) {
  useOutbox.setState((state) => {
    const conflicts = { ...state.conflicts }
    delete conflicts[pageId]
    return { conflicts }
  })
  persist()
}

let retry: ReturnType<typeof setTimeout> | null = null

/** Envoie la file dans l'ordre, tant que le serveur répond. */
export async function flushOutbox(): Promise<void> {
  if (!handlers || useOutbox.getState().syncing || !isOnline()) return
  if (useOutbox.getState().entries.length === 0) return
  const { send, onDrained, onRejected, onContentSaved, onSent } = handlers
  if (retry) clearTimeout(retry)
  retry = null
  useOutbox.setState({ syncing: true })
  let stopped = false
  try {
    while (useOutbox.getState().entries.length > 0) {
      const entry = useOutbox.getState().entries[0]!
      let result: SendResult
      try {
        result = await send(entry)
      } catch (error) {
        if (isNetworkError(error)) markOffline()
        stopped = true
        break
      }
      markOnline()
      const body = (entry.body ?? {}) as { content?: PageContent; version?: number }
      const data = result.data as {
        data?: { version?: number }
        version?: number
        message?: string
      }
      if (result.status >= 200 && result.status < 300) {
        remove(entry.id)
        if (entry.pageId && typeof data?.data?.version === 'number') {
          advanceVersion(entry.pageId, data.data.version)
          onContentSaved(entry.pageId, data.data.version)
        }
        onSent?.(entry, result.data)
      } else if (result.status === 409 && entry.pageId) {
        // Modifiée ailleurs depuis : un conflit à résoudre, avec les deux versions.
        setConflict({
          pageId: entry.pageId,
          title: entry.label,
          document: body.content ?? null,
          baseVersion: body.version ?? 0,
          serverVersion: data?.version ?? body.version ?? 0,
          at: new Date().toISOString(),
        })
        remove(entry.id)
      } else if (result.status === 401) {
        // Session refusée : la file attend qu'on se reconnecte.
        stopped = true
        break
      } else if (result.status >= 500 || result.status === 429) {
        // Serveur occupé ou en panne : on réessaie dans un moment.
        stopped = true
        retry = setTimeout(() => void flushOutbox(), 30_000)
        break
      } else {
        // Refusée (objet supprimé entre-temps, valeur devenue invalide) : retirée, et on le dit.
        remove(entry.id)
        onRejected(entry, data?.message ?? `erreur ${result.status}`)
      }
    }
  } finally {
    useOutbox.setState({ syncing: false })
  }
  if (!stopped && useOutbox.getState().entries.length === 0) onDrained()
}

/** Oublie tout (déconnexion). */
export function resetOutbox() {
  if (retry) clearTimeout(retry)
  useOutbox.setState({ entries: [], syncing: false, conflicts: {} })
}
