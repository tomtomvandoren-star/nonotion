import {
  applyView,
  type DatabaseDetail,
  type EngineContext,
  groupRows,
  positionBetween,
  prefillFromFilters,
  prefillFromGroup,
  type Property,
  todayIn,
  type ViewConfig,
} from '@nonotion/shared'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { requestTitleFocus } from '@/features/pages/useNewPage'
import { ApiError } from '@/lib/api/client'
import { useUi } from '@/stores/ui'
import { BoardView } from './BoardView'
import type { ColumnAction } from './ColumnHeader'
import { visibleColumns } from './columns'
import { newRule } from './filterLabels'
import { GalleryView, ListView } from './ListView'
import { useCreateRow, useDatabase, useRenameDatabase, useUpdateViewConfig } from './queries'
import { RowPeek } from './RowPeek'
import { TableView } from './TableView'
import { ViewTabs } from './ViewTabs'
import { ViewToolbar } from './ViewToolbar'

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

/** Une base de données affichée dans une page (spec 6.4 à 6.6) : titre, onglets, barre d'outils, vue. */
export function DatabaseView({
  databaseId,
  showTitle = true,
}: {
  databaseId: string
  /** Faux en pleine page : le titre de la page est celui de la base. */
  showTitle?: boolean
}) {
  const database = useDatabase(databaseId)

  if (database.isPending)
    return <div aria-hidden className="my-2 h-32 animate-pulse rounded bg-muted" />
  if (database.isError) {
    const gone = database.error instanceof ApiError && database.error.status === 404
    return (
      <p className="my-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
        {gone
          ? 'Cette base de données n’existe plus.'
          : 'Impossible d’ouvrir cette base de données.'}
      </p>
    )
  }
  return <LoadedDatabase database={database.data} showTitle={showTitle} />
}

function LoadedDatabase({ database, showTitle }: { database: DatabaseDetail; showTitle: boolean }) {
  const navigate = useNavigate()
  const activeViews = useUi((s) => s.activeViews)
  const setActiveView = useUi((s) => s.setActiveView)
  const updateConfig = useUpdateViewConfig(database.id)
  const createRow = useCreateRow(database.id)
  const rename = useRenameDatabase(database.id)
  const [search, setSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [peek, setPeek] = useState<string | null>(null)
  const [title, setTitle] = useState(database.title)

  const view =
    database.views.find((item) => item.id === activeViews[database.id]) ?? database.views[0]!
  const config = view.config
  const ctx: EngineContext = { today: todayIn(timeZone), timeZone }

  const rows = useMemo(
    () => applyView(database.rows, database.schema, config, ctx, search),
    // ctx change de valeur à minuit seulement ; ses champs suffisent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [database.rows, database.schema, config, ctx.today, search],
  )
  const groups = useMemo(
    () => groupRows(rows, database.schema, config.group_by),
    [rows, database.schema, config.group_by],
  )

  const setConfig = (next: ViewConfig) => updateConfig(view, next)

  /** Ce qu'hérite un élément créé dans cette vue (spec 6.6) : le filtre actif, et sa section. */
  const inherited = (groupKey?: string | null) => ({
    ...prefillFromFilters(database.schema, config.filters, ctx),
    ...(groupKey !== undefined ? prefillFromGroup(database.schema, config.group_by, groupKey) : {}),
  })

  const openRow = (rowId: string) => {
    if (config.open_pages_in === 'full_page')
      void navigate({ to: '/p/$pageId', params: { pageId: rowId } })
    else setPeek(rowId)
  }

  /** « Nouveau » : un élément vide en tête, ouvert tout de suite, le curseur dans son titre. */
  const createAtTop = async () => {
    const first = database.rows.reduce<string | null>(
      (min, row) => (min === null || row.position < min ? row.position : min),
      null,
    )
    const row = await createRow.mutateAsync({
      properties: inherited(),
      position: positionBetween(null, first),
    })
    requestTitleFocus(row.id)
    openRow(row.id)
  }

  const onColumnAction = (property: Property, action: ColumnAction) => {
    if (action.kind === 'sort')
      setConfig({ ...config, sorts: [{ property: property.id, direction: action.direction }] })
    else if (action.kind === 'filter') {
      setConfig({
        ...config,
        filters: {
          operator: config.filters?.operator ?? 'and',
          rules: [...(config.filters?.rules ?? []), newRule(property)],
        },
      })
      setFilterOpen(true)
    } else {
      const ids = visibleColumns(database.schema, config).map((item) => item.id)
      setConfig({ ...config, visible_properties: ids.filter((id) => id !== property.id) })
    }
  }

  const body = { database, view, rows, groups, onOpenRow: openRow, inherited, onColumnAction }

  return (
    <section aria-label={database.title || 'Base sans titre'} className="nn-database my-1">
      {showTitle && (
        <input
          aria-label="Titre de la base"
          value={title}
          placeholder="Sans titre"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => title !== database.title && rename.mutate(title)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          className="mb-1 w-full bg-transparent text-xl font-bold outline-none placeholder:text-muted-foreground/50 focus-visible:outline-none"
        />
      )}
      <ViewTabs
        database={database}
        activeId={view.id}
        onSelect={(id) => setActiveView(database.id, id)}
      />
      <ViewToolbar
        database={database}
        view={view}
        onConfig={setConfig}
        search={search}
        onSearch={setSearch}
        filterOpen={filterOpen}
        onFilterOpen={setFilterOpen}
        onNew={() => void createAtTop()}
      />
      {view.type === 'list' ? (
        <ListView {...body} />
      ) : view.type === 'gallery' ? (
        <GalleryView {...body} />
      ) : view.type === 'board' ? (
        <BoardView {...body} />
      ) : (
        <>
          {view.type === 'calendar' && (
            // La vue Calendrier arrive à la phase 5 ; ses éléments restent visibles en attendant.
            <p className="mb-1 text-xs text-muted-foreground">
              L’affichage en calendrier arrive bientôt : en attendant, les éléments sont en tableau.
            </p>
          )}
          <TableView {...body} />
        </>
      )}
      {peek && (
        <RowPeek
          rowId={peek}
          mode={config.open_pages_in === 'center_modal' ? 'center' : 'side'}
          onClose={() => setPeek(null)}
        />
      )}
    </section>
  )
}
