import {
  type Agenda,
  type CalendarSource,
  type DatabaseDetail,
  dateValueSchema,
  type DateValue,
  todayIn,
  upcomingOccurrences,
} from '@nonotion/shared'
import { ChevronDown, Link2, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CalendarControls } from '@/features/databases/calendar/CalendarControls'
import {
  calendarItem,
  type CalendarItem,
  type Day,
  visibleDays,
} from '@/features/databases/calendar/dates'
import { CALENDAR_KEYS, useCalendarKeys, useSyncOnOpen } from '@/features/databases/calendar/hooks'
import { ImportCalendarPanel } from '@/features/databases/calendar/ImportCalendarPanel'
import type { ItemLook } from '@/features/databases/calendar/look'
import { MonthView } from '@/features/databases/calendar/MonthView'
import { useCalendarDrag } from '@/features/databases/calendar/useCalendarDrag'
import { WeekView } from '@/features/databases/calendar/WeekView'
import { completionFor } from '@/features/databases/completion'
import { useCreateRow, useUpdateRow } from '@/features/databases/queries'
import { RowPeek } from '@/features/databases/RowPeek'
import { useNavigate } from '@tanstack/react-router'
import { useWorkspaceId } from '@/features/pages/queries'
import { requestTitleFocus } from '@/features/pages/useNewPage'
import { useUi } from '@/stores/ui'
import { AccountCalendarsPanel, ICloudPanel } from './AccountPanels'
import { AgendaCalendars } from './AgendaCalendars'
import { useAgenda, useAgendaDatabases } from './queries'

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

/** Où vit un élément de l'Agenda : sa base, la Date qui le place, et l'agenda d'où il vient. */
type Placed = { database: DatabaseDetail; propertyId: string; source: CalendarSource | null }

/**
 * L'Agenda de l'espace de travail (spec 6.15) : toute sa semaine au même endroit. Les éléments datés
 * des bases Nonotion, les agendas abonnés par lien, et (plus tard dans la phase) Google et iCloud,
 * dans la même grille que la vue Calendrier d'une base (6.8).
 */
export function AgendaPage({ connexion }: { connexion?: string }) {
  const workspaceId = useWorkspaceId() ?? ''
  const agenda = useAgenda(workspaceId)

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pt-10 pb-24 md:px-8">
      {agenda.isPending ? (
        <p className="text-sm text-muted-foreground">Chargement de l’Agenda…</p>
      ) : agenda.isError ? (
        <p role="alert" className="text-sm text-destructive">
          L’Agenda n’a pas pu être chargé.
        </p>
      ) : (
        <AgendaBody workspaceId={workspaceId} agenda={agenda.data} connexion={connexion} />
      )}
    </div>
  )
}

/** Les panneaux à droite : une ligne, l'import d'un agenda, iCloud, les agendas d'un compte. */
type Panel =
  | { kind: 'row'; rowId: string }
  | { kind: 'import' }
  | { kind: 'icloud' }
  | { kind: 'account'; accountId: string }

/** Les messages du retour de Google (`?connexion=`). */
const CONNEXION_MESSAGES: Record<string, string> = {
  annulee: 'La connexion à Google Agenda a été annulée.',
  echec: 'Google n’a pas pu connecter ce compte. Réessayez dans un instant.',
}

