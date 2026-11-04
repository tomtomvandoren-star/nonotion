import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError, apiGet, apiUrl } from './client'

describe('apiUrl', () => {
  it('joint l’adresse de base et le chemin sans doubler les barres', () => {
    expect(apiUrl('/health', '/api/')).toBe('/api/health')
    expect(apiUrl('health', 'https://nonotion.example.com/api')).toBe(
      'https://nonotion.example.com/api/health',
    )
  })
})

describe('apiGet', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renvoie la réponse validée par le schéma', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ value: 42 })),
    )

    await expect(apiGet('thing', z.object({ value: z.number() }))).resolves.toEqual({ value: 42 })
  })

  it('lève une ApiError avec le statut HTTP quand le serveur refuse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    )

    await expect(apiGet('health', z.unknown())).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
    } satisfies Partial<ApiError>)
  })
})
