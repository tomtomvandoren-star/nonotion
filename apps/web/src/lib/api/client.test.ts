import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { useSession } from '@/lib/session'
import { ApiError, apiGet, apiRequest, apiUrl, setUnauthorizedHandler } from './client'

vi.mock('@/platform', () => ({
  platform: {
    secureStorage: { get: async () => null, set: async () => {}, remove: async () => {} },
  },
}))

describe('apiUrl', () => {
  it('joint l’adresse de base et le chemin sans doubler les barres', () => {
    expect(apiUrl('/health', '/api/')).toBe('/api/health')
    expect(apiUrl('health', 'https://nonotion.example.com/api')).toBe(
      'https://nonotion.example.com/api/health',
    )
  })
})

describe('apiRequest', () => {
  beforeEach(() => {
    useSession.setState({ token: null })
  })

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

  it('envoie le jeton de la session en Bearer et le corps en JSON', async () => {
    useSession.setState({ token: 'abc' })
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({}))
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest('POST', 'pages', z.object({}), { title: 'Notes' })

    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer abc',
      'Content-Type': 'application/json',
    })
    expect(init?.body).toBe('{"title":"Notes"}')
  })

  it('lève une ApiError avec le statut et les erreurs de champ', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { message: 'Invalide', errors: { email: ['Adresse invalide'] } },
          { status: 422 },
        ),
      ),
    )

    const error = await apiGet('auth/login', z.unknown()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).fieldError('email')).toBe('Adresse invalide')
  })

  it('prévient quand un jeton est refusé (session expirée ou révoquée)', async () => {
    useSession.setState({ token: 'révoqué' })
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: 'Unauthenticated.' }, { status: 401 })),
    )

    await expect(apiGet('auth/me', z.unknown())).rejects.toMatchObject({ status: 401 })
    expect(handler).toHaveBeenCalledOnce()
  })
})
