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

/** Un réglage de l'Agenda (base masquée, couleur…) : à l'écran tout de suite. */
export function useUpdateAgenda(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: (patch: Partial<AgendaSettings>) => updateAgenda(workspaceId, patch),
    onMutate: async (patch) => {
      const previous = queryClient.getQueryData<Agenda>(agendaKey(workspaceId))
      const apply = () =>
        queryClient.setQueryData<Agenda>(agendaKey(workspaceId), (current) =>
          current ? { ...current, settings: { ...current.settings, ...patch } } : current,
        )
      // Tout de suite (une case ne revient pas en arrière le temps d'un aller-retour), et encore
      // après avoir annulé un rafraîchissement en cours, qui remettrait l'état d'avant.
      apply()
      await queryClient.cancelQueries({ queryKey: agendaKey(workspaceId) })
      apply()
      return { previous }
    },
    onSuccess: (agenda) => queryClient.setQueryData(agendaKey(workspaceId), agenda),
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(agendaKey(workspaceId), context.previous)
      toast.error('Le réglage de l’Agenda n’a pas pu être enregistré.')
    },
  })
}
