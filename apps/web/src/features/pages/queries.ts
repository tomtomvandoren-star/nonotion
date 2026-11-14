import {
  comparePositions,
  positionBetween,
  type PageDetail,
  type PageTreeItem,
} from '@nonotion/shared'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { newId } from '@/lib/offline/ulid'
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
  return useQuery({
    queryKey: queryKeys.page(pageId),
    queryFn: () => fetchPage(pageId),
    enabled: pageId !== '',
  })
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

/** La page telle que l'arbre la connaît (ou, à défaut, l'aperçu ouvert) : pour un résultat hors ligne. */
function knownTreeItem(
  queryClient: QueryClient,
  workspaceId: string,
  pageId: string,
): PageTreeItem {
  const fromTree = queryClient
    .getQueryData<PageTreeItem[]>(queryKeys.tree(workspaceId))
    ?.find((page) => page.id === pageId)
  const page = fromTree ?? queryClient.getQueryData<PageDetail>(queryKeys.page(pageId))
  return {
    id: pageId,
    parent_page_id: page?.parent_page_id ?? null,
    title: page?.title ?? '',
    icon: page?.icon ?? null,
    is_favorite: page?.is_favorite ?? false,
    position: page?.position ?? 'a0',
    updated_at: new Date().toISOString(),
  }
}

/** La place après la dernière sœur : une page créée va en fin de liste (comme sur le serveur). */
function endPosition(queryClient: QueryClient, workspaceId: string, parentId: string | null) {
  const siblings = (queryClient.getQueryData<PageTreeItem[]>(queryKeys.tree(workspaceId)) ?? [])
    .filter((page) => page.parent_page_id === parentId)
    .map((page) => page.position)
    .sort(comparePositions)
  return positionBetween(siblings.at(-1) ?? null, null)
}

/** Une page neuve, telle que le serveur la renverrait : l'écran l'affiche avant même sa réponse. */
function localPage(
  workspaceId: string,
  input: { id: string; title?: string; parent_page_id?: string | null; position: string },
): PageDetail {
  const now = new Date().toISOString()
  return {
    id: input.id,
    workspace_id: workspaceId,
    parent_page_id: input.parent_page_id ?? null,
    database_id: null,
    properties: null,
    calendar_source_id: null,
    sync_conflict: null,
    title: input.title ?? '',
    icon: null,
    cover_url: null,
    is_favorite: false,
    position: input.position,
    content: null,
    version: 1,
    created_at: now,
    updated_at: now,
  }
}

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
      updatePage(pageId, patch, {
        label: 'le titre, l’icône ou la couverture d’une page',
        key: `page:${pageId}`,
        merge: 'patch',
        result: () => ({ ...knownTreeItem(queryClient, workspaceId, pageId), ...patch }),
      }),
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
    // L'identifiant est choisi ici : hors ligne, la page existe déjà à l'écran (spec 6.16).
    mutationFn: (input: { parent_page_id?: string | null; position?: string; title?: string }) => {
      const full = {
        ...input,
        id: newId(),
        position:
          input.position ?? endPosition(queryClient, workspaceId, input.parent_page_id ?? null),
      }
      return createPage(workspaceId, full, {
        label: 'une page créée',
        result: () => localPage(workspaceId, full),
      })
    },
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
    mutationFn: ({ pageId, parentId, position }: MoveInput) =>
      movePage(pageId, parentId, position, {
        label: 'une page déplacée',
        key: `move:${pageId}`,
        result: () => ({
          ...knownTreeItem(queryClient, workspaceId, pageId),
          parent_page_id: parentId,
          position,
        }),
      }),
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
    mutationFn: (pageId: string) =>
      restorePage(pageId, {
        label: 'une page restaurée',
        result: () => {
          const trashed = queryClient
            .getQueryData<{ id: string; title: string; icon: string | null }[]>(
              queryKeys.trash(workspaceId),
            )
            ?.find((page) => page.id === pageId)
          return {
            ...knownTreeItem(queryClient, workspaceId, pageId),
            ...(trashed ? { title: trashed.title, icon: trashed.icon } : {}),
          }
        },
      }),
    onSuccess: (page) => {
      // Hors ligne, l'arbre ne se recharge pas : la page y revient tout de suite.
      patchTreeCache(queryClient, workspaceId, (pages) =>
        pages.some((item) => item.id === page.id) ? pages : [...pages, page],
      )
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
    mutationFn: (pageId: string) =>
      trashPage(pageId, {
        label: 'une page mise à la corbeille',
        result: () => ({ status: 'ok' as const }),
      }),
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
