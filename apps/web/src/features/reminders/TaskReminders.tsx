import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAgenda, useAgendaDatabases } from '@/features/agenda/queries'
import { useWorkspaceId } from '@/features/pages/queries'
import { platform } from '@/platform'
import { taskReminders } from './reminders'

/**
 * Les rappels des tâches sur le téléphone (spec 9, phase 10) : programmés à chaque changement des
 * tâches (leurs bases affichées dans l'Agenda), et rien ailleurs que dans l'application mobile.
 */
export function TaskReminders() {
  return platform.reminders ? <RemindersSync reminders={platform.reminders} /> : null
}

function RemindersSync({ reminders }: { reminders: NonNullable<typeof platform.reminders> }) {
  const navigate = useNavigate()
  const workspaceId = useWorkspaceId() ?? ''
  const agenda = useAgenda(workspaceId)
  const hidden = new Set(agenda.data?.settings.hidden_databases ?? [])
  const bases = (agenda.data?.databases ?? []).filter(
    (base) => !base.imported_only && !hidden.has(base.id),
  )
  const queries = useAgendaDatabases(bases.map((base) => base.id))
  // Recalculé à chaque rendu (peu de lignes) : seule la signature décide de reprogrammer.
  const list = queries.every((query) => query.data)
    ? taskReminders(
        queries.map((query, i) => ({
          database: query.data!,
          dateProperty: bases[i]!.date_property,
        })),
        new Date(),
      )
    : null
  // Reprogrammés seulement quand la liste change vraiment (pas à chaque rafraîchissement).
  const signature = list?.map((item) => `${item.id}:${item.at.getTime()}:${item.title}`).join('|')

  useEffect(() => {
    if (list) void reminders.sync(list).catch(() => undefined)
    // La signature résume la liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  useEffect(
    () => reminders.onOpen((pageId) => void navigate({ to: '/p/$pageId', params: { pageId } })),
    [reminders, navigate],
  )
  return null
}
