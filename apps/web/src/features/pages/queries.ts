import type { PageDetail, PageTreeItem } from '@nonotion/shared'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchProfile } from '@/lib/api/auth'
import {
  createPage,
  deletePagePermanently,
  duplicatePage,
  fetchPage,
  fetchTrash,
  fetchTree,
  movePage,
  restorePage,
  trashPage,
  updatePage,
  type PagePatch,
} from '@/lib/api/pages'

export const queryKeys = {
  profile: ['profile'] as const,
  tree: (workspaceId: string) => ['tree', workspaceId] as const,
  page: (pageId: string) => ['page', pageId] as const,
  trash: (workspaceId: string) => ['trash', workspaceId] as const,
}

/** Clé commune des écritures, pour l'indicateur « Enregistrement… » (P5). */
export const SAVE_MUTATION_KEY = ['save'] as const

/** Rafraîchissement périodique à la place du temps réel (spec 1.3.6), suspendu quand l'onglet est caché. */
const SYNC_INTERVAL_MS = 60_000

export function useProfile() {
  return useQuery({ queryKey: queryKeys.profile, queryFn: fetchProfile, staleTime: 5 * 60_000 })
}

/** Le workspace courant : le premier de l'utilisateur (un seul tant que le partage n'existe pas). */
export function useWorkspaceId(): string | undefined {
  return useProfile().data?.workspaces[0]?.id
}

export function useTree() {
  const workspaceId = useWorkspaceId()
  return useQuery({
    queryKey: queryKeys.tree(workspaceId ?? ''),
    queryFn: () => fetchTree(workspaceId!),
    enabled: workspaceId !== undefined,
    refetchInterval: SYNC_INTERVAL_MS,
  })
}

export function usePage(pageId: string) {
  return useQuery({ queryKey: queryKeys.page(pageId), queryFn: () => fetchPage(pageId) })
}

export function useTrash(enabled: boolean) {
  const workspaceId = useWorkspaceId()
  return useQuery({
    queryKey: queryKeys.trash(workspaceId ?? ''),
    queryFn: () => fetchTrash(workspaceId!),
    enabled: enabled && workspaceId !== undefined,
  })
}

type TreeUpdater = (pages: PageTreeItem[]) => PageTreeItem[]

/** Modifie l'arbre en cache (mise à jour optimiste) et renvoie l'état précédent pour l'annuler. */
function patchTreeCache(queryClient: QueryClient, workspaceId: string, update: TreeUpdater) {
  const key = queryKeys.tree(workspaceId)
  const previous = queryClient.getQueryData<PageTreeItem[]>(key)
  if (previous) queryClient.setQueryData(key, update(previous))
  return () => queryClient.setQueryData(key, previous)
}

/**
 * Change titre, icône, couverture ou favori. L'interface est mise à jour tout de suite
 * (barre latérale, fil d'Ariane, page) ; en cas d'échec, elle revient en arrière.
 */
export function applyPagePatchLocally(
  queryClient: QueryClient,
  workspaceId: string,
  pageId: string,
  patch: PagePatch,
) {
  const undoTree = patchTreeCache(queryClient, workspaceId, (pages) =>
    pages.map((page) => (page.id === pageId ? { ...page, ...patch } : page)),
  )
  const pageKey = queryKeys.page(pageId)
  const previousPage = queryClient.getQueryData<PageDetail>(pageKey)
  if (previousPage) queryClient.setQueryData(pageKey, { ...previousPage, ...patch })

  return () => {
    undoTree()
    if (previousPage) queryClient.setQueryData(pageKey, previousPage)
  }
}

export function useUpdatePage() {
  const queryClient = useQueryClient()
  const workspaceId = useWorkspaceId() ?? ''
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: ({ pageId, patch }: { pageId: string; patch: PagePatch }) =>
      updatePage(pageId, patch),
    onMutate: ({ pageId, patch }) => ({
      undo: applyPagePatchLocally(queryClient, workspaceId, pageId, patch),
    }),
    // L'arbre a pu être rechargé entre-temps avec l'ancienne valeur : on y reporte celle du serveur.
    onSuccess: (saved, { patch }) => {
      applyPagePatchLocally(queryClient, workspaceId, saved.id, patch)
    },
    onError: (_error, _input, context) => {
      context?.undo()
      toast.error('La modification n’a pas pu être enregistrée.')
    },
  })
}

export function useCreatePage() {
  const queryClient = useQueryClient()
  const workspaceId = useWorkspaceId() ?? ''
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: (input: { parent_page_id?: string | null; position?: string; title?: string }) =>
      createPage(workspaceId, input),
    onSuccess: (page) => {
      patchTreeCache(queryClient, workspaceId, (pages) => [...pages, page])
      queryClient.setQueryData(queryKeys.page(page.id), page)
    },
    onError: () => toast.error('La page n’a pas pu être créée.'),
  })
}

export function useMovePage() {
  const queryClient = useQueryClient()
  const workspaceId = useWorkspaceId() ?? ''
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: ({ pageId, parentId, position }: MoveInput) => movePage(pageId, parentId, position),
    onMutate: ({ pageId, parentId, position }) => ({
      undo: patchTreeCache(queryClient, workspaceId, (pages) =>
        pages.map((page) =>
          page.id === pageId ? { ...page, parent_page_id: parentId, position } : page,
        ),
      ),
    }),
    onError: (_error, _input, context) => {
      context?.undo()
      toast.error('La page n’a pas pu être déplacée.')
    },
  })
}

export interface MoveInput {
  pageId: string
  parentId: string | null
  position: string
}

export function useDuplicatePage() {
  const queryClient = useQueryClient()
  const workspaceId = useWorkspaceId() ?? ''
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: duplicatePage,
    // La copie embarque des sous-pages : on recharge l'arbre plutôt que de le reconstruire.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.tree(workspaceId) }),
    onError: () => toast.error('La page n’a pas pu être dupliquée.'),
  })
}

export function useRestorePage() {
  const queryClient = useQueryClient()
  const workspaceId = useWorkspaceId() ?? ''
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: restorePage,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tree(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.trash(workspaceId) })
    },
    onError: () => toast.error('La page n’a pas pu être restaurée.'),
  })
}

/** Met une page (et ses sous-pages) à la corbeille, avec « Annuler » dans la notification. */
export function useTrashPage() {
  const queryClient = useQueryClient()
  const workspaceId = useWorkspaceId() ?? ''
  const restore = useRestorePage()
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: trashPage,
    onMutate: (pageId) => ({
      undo: patchTreeCache(queryClient, workspaceId, (pages) => {
        const removed = new Set([pageId])
        // Les sous-pages partent avec leur parente : on les retire aussi de l'arbre affiché.
        let grew = true
        while (grew) {
          grew = false
          for (const page of pages) {
            if (page.parent_page_id && removed.has(page.parent_page_id) && !removed.has(page.id)) {
              removed.add(page.id)
              grew = true
            }
          }
        }
        return pages.filter((page) => !removed.has(page.id))
      }),
    }),
    onSuccess: (_result, pageId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trash(workspaceId) })
      toast('Page déplacée dans la corbeille', {
        action: { label: 'Annuler', onClick: () => restore.mutate(pageId) },
      })
    },
    onError: (_error, _pageId, context) => {
      context?.undo()
      toast.error('La page n’a pas pu être supprimée.')
    },
  })
}

export function useDeletePermanently() {
  const queryClient = useQueryClient()
  const workspaceId = useWorkspaceId() ?? ''
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: deletePagePermanently,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trash(workspaceId) }),
    onError: () => toast.error('La page n’a pas pu être supprimée définitivement.'),
  })
}
