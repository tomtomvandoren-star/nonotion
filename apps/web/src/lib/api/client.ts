import type { z } from 'zod'
import { getToken } from '@/lib/session'

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

/**
 * Requête JSON ; la réponse est validée par un schéma Zod, pour ne jamais accepter de données inattendues.
 * `keepalive` : la requête part même si la page se ferme ou se recharge entre-temps.
 */
export async function apiRequest<T>(
  method: Method,
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  { keepalive = false, signal }: { keepalive?: boolean; signal?: AbortSignal } = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(apiUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive,
    signal,
  })

  const data: unknown = response.status === 204 ? null : await response.json().catch(() => null)

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
