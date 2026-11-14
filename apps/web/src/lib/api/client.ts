import type { z } from 'zod'
import { isNetworkError, isOnline, markOffline, markOnline } from '@/lib/offline/network'
import { enqueue, hasQueued, type Merge, type OutboxEntry } from '@/lib/offline/outbox'
import { getToken } from '@/lib/session'
import { platform } from '@/platform'

/**
 * Point d'entrée unique vers l'API (spec 1.6.1) : le web, Tauri et Capacitor passent tous par ici.
 * Par défaut « /api », c'est-à-dire la même origine que le front.
 */
const API_URL = import.meta.env.VITE_API_URL ?? '/api'

/** Erreurs de validation renvoyées par Laravel (422) : champ → messages. */
export type FieldErrors = Record<string, string[]>

export class ApiError extends Error {
  readonly status: number
  readonly errors: FieldErrors
  readonly body: unknown

  constructor(status: number, message: string, errors: FieldErrors = {}, body: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
    this.body = body
  }

  /** Premier message d'erreur du champ, pour l'afficher sous le champ du formulaire. */
  fieldError(field: string): string | undefined {
    return this.errors[field]?.[0]
  }
}

let onUnauthorized: () => void = () => {}

/** Que faire quand le jeton n'est plus valide (révoqué, expiré) : en général, revenir à la connexion. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

export function apiUrl(path: string, base: string = API_URL): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Écritures parties et pas encore revenues du serveur. */
let writesInFlight = 0
const writesIdle: Array<() => void> = []

/**
 * Attend que les écritures en cours aient atteint le serveur (au plus `timeoutMs`) : avant que
 * l'application ne redémarre pour une mise à jour, par exemple.
 */
export function writesSettled(timeoutMs = 10_000): Promise<void> {
  if (writesInFlight === 0) return Promise.resolve()
  return new Promise((resolve) => {
    writesIdle.push(resolve)
    setTimeout(resolve, timeoutMs)
  })
}

/**
 * Une écriture qui peut attendre le retour de la connexion (applications natives, spec 6.16) : hors
 * ligne, elle entre dans la file d'attente et `result` donne ce que l'écran affiche entre-temps.
 */
export interface OfflineWrite<T> {
  /** Ce que c'est, pour le dire si le serveur la refuse plus tard. */
  label: string
  /** Le même objet : deux modifications de même clé n'en font qu'une dans la file. */
  key?: string
  merge?: Merge
  /** Le corps d'une page : un refus 409 au retour de la connexion devient un conflit à résoudre. */
  pageId?: string
  result: () => T
}

/** Le résultat local d'une écriture dont la réponse est enveloppée dans « data ». */
export const inData = <T>(offline?: OfflineWrite<T>): OfflineWrite<{ data: T }> | undefined =>
  offline && { ...offline, result: () => ({ data: offline.result() }) }

/** Les applications natives gardent une copie locale et une file d'attente ; le site, non. */
const offlineMode = () => platform.offline === true

async function send(
  method: Method,
  path: string,
  body: unknown,
  { keepalive = false, signal }: { keepalive?: boolean; signal?: AbortSignal },
): Promise<{ response: Response; data: unknown }> {
  const token = getToken()
  const headers: Record<string, string> = { Accept: 'application/json' }
  // Un fichier part tel quel (multipart) : le navigateur écrit lui-même l'en-tête Content-Type.
  const form = body instanceof FormData
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const write = method !== 'GET'
  if (write) writesInFlight++
  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      keepalive,
      signal,
    })
  } catch (error) {
    // Pas de réponse du tout : hors ligne (applications natives).
    if (offlineMode() && isNetworkError(error)) markOffline()
    throw error
  } finally {
    if (write && --writesInFlight === 0) for (const resolve of writesIdle.splice(0)) resolve()
  }
  if (offlineMode()) markOnline()
  const data: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  return { response, data }
}

/** Un envoi de la file d'attente (spec 6.16) : la réponse brute, refus compris. */
export async function sendQueued(entry: OutboxEntry): Promise<{ status: number; data: unknown }> {
  const { response, data } = await send(entry.method, entry.path, entry.body, {})
  if (response.status === 401 && getToken()) onUnauthorized()
  return { status: response.status, data }
}

/**
 * Requête JSON ; la réponse est validée par un schéma Zod, pour ne jamais accepter de données inattendues.
 * `keepalive` : la requête part même si la page se ferme ou se recharge entre-temps.
 * `offline` : dans les applications natives, l'écriture attend le retour de la connexion (spec 6.16).
 */
export async function apiRequest<T>(
  method: Method,
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  {
    keepalive = false,
    signal,
    offline,
  }: { keepalive?: boolean; signal?: AbortSignal; offline?: OfflineWrite<T> } = {},
): Promise<T> {
  if (offline && method !== 'GET' && offlineMode()) {
    const queue = () => {
      enqueue({
        method,
        path,
        body,
        key: offline.key,
        merge: offline.merge,
        label: offline.label,
        pageId: offline.pageId,
      })
      return offline.result()
    }
    // Hors ligne, ou d'autres modifications attendent encore : elle prend son tour dans la file.
    if (!isOnline() || hasQueued()) return queue()
    try {
      return await request(method, path, schema, body, { keepalive, signal })
    } catch (error) {
      if (isNetworkError(error)) return queue()
      throw error
    }
  }
  return request(method, path, schema, body, { keepalive, signal })
}

async function request<T>(
  method: Method,
  path: string,
  schema: z.ZodType<T>,
  body: unknown,
  options: { keepalive?: boolean; signal?: AbortSignal },
): Promise<T> {
  const token = getToken()
  const { response, data } = await send(method, path, body, options)

  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized()
    const payload = (data ?? {}) as { message?: string; errors?: FieldErrors }
    throw new ApiError(
      response.status,
      payload.message ?? `${method} ${path} : HTTP ${response.status}`,
      payload.errors ?? {},
      data,
    )
  }

  return schema.parse(data)
}

export const apiGet = <T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) =>
  apiRequest('GET', path, schema, undefined, { signal })
