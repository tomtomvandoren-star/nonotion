import type { Agenda, CalendarSource, DatabaseDetail } from '@nonotion/shared'
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys, SAVE_MUTATION_KEY, useWorkspaceId } from '@/features/pages/queries'
import { ApiError } from '@/lib/api/client'
import {
  deleteCalendar,
  importCalendar,
  type ImportInput,
  syncCalendar,
  updateCalendar,
} from '@/lib/api/calendars'
import { databaseKey } from '../queries'

/** Le message clair renvoyé par le serveur (« Le lien n'est plus valide… »), ou un message générique. */
export function calendarError(error: unknown): string {
  if (error instanceof ApiError) return error.fieldError('url') ?? error.message
  return 'Le serveur ne répond pas. Réessayez dans un instant.'
}

export const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`

/** L'Agenda de l'espace (spec 6.15) liste aussi les agendas : il se recharge avec eux. */
const AGENDA_PREFIX = ['agenda'] as const
const refreshAgenda = (queryClient: QueryClient) =>
  void queryClient.invalidateQueries({ queryKey: AGENDA_PREFIX })

/** Importe un agenda (spec 6.9) : la base revient à jour, avec ses nouveaux événements. */
export function useImportCalendar() {
  const queryClient = useQueryClient()
  const workspaceId = useWorkspaceId() ?? ''
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: (input: ImportInput) => importCalendar(input),
    onSuccess: ({ database, page }) => {
      queryClient.setQueryData(databaseKey(database.id), database)
      if (page) {
        queryClient.setQueryData(queryKeys.page(page.id), page)
        void queryClient.invalidateQueries({ queryKey: queryKeys.tree(workspaceId) })
      }
      refreshAgenda(queryClient)
    },
  })
}

/**
 * Resynchronise un agenda ; une erreur reste affichée à côté de lui (« Mes agendas »). La base qui
 * revient est celle de l'agenda : pas besoin de la connaître avant.
 */
export function useSyncCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sourceId: string) => syncCalendar(sourceId),
    onSuccess: ({ database }) => {
      queryClient.setQueryData(databaseKey(database.id), database)
      refreshAgenda(queryClient)
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ['database'] })
      refreshAgenda(queryClient)
    },
  })
}

/** Nom, couleur ou mode d'un agenda : à l'écran tout de suite, dans sa base et dans l'Agenda. */
export function useUpdateCalendar() {
  const queryClient = useQueryClient()
  const patchSource = (source: CalendarSource, patch: Partial<CalendarSource>) => {
    const update = (sources: CalendarSource[]) =>
      sources.map((item) => (item.id === source.id ? { ...item, ...patch } : item))
    const database = queryClient.getQueryData<DatabaseDetail>(databaseKey(source.database_id))
    if (database)
      queryClient.setQueryData(databaseKey(source.database_id), {
        ...database,
        sources: update(database.sources),
      })
    const agendas = queryClient.getQueriesData<Agenda>({ queryKey: AGENDA_PREFIX })
    for (const [key, agenda] of agendas)
      if (agenda) queryClient.setQueryData(key, { ...agenda, sources: update(agenda.sources) })
    return () => {
      queryClient.setQueryData(databaseKey(source.database_id), database)
      for (const [key, agenda] of agendas) queryClient.setQueryData(key, agenda)
    }
  }
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: ({
      source,
      patch,
    }: {
      source: CalendarSource
      patch: Parameters<typeof updateCalendar>[1]
    }) => updateCalendar(source.id, patch),
    onMutate: ({ source, patch }) => ({ undo: patchSource(source, patch) }),
    onError: (_error, _input, context) => {
      context?.undo()
      toast.error('L’agenda n’a pas pu être modifié.')
    },
  })
}

/** Supprime un agenda ; ses événements partent à la corbeille. */
export function useDeleteCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: (source: CalendarSource) => deleteCalendar(source.id),
    onSuccess: ({ moved_to_trash }, source) => {
      void queryClient.invalidateQueries({ queryKey: databaseKey(source.database_id) })
      refreshAgenda(queryClient)
      toast.success(
        moved_to_trash > 0
          ? `Agenda supprimé : ${plural(moved_to_trash, 'événement')} à la corbeille.`
          : 'Agenda supprimé.',
      )
    },
    onError: () => toast.error('L’agenda n’a pas pu être supprimé.'),
  })
}
