import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  addShare,
  createLink,
  deleteLink,
  duplicateLink,
  fetchFreebusy,
  fetchLinkBookings,
  fetchLinks,
  fetchShares,
  removeShare,
  type SchedulingLink,
  type SchedulingLinkInput,
  searchPeople,
  updateLink,
} from '@/lib/api/scheduling'

/** Planifier (spec 6.17), côté organisateur : ses liens, ses partages, les personnes visibles. */

export const linksKey = (workspaceId: string) => ['scheduling-links', workspaceId] as const
const sharesKey = ['freebusy-shares'] as const

export function useLinks(workspaceId: string) {
  return useQuery({
    queryKey: linksKey(workspaceId),
    queryFn: () => fetchLinks(workspaceId),
    enabled: workspaceId !== '',
    // Les réservations arrivent d'ailleurs (la page publique) : relues régulièrement.
    refetchInterval: 60_000,
  })
}

export function useLinkBookings(linkId: string | null) {
  return useQuery({
    queryKey: ['scheduling-link-bookings', linkId],
    queryFn: () => fetchLinkBookings(linkId!),
    enabled: linkId !== null,
  })
}

/** Créer, modifier, dupliquer, supprimer : la liste se met à jour avec la réponse du serveur. */
export function useLinkMutations(workspaceId: string) {
  const queryClient = useQueryClient()
  const put = (link: SchedulingLink) =>
    queryClient.setQueryData<SchedulingLink[]>(linksKey(workspaceId), (links = []) =>
      links.some((item) => item.id === link.id)
        ? links.map((item) => (item.id === link.id ? link : item))
        : [...links, link],
    )
  return {
    create: useMutation({
      mutationFn: (input: SchedulingLinkInput) => createLink(workspaceId, input),
      onSuccess: put,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: SchedulingLinkInput }) =>
        updateLink(id, input),
      onSuccess: put,
    }),
    duplicate: useMutation({
      mutationFn: duplicateLink,
      onSuccess: (link) => {
        put(link)
        toast.success('Lien dupliqué.')
      },
      onError: () => toast.error('Le lien n’a pas pu être dupliqué.'),
    }),
    remove: useMutation({
      mutationFn: deleteLink,
      onSuccess: (_, id) => {
        queryClient.setQueryData<SchedulingLink[]>(linksKey(workspaceId), (links = []) =>
          links.filter((item) => item.id !== id),
        )
        toast.success('Lien supprimé. Les rendez-vous déjà pris restent valables.')
      },
      onError: () => toast.error('Le lien n’a pas pu être supprimé.'),
    }),
  }
}

export function useShares(enabled: boolean) {
  return useQuery({ queryKey: sharesKey, queryFn: fetchShares, enabled })
}

export function useShareMutations() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: sharesKey })
  return {
    add: useMutation({ mutationFn: addShare, onSuccess: refresh }),
    remove: useMutation({
      mutationFn: removeShare,
      onSuccess: refresh,
      onError: () => toast.error('L’accès n’a pas pu être retiré.'),
    }),
  }
}

export function usePeopleSearch(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['people', q],
    queryFn: ({ signal }) => searchPeople(q, signal),
    enabled: q.length > 0,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

/** Les blocs « Occupé » d'une personne, sur la période affichée. */
export function useFreebusy(personId: string, from: string, to: string) {
  return useQuery({
    queryKey: ['freebusy', personId, from, to],
    queryFn: () => fetchFreebusy(personId, from, to),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  })
}

/** Copier l'adresse d'un lien, avec un mot pour dire que c'est fait. */
export async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Lien copié.')
  } catch {
    toast.error('Le lien n’a pas pu être copié : ' + url)
  }
}
