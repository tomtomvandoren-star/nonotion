import { agendaSchema, type AgendaSettings } from '@nonotion/shared'
import { z } from 'zod'
import { apiGet, apiRequest } from './client'

const dataOf = <T extends z.ZodType>(schema: T) => z.object({ data: schema })

/** La page « Agenda » de l'espace (spec 6.15) : ses bases, ses agendas et ses réglages. */
export const fetchAgenda = (workspaceId: string) =>
  apiGet(`workspaces/${workspaceId}/agenda`, dataOf(agendaSchema)).then((r) => r.data)

export const updateAgenda = (workspaceId: string, patch: Partial<AgendaSettings>) =>
  apiRequest('PATCH', `workspaces/${workspaceId}/agenda`, dataOf(agendaSchema), patch).then(
    (r) => r.data,
  )
