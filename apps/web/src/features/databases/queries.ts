import type {
  DatabaseDetail,
  DatabaseRowData,
  DatabaseView,
  PageDetail,
  Property,
  ViewConfig,
  ViewType,
} from '@nonotion/shared'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys, SAVE_MUTATION_KEY } from '@/features/pages/queries'
import {
  addProperty,
  createRow,
  createView,
  deleteProperty,
  deleteView,
  duplicateView,
  fetchDatabase,
  renameDatabase,
  type RowPatch,
  updateProperty,
  updateRow,
  updateView,
} from '@/lib/api/databases'

export const databaseKey = (databaseId: string) => ['database', databaseId] as const

/** Configurations de vues modifiées ici et pas encore envoyées (voir useUpdateViewConfig). */
const pendingConfigs = new Map<string, ReturnType<typeof setTimeout>>()

/** Même rythme que l'arbre : rafraîchissement à la place du temps réel (spec 1.3.6). */
const SYNC_INTERVAL_MS = 60_000

export function useDatabase(databaseId: string) {
  return useQuery({
    queryKey: databaseKey(databaseId),
    queryFn: () => fetchDatabase(databaseId),
    enabled: databaseId !== '',
    refetchInterval: SYNC_INTERVAL_MS,
    // Ouvrir une ligne (aperçu) ne recharge pas la base : la réponse écraserait une saisie en cours.
    staleTime: 30_000,
  })
}

/** Modifie la base en cache (mise à jour optimiste) et renvoie de quoi revenir en arrière. */
function patchDatabase(
  queryClient: QueryClient,
  databaseId: string,
  update: (database: DatabaseDetail) => DatabaseDetail,
) {
  const key = databaseKey(databaseId)
  const previous = queryClient.getQueryData<DatabaseDetail>(key)
  if (previous) queryClient.setQueryData(key, update(previous))
  return () => queryClient.setQueryData(key, previous)
}

/** Titre ou valeurs d'une ligne, appliqués au cache (base et page) ; renvoie de quoi annuler. */
export function applyRowPatchLocally(
  queryClient: QueryClient,
  databaseId: string,
  rowId: string,
  patch: RowPatch,
) {
  const apply = <T extends { title: string; properties?: Record<string, unknown> | null }>(
    row: T,
  ): T => ({
    ...row,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.properties ? { properties: { ...row.properties, ...patch.properties } } : {}),
  })
  const undoDatabase = patchDatabase(queryClient, databaseId, (database) => ({
    ...database,
    rows: database.rows.map((row) => (row.id === rowId ? apply(row) : row)),
  }))
  // La même ligne peut être ouverte en page (aperçu) : elle suit sans rechargement (spec 6.4).
  const pageKey = queryKeys.page(rowId)
  const previousPage = queryClient.getQueryData<PageDetail>(pageKey)
  if (previousPage) queryClient.setQueryData(pageKey, apply(previousPage))
  return () => {
    undoDatabase()
    if (previousPage) queryClient.setQueryData(pageKey, previousPage)
  }
}

/** Titre ou valeurs d'une ligne : affichés tout de suite partout (tableau, aperçu, autres vues). */
export function useUpdateRow(databaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: ({ rowId, patch }: { rowId: string; patch: RowPatch }) => updateRow(rowId, patch),
    onMutate: async ({ rowId, patch }) => {
      await queryClient.cancelQueries({ queryKey: databaseKey(databaseId) })
      return { undo: applyRowPatchLocally(queryClient, databaseId, rowId, patch) }
    },
    // Un rafraîchissement a pu ramener l'ancienne valeur entre-temps : on reporte la nôtre.
    onSuccess: (_saved, { rowId, patch }) => {
      applyRowPatchLocally(queryClient, databaseId, rowId, patch)
    },
    onError: (_error, _input, context) => {
      context?.undo()
      toast.error('La modification n’a pas pu être enregistrée.')
    },
  })
}

export function useCreateRow(databaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: (input: {
      title?: string
      properties?: Record<string, unknown>
      position?: string
    }) => createRow(databaseId, input),
    onSuccess: (row: DatabaseRowData) => {
      patchDatabase(queryClient, databaseId, (database) => ({
        ...database,
        rows: [...database.rows.filter((item) => item.id !== row.id), row],
      }))
    },
    onError: () => toast.error('La ligne n’a pas pu être créée.'),
  })
}

