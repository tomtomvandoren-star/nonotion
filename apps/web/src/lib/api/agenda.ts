import { agendaSchema, type Agenda, type AgendaSettings } from '@nonotion/shared'
import { z } from 'zod'
import { apiGet, apiRequest, inData, type OfflineWrite } from './client'

const dataOf = <T extends z.ZodType>(schema: T) => z.object({ data: schema })

/** La page « Agenda » de l'espace (spec 6.15) : ses bases, ses agendas et ses réglages. */
export const fetchAgenda = (workspaceId: string) =>
  apiGet(`workspaces/${workspaceId}/agenda`, dataOf(agendaSchema)).then((r) => r.data)

export const updateAgenda = (
  workspaceId: string,
  patch: Partial<AgendaSettings>,
  offline?: OfflineWrite<Agenda>,
) =>
  apiRequest('PATCH', `workspaces/${workspaceId}/agenda`, dataOf(agendaSchema), patch, {
    offline: inData(offline),
  }).then((r) => r.data)
