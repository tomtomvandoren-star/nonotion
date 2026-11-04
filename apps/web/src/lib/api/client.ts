import type { z } from 'zod'

/**
 * Point d'entrée unique vers l'API (spec 1.6.1) : le web, Tauri et Capacitor passent tous par ici.
 * Par défaut « /api », c'est-à-dire la même origine que le front.
 */
const API_URL = import.meta.env.VITE_API_URL ?? '/api'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function apiUrl(path: string, base: string = API_URL): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/** GET JSON, validé par un schéma Zod : une réponse inattendue lève une erreur au lieu de passer en silence. */
export async function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(apiUrl(path), { headers: { Accept: 'application/json' } })

  if (!response.ok) {
    throw new ApiError(response.status, `GET ${path} : HTTP ${response.status}`)
  }

  return schema.parse(await response.json())
}
