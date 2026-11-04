import { z } from 'zod'

/** Réponse de `GET /api/health` : preuve que PHP, la base et le cron tournent. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('ok'),
  checked_at: z.iso.datetime({ offset: true }),
  /** Dernier passage du planificateur Laravel (null tant que le cron n'a jamais tourné). */
  cron_last_run_at: z.iso.datetime({ offset: true }).nullable(),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
