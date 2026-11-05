import type { CalendarSource, DatabaseDetail } from '@nonotion/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
    },
  })
}

/** Resynchronise un agenda ; une erreur reste affichée à côté de lui (« Mes agendas »). */
export function useSyncCalendar(databaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sourceId: string) => syncCalendar(sourceId),
    onSuccess: ({ database }) => queryClient.setQueryData(databaseKey(databaseId), database),
    onError: () => void queryClient.invalidateQueries({ queryKey: databaseKey(databaseId) }),
  })
}

/** Nom, couleur ou mode d'un agenda : à l'écran tout de suite. */
export function useUpdateCalendar(databaseId: string) {
  const queryClient = useQueryClient()
  const patchSource = (sourceId: string, update: (source: CalendarSource) => CalendarSource) => {
    const previous = queryClient.getQueryData<DatabaseDetail>(databaseKey(databaseId))
    if (previous)
      queryClient.setQueryData(databaseKey(databaseId), {
        ...previous,
        sources: previous.sources.map((source) =>
          source.id === sourceId ? update(source) : source,
        ),
      })
    return () => queryClient.setQueryData(databaseKey(databaseId), previous)
  }
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: ({
      sourceId,
      patch,
    }: {
      sourceId: string
      patch: Parameters<typeof updateCalendar>[1]
    }) => updateCalendar(sourceId, patch),
    onMutate: ({ sourceId, patch }) => ({
      undo: patchSource(sourceId, (source) => ({ ...source, ...patch })),
    }),
    onError: (_error, _input, context) => {
      context?.undo()
      toast.error('L’agenda n’a pas pu être modifié.')
    },
  })
}

/** Supprime un agenda ; ses événements partent à la corbeille. */
export function useDeleteCalendar(databaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: (sourceId: string) => deleteCalendar(sourceId),
    onSuccess: ({ moved_to_trash }) => {
      void queryClient.invalidateQueries({ queryKey: databaseKey(databaseId) })
      toast.success(
        moved_to_trash > 0
          ? `Agenda supprimé : ${plural(moved_to_trash, 'événement')} à la corbeille.`
          : 'Agenda supprimé.',
      )
    },
    onError: () => toast.error('L’agenda n’a pas pu être supprimé.'),
  })
}
