import { describe, expect, it } from 'vitest'
import { healthResponseSchema } from './health'

describe('healthResponseSchema', () => {
  it('accepte la réponse de l’API quand tout va bien', () => {
    const parsed = healthResponseSchema.parse({
      status: 'ok',
      database: 'ok',
      checked_at: '2026-11-04T12:00:00+00:00',
      cron_last_run_at: null,
    })
    expect(parsed.status).toBe('ok')
  })

  it('refuse une réponse dont la base n’est pas joignable', () => {
    const result = healthResponseSchema.safeParse({
      status: 'error',
      database: 'unreachable',
      checked_at: '2026-11-04T12:00:00+00:00',
      cron_last_run_at: null,
    })
    expect(result.success).toBe(false)
  })
})