/** Ajout, modification ou suppression d'une propriété : le serveur renvoie la base à jour. */
export function usePropertyMutation(databaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: (
      change:
        | { kind: 'add'; property: Property }
        | { kind: 'update'; property: Property }
        | { kind: 'delete'; propertyId: string },
    ) =>
      change.kind === 'add'
        ? addProperty(databaseId, change.property)
        : change.kind === 'update'
          ? updateProperty(databaseId, change.property)
          : deleteProperty(databaseId, change.propertyId),
    onMutate: async (change) => {
      if (change.kind !== 'update') return { undo: () => {}, keepRows: change.kind === 'add' }
      await queryClient.cancelQueries({ queryKey: databaseKey(databaseId) })
      const before = queryClient
        .getQueryData<DatabaseDetail>(databaseKey(databaseId))
        ?.schema.find((p) => p.id === change.property.id)
      const ids = (p: Property | undefined) =>
        p && 'options' in p ? p.options.map((option) => option.id) : []
      // Renommer, ajouter une option : les valeurs des lignes ne changent pas côté serveur.
      const keepRows =
        before?.type === change.property.type &&
        ids(before).every((id) => ids(change.property).includes(id))
      return {
        keepRows,
        undo: patchDatabase(queryClient, databaseId, (database) => ({
          ...database,
          schema: database.schema.map((p) => (p.id === change.property.id ? change.property : p)),
        })),
      }
    },
    // Le serveur renvoie la base entière. Une configuration de vue pas encore envoyée reste la nôtre,
    // et les lignes aussi quand la modification ne les touche pas : une valeur saisie entre-temps
    // (encore en route vers le serveur) ne doit pas disparaître.
    onSuccess: (database, _change, context) =>
      queryClient.setQueryData<DatabaseDetail>(databaseKey(databaseId), (current) => ({
        ...database,
        rows: context?.keepRows && current ? current.rows : database.rows,
        views: database.views.map((view) =>
          pendingConfigs.has(view.id)
            ? (current?.views.find((v) => v.id === view.id) ?? view)
            : view,
        ),
      })),
    onError: (_error, _change, context) => {
      context?.undo()
      toast.error('La propriété n’a pas pu être enregistrée.')
    },
  })
}

export function useRenameDatabase(databaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: (title: string) => renameDatabase(databaseId, title),
    onMutate: (title) => ({
      undo: patchDatabase(queryClient, databaseId, (database) => ({ ...database, title })),
    }),
    onError: (_error, _title, context) => {
      context?.undo()
      toast.error('Le titre n’a pas pu être enregistré.')
    },
  })
}

function replaceView(queryClient: QueryClient, databaseId: string, view: DatabaseView) {
  return patchDatabase(queryClient, databaseId, (database) => ({
    ...database,
    views: database.views.some((item) => item.id === view.id)
      ? database.views.map((item) => (item.id === view.id ? view : item))
      : [...database.views, view],
  }))
}

/**
 * Configuration d'une vue (filtres, tris, colonnes…) : appliquée tout de suite à l'écran, envoyée au
 * serveur 400 ms après le dernier changement (glisser une largeur de colonne envoie une requête,
 * pas une par pixel).
 */
export function useUpdateViewConfig(databaseId: string) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: ({ viewId, config }: { viewId: string; config: ViewConfig }) =>
      updateView(viewId, { config }),
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: databaseKey(databaseId) })
      toast.error('La vue n’a pas pu être enregistrée.')
    },
  })

  return (view: DatabaseView, config: ViewConfig) => {
    replaceView(queryClient, databaseId, { ...view, config })
    clearTimeout(pendingConfigs.get(view.id))
    pendingConfigs.set(
      view.id,
      setTimeout(() => {
        pendingConfigs.delete(view.id)
        save.mutate({ viewId: view.id, config })
      }, 400),
    )
  }
}

export function useViewMutation(databaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    mutationFn: async (
      change:
        | { kind: 'create'; name: string; type: ViewType; config: ViewConfig }
        | { kind: 'rename'; viewId: string; name: string }
        | { kind: 'duplicate'; viewId: string }
        | { kind: 'delete'; viewId: string },
    ): Promise<DatabaseView | null> => {
      if (change.kind === 'create') return createView(databaseId, change)
      if (change.kind === 'rename') return updateView(change.viewId, { name: change.name })
      if (change.kind === 'duplicate') return duplicateView(change.viewId)
      await deleteView(change.viewId)
      return null
    },
    onSuccess: (view, change) => {
      if (view) replaceView(queryClient, databaseId, view)
      else if (change.kind === 'delete')
        patchDatabase(queryClient, databaseId, (database) => ({
          ...database,
          views: database.views.filter((item) => item.id !== change.viewId),
        }))
    },
    onError: () => toast.error('La vue n’a pas pu être enregistrée.'),
  })
}