function AgendaBody({
  workspaceId,
  agenda,
  connexion,
}: {
  workspaceId: string
  agenda: Agenda
  connexion?: string
}) {
  const { settings, sources } = agenda
  const mode = useUi((s) => s.agendaMode)
  const setMode = useUi((s) => s.setAgendaMode)
  const today = todayIn(timeZone)
  const [anchor, setAnchor] = useState<Day>(today)
  // Au retour de Google : le compte est là, on propose tout de suite de choisir ses agendas.
  const [panel, setPanel] = useState<Panel | null>(() => {
    const latest = agenda.accounts.filter((account) => account.provider === 'google').at(-1)
    return connexion === 'google' && latest ? { kind: 'account', accountId: latest.id } : null
  })
  const navigate = useNavigate()
  useEffect(() => {
    if (!connexion) return
    if (connexion === 'google')
      toast.success('Google Agenda est connecté : choisissez les agendas à synchroniser.')
    else toast.error(CONNEXION_MESSAGES[connexion] ?? CONNEXION_MESSAGES.echec!)
    void navigate({ to: '/agenda', search: {}, replace: true })
  }, [connexion, navigate])
  const closePanel = useCallback(() => setPanel(null), [])
  const accountOf = (accountId: string) =>
    agenda.accounts.find((account) => account.id === accountId)
  const sectionRef = useRef<HTMLElement>(null)
  const updateRow = useUpdateRow()
  const createRow = useCreateRow()

  const hiddenDatabases = new Set(settings.hidden_databases)
  const hiddenSources = new Set(settings.hidden_sources)
  const dateOf = new Map(agenda.databases.map((base) => [base.id, base.date_property]))
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const visibleSources = sources.filter((source) => !hiddenSources.has(source.id))
  // Les bases affichées (hors bases créées pour un import, montrées par leurs agendas).
  const shownBases = agenda.databases.filter(
    (base) => !base.imported_only && !hiddenDatabases.has(base.id),
  )
  // Les bases à charger : celles affichées, et celles qui portent un agenda affiché.
  const loaded = [
    ...new Set([
      ...shownBases.map((base) => base.id),
      ...visibleSources.map((source) => source.database_id).filter((id) => dateOf.has(id)),
    ]),
  ]
  const queries = useAgendaDatabases(loaded)
  const databases = queries.flatMap((query) => (query.data ? [query.data] : []))
  useSyncOnOpen(visibleSources)

  // La base des éléments créés depuis l'Agenda : celle choisie, sinon la première affichée.
  const target =
    shownBases.find((base) => base.id === settings.default_database_id) ?? shownBases[0] ?? null

  const placed = useRef(new Map<string, Placed>())
  const create = async (value: DateValue) => {
    if (!target) {
      toast.error('Affichez une base Nonotion dans « Mes agendas » pour y créer un élément.')
      return
    }
    const row = await createRow.mutateAsync({
      databaseId: target.id,
      properties: { [target.date_property]: value },
    })
    requestTitleFocus(row.id)
    setPanel({ kind: 'row', rowId: row.id })
  }
  const drag = useCalendarDrag({
    // Mise à jour optimiste, dans la base de l'élément (spec 6.8).
    onMove: (rowId, value) => {
      const where = placed.current.get(rowId)
      if (where)
        updateRow.mutate({
          databaseId: where.database.id,
          rowId,
          patch: { properties: { [where.propertyId]: value } },
        })
    },
    onCreate: (value) => void create(value),
  })

  const lastDay = visibleDays(mode, anchor).at(-1)!
  const items: CalendarItem[] = []
  const nextPlaced = new Map<string, Placed>()
  // Le même événement venu de deux agendas (même UID, même début) ne s'affiche qu'une fois.
  const seen = new Set<string>()
  for (const database of databases) {
    const propertyId = dateOf.get(database.id)
    if (!propertyId) continue
    for (const row of database.rows) {
      const source = row.calendar_source_id
        ? (sourceById.get(row.calendar_source_id) ?? null)
        : null
      if (source ? hiddenSources.has(source.id) : hiddenDatabases.has(database.id)) continue
      const preview = drag.preview?.rowId === row.id ? drag.preview.value : null
      const parsed = dateValueSchema.safeParse(row.properties[propertyId])
      const value: DateValue | null = preview ?? (parsed.success ? parsed.data : null)
      if (!value) continue
      if (row.ics_uid) {
        const key = `${row.ics_uid}\n${value.start}`
        if (seen.has(key)) continue
        seen.add(key)
      }
      nextPlaced.set(row.id, { database, propertyId, source })
      items.push(calendarItem(row, value))
      // Les prochaines fois d'une tâche qui se répète, à l'avance (spec 6.7).
      if (value.repeat && !preview)
        for (const next of upcomingOccurrences(value, lastDay, 60))
          items.push(calendarItem(row, next, true))
    }
  }
  // Ce que le glisser-déposer retrouve au relâcher (après l'affichage).
  useEffect(() => {
    placed.current = nextPlaced
  })

  const completions = new Map(
    databases.map((database) => [
      database.id,
      completionFor(database, (rowId, patch) =>
        updateRow.mutate({ databaseId: database.id, rowId, patch }),
      ),
    ]),
  )
  const lookOf = (item: CalendarItem): ItemLook => {
    const where = nextPlaced.get(item.row.id)
    if (!where)
      return { color: null, locked: true, completion: null, checkable: false, source: null }
    if (where.source)
      return {
        color: where.source.color,
        // Un agenda par lien est en lecture seule ; Google et iCloud se modifient dans les deux sens.
        locked: where.source.kind === 'ics' || !where.source.writable,
        completion: null,
        checkable: false,
        source: { kind: where.source.kind, label: where.source.name },
      }
    const color = settings.colors[where.database.id]
    return {
      color: color && color !== 'default' ? color : null,
      locked: false,
      completion: completions.get(where.database.id) ?? null,
      checkable: true,
      source: { kind: 'nonotion', label: where.database.title || 'Sans titre' },
    }
  }

  useCalendarKeys(sectionRef, true, (key) => {
    if (key === 't') setAnchor(today)
    else setMode(CALENDAR_KEYS[key])
  })

  const open = (rowId: string) => {
    if (!drag.wasDragging()) setPanel({ kind: 'row', rowId })
  }
  const creating =
    drag.preview && drag.preview.rowId === null && drag.preview.value.end
      ? { start: new Date(drag.preview.value.start), end: new Date(drag.preview.value.end) }
      : null
  const grid = {
    anchor,
    today,
    items,
    lookOf,
    onOpen: open,
    onCreate: (day: Day) => void create({ start: day }),
    onDragStart: drag.start,
  }
  const addOn = () =>
    void create({ start: visibleDays(mode, anchor).includes(today) ? today : anchor })
  const empty = agenda.databases.length === 0 && sources.length === 0

  return (
    <section ref={sectionRef} aria-label="Agenda" data-calendar-root>
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-3xl font-bold">Agenda</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <CalendarControls
            mode={mode}
            anchor={anchor}
            today={today}
            onAnchor={setAnchor}
            onMode={setMode}
          />
          <div className="flex h-7 items-stretch overflow-hidden rounded-sm bg-primary text-sm font-medium text-primary-foreground touch:h-10">
            <button
              type="button"
              onClick={addOn}
              className="flex items-center gap-1 px-2.5 hover:bg-primary/90"
            >
              <Plus aria-hidden className="size-4" /> Ajouter
            </button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Autres façons d’ajouter"
                  className="flex items-center border-l border-primary-foreground/25 px-1 hover:bg-primary/90"
                >
                  <ChevronDown aria-hidden className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64"
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                <DropdownMenuItem onSelect={addOn}>
                  <Plus aria-hidden /> Nouvel élément
                </DropdownMenuItem>
                {/* Ouvert juste après la fermeture du menu, pas pendant. */}
                <DropdownMenuItem
                  onSelect={() => setTimeout(() => setPanel({ kind: 'import' }), 0)}
                >
                  <Link2 aria-hidden /> Importer un agenda depuis un lien (ICS)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {empty && (
        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Rien à afficher pour l’instant : ajoutez un Gestionnaire de tâches dans une page (« /
          tâches »), ou importez un agenda par son lien.
        </p>
      )}

      {/* « Mes agendas » à gauche ; sur téléphone, sous la grille. */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="order-2 md:order-none md:w-60 md:shrink-0">
          <AgendaCalendars
            workspaceId={workspaceId}
            agenda={agenda}
            onImport={() => setPanel({ kind: 'import' })}
            onConnectICloud={() => setPanel({ kind: 'icloud' })}
            onAccountCalendars={(account) => setPanel({ kind: 'account', accountId: account.id })}
          />
        </div>
        <div className="min-w-0 flex-1">
          {mode === 'month' ? (
            <MonthView {...grid} />
          ) : (
            <WeekView {...grid} creating={creating} single={mode === 'day'} />
          )}
        </div>
      </div>

      {panel?.kind === 'row' && <RowPeek rowId={panel.rowId} mode="side" onClose={closePanel} />}
      {panel?.kind === 'import' && (
        <ImportCalendarPanel
          workspaceId={workspaceId}
          destinations={agenda.databases.map((base) => ({ id: base.id, title: base.title }))}
          initialDestination="new"
          newBaseUnder={null}
          onClose={closePanel}
        />
      )}
      {panel?.kind === 'icloud' && (
        <ICloudPanel
          workspaceId={workspaceId}
          onConnected={(account) => setPanel({ kind: 'account', accountId: account.id })}
          onClose={closePanel}
        />
      )}
      {panel?.kind === 'account' && accountOf(panel.accountId) && (
        <AccountCalendarsPanel
          workspaceId={workspaceId}
          account={accountOf(panel.accountId)!}
          agenda={agenda}
          onClose={closePanel}
        />
      )}
    </section>
  )
}
