import { z } from 'zod'

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
})

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
})

/** Réponse de GET /api/auth/me. */
export const profileSchema = z.object({
  user: userSchema,
  workspaces: z.array(workspaceSchema),
})

/** Réponse de POST /api/auth/login et /api/auth/register. */
export const sessionSchema = profileSchema.extend({
  token: z.string().min(1),
})

export type User = z.infer<typeof userSchema>
export type Workspace = z.infer<typeof workspaceSchema>
export type Profile = z.infer<typeof profileSchema>
export type Session = z.infer<typeof sessionSchema>
