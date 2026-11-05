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
import { Link2, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { requestTitleFocus } from '@/features/pages/useNewPage'
import { ApiError } from '@/lib/api/client'
import { useUi } from '@/stores/ui'
import { BoardView } from './BoardView'
import { CalendarControls } from './calendar/CalendarControls'
import { useSyncCalendar } from './calendar/calendarQueries'
import { CalendarFeedDialog } from './calendar/CalendarFeedDialog'
import { ImportCalendarDialog } from './calendar/ImportCalendarDialog'
import { CalendarView } from './calendar/CalendarView'
import { calendarProperty, type Day, visibleDays } from './calendar/dates'
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

const CALENDAR_KEYS = { d: 'day', w: 'week', m: 'month' } as const

/**
 * Une touche qu'on tape dans un champ ou dans le texte d'une page ne pilote pas le calendrier.
 * isContentEditable, pas l'attribut : la base vit dans l'éditeur, mais en îlot non modifiable.
 */
function isTyping(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  return Boolean(
    element &&
    (element.isContentEditable ||
      element.closest('input, textarea, select, [role="dialog"], [role="menu"]')),
  )
}

/**
 * Raccourcis du calendrier (spec 6.14) : D jour, W semaine, M mois, T aujourd'hui. Pour le
 * calendrier où se trouve le focus, sinon le premier de la page.
 */
function useCalendarKeys(
  section: React.RefObject<HTMLElement | null>,
  active: boolean,
  onKey: (key: 'd' | 'w' | 'm' | 't') => void,
) {
  const handler = useRef(onKey)
  useEffect(() => {
    handler.current = onKey
  })
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (event.ctrlKey || event.metaKey || event.altKey || !['d', 'w', 'm', 't'].includes(key))
        return
      if (isTyping(event.target) || document.querySelector('[role="dialog"]')) return
      const roots = [...document.querySelectorAll<HTMLElement>('[data-calendar-root]')]
      const focused = roots.find((root) => root.contains(document.activeElement))
      if ((focused ?? roots[0]) !== section.current) return
      event.preventDefault()
      handler.current(key as 'd' | 'w' | 'm' | 't')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, section])
}

/** Les agendas déjà resynchronisés à l'ouverture, pendant cette session. */
const syncedOnOpen = new Set<string>()

/**
 * Synchronisation à l'ouverture (spec 6.9) : un agenda en abonnement qui n'a pas été resynchronisé
 * depuis plus de 15 minutes l'est maintenant, sans attendre le planificateur.
 */
function useSyncOnOpen(database: DatabaseDetail) {
  const sync = useSyncCalendar(database.id)
  useEffect(() => {
    const stale = database.sources.filter(
      (source) =>
        source.mode === 'subscription' &&
        source.status !== 'error' &&
        !syncedOnOpen.has(source.id) &&
        (!source.last_sync_at || Date.now() - Date.parse(source.last_sync_at) > 15 * 60_000),
    )
    for (const source of stale) {
      syncedOnOpen.add(source.id)
      sync.mutate(source.id)
    }
    // La synchronisation n'a lieu qu'une fois par agenda : la fonction de mutation peut changer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database.sources])
}

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
  // La période affichée par un calendrier : elle reste la même quand on bascule Mois | Semaine.
  const [anchor, setAnchor] = useState(() => todayIn(timeZone))
  const [importing, setImporting] = useState(false)
  const [showingFeed, setShowingFeed] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  useSyncOnOpen(database)

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

  /** Calendrier : un élément daté de ce jour (spec 6.8), ouvert aussitôt, le curseur dans son titre. */
  const createOn = async (day: Day) => {
    const property = calendarProperty(database, config.calendar_by)
    if (!property) return createAtTop()
    const row = await createRow.mutateAsync({
      properties: { ...inherited(), [property.id]: { start: day } },
    })
    requestTitleFocus(row.id)
    openRow(row.id)
  }
  const calendarMode = config.calendar_mode ?? 'month'
  const shownDays = visibleDays(calendarMode, anchor)
  useCalendarKeys(sectionRef, view.type === 'calendar', (key) => {
    if (key === 't') setAnchor(ctx.today)
    else setConfig({ ...config, calendar_mode: CALENDAR_KEYS[key] })
  })

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
    <section
      ref={sectionRef}
      aria-label={database.title || 'Base sans titre'}
      data-calendar-root={view.type === 'calendar' || undefined}
      className="nn-database my-1"
    >
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
        onShowFeed={() => setShowingFeed(true)}
        {...(view.type === 'calendar'
          ? {
              // « Ajouter » date l'élément d'aujourd'hui s'il est à l'écran, sinon de la période.
              onNew: () => void createOn(shownDays.includes(ctx.today) ? ctx.today : anchor),
              newLabel: 'Ajouter',
              newMenu: (
                <>
                  <DropdownMenuItem
                    onSelect={() =>
                      void createOn(shownDays.includes(ctx.today) ? ctx.today : anchor)
                    }
                  >
                    <Plus aria-hidden /> Nouvel événement
                  </DropdownMenuItem>
                  {/* Ouverte juste après la fermeture du menu, pas pendant. */}
                  <DropdownMenuItem onSelect={() => setTimeout(() => setImporting(true), 0)}>
                    <Link2 aria-hidden /> Importer un agenda depuis un lien (ICS)
                  </DropdownMenuItem>
                </>
              ),
              leading: (
                <CalendarControls
                  mode={calendarMode}
                  anchor={anchor}
                  today={ctx.today}
                  onAnchor={setAnchor}
                  onMode={(calendar_mode) => setConfig({ ...config, calendar_mode })}
                />
              ),
            }
          : { onNew: () => void createAtTop() })}
      />
      {view.type === 'list' ? (
        <ListView {...body} />
      ) : view.type === 'gallery' ? (
        <GalleryView {...body} />
      ) : view.type === 'board' ? (
        <BoardView {...body} />
      ) : view.type === 'calendar' ? (
        <CalendarView
          {...body}
          mode={calendarMode}
          anchor={anchor}
          today={ctx.today}
          onCreate={(day) => void createOn(day)}
          onShowFeed={() => setShowingFeed(true)}
        />
      ) : (
        <TableView {...body} />
      )}
      <ImportCalendarDialog database={database} open={importing} onOpenChange={setImporting} />
      <CalendarFeedDialog database={database} open={showingFeed} onOpenChange={setShowingFeed} />
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
