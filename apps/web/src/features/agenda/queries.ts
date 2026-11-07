import type { Agenda, AgendaSettings } from '@nonotion/shared'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { databaseKey } from '@/features/databases/queries'
import { SAVE_MUTATION_KEY } from '@/features/pages/queries'
import { fetchAgenda, updateAgenda } from '@/lib/api/agenda'
import { fetchDatabase } from '@/lib/api/databases'

export const agendaKey = (workspaceId: string) => ['agenda', workspaceId] as const

/** Même rythme que les bases : rafraîchissement à la place du temps réel (spec 1.3.6). */
const SYNC_INTERVAL_MS = 60_000

export function useAgenda(workspaceId: string) {
  return useQuery({
    queryKey: agendaKey(workspaceId),
    queryFn: () => fetchAgenda(workspaceId),
    enabled: workspaceId !== '',
    refetchInterval: SYNC_INTERVAL_MS,
    staleTime: 30_000,
  })
}

/**
 * Les bases que l'Agenda réunit, chacune par sa propre requête : le même cache que leurs vues, donc
 * les mêmes mises à jour optimistes (glisser une date, cocher une tâche) partout.
 */
export function useAgendaDatabases(databaseIds: readonly string[]) {
  return useQueries({
    queries: databaseIds.map((databaseId) => ({
      queryKey: databaseKey(databaseId),
      queryFn: () => fetchDatabase(databaseId),
      refetchInterval: SYNC_INTERVAL_MS,
      staleTime: 30_000,
    })),
  })
}

/**
 * Un réglage de l'Agenda (base masquée, couleur…) : à l'écran dès le clic. Appliqué avant même que
 * la mutation ne démarre (elle commence un instant plus tard) : une case cochée ne revient pas en
 * arrière entre-temps.
 */
export function useUpdateAgenda(workspaceId: string) {
  const queryClient = useQueryClient()
  const apply = (patch: Partial<AgendaSettings>) =>
    queryClient.setQueryData<Agenda>(agendaKey(workspaceId), (current) =>
      current ? { ...current, settings: { ...current.settings, ...patch } } : current,
    )
  const mutation = useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: (patch: Partial<AgendaSettings>) => updateAgenda(workspaceId, patch),
    onMutate: async (patch) => {
      // Encore après avoir annulé un rafraîchissement en cours, qui remettrait l'état d'avant.
      await queryClient.cancelQueries({ queryKey: agendaKey(workspaceId) }, { revert: false })
      apply(patch)
    },
    onSuccess: (agenda) => queryClient.setQueryData(agendaKey(workspaceId), agenda),
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: agendaKey(workspaceId) })
      toast.error('Le réglage de l’Agenda n’a pas pu être enregistré.')
    },
  })
  return {
    mutate: (patch: Partial<AgendaSettings>) => {
      // Un rafraîchissement en route reviendrait avec l'ancien réglage : il est abandonné, sans
      // remettre les données d'avant lui (ce qui effacerait aussi ce réglage).
      void queryClient.cancelQueries({ queryKey: agendaKey(workspaceId) }, { revert: false })
      apply(patch)
      mutation.mutate(patch)
    },
  }
}
