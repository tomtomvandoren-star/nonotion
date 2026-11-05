import {
  type DatabaseRowData,
  dateValueSchema,
  type DateValue,
  newProperty,
  type Property,
} from '@nonotion/shared'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { displayTitle } from '@/features/pages/displayTitle'
import { requestTitleFocus } from '@/features/pages/useNewPage'
import { cn } from '@/lib/utils'
import { useCompletion } from '../completion'
import { NewItemInput } from '../NewItemInput'
import { useCreateRow, usePropertyMutation, useUpdateRow, useUpdateViewConfig } from '../queries'
import type { ViewBodyProps } from '../viewTypes'
import {
  calendarItem,
  type CalendarItem,
  calendarProperty,
  type Day,
  type DateProperty,
} from './dates'
import { MonthView } from './MonthView'
import { MyCalendars } from './MyCalendars'
import { type DragStart, useCalendarDrag } from './useCalendarDrag'
import { WeekView } from './WeekView'

export type CalendarProps = ViewBodyProps & {
  mode: 'month' | 'week'
  anchor: Day
  today: Day
  /** Un élément daté de ce jour, ouvert aussitôt, le curseur dans son titre. */
  onCreate: (day: Day) => void
}

/** Vue Calendrier (spec 6.8) : le mois ou la semaine, et le panneau « Sans date ». */
export function CalendarView(props: CalendarProps) {
  const property = calendarProperty(props.database, props.view.config.calendar_by)
  return property ? <Calendar {...props} property={property} /> : <CalendarSetup {...props} />
}

/** Un calendrier sans propriété Date : on la choisit, ou on en crée une. */
function CalendarSetup({ database, view }: ViewBodyProps) {
  const updateConfig = useUpdateViewConfig(database.id)
  const properties = usePropertyMutation(database.id)
  const dates = database.schema.filter((property) => property.type === 'date')
  const placeBy = (property: Property) =>
    updateConfig(view, { ...view.config, calendar_by: property.id })

  return (
    <div className="border-t border-border py-6 text-sm text-muted-foreground">
      <p className="mb-2">Un calendrier place les éléments selon une propriété Date.</p>
      <div className="flex flex-wrap gap-2">
        {dates.map((property) => (
          <button
            key={property.id}
            type="button"
            onClick={() => placeBy(property)}
            className="rounded-md border border-border px-2.5 py-1 text-foreground hover:bg-accent"
          >
            Calendrier par {property.name}
          </button>
        ))}
        {dates.length === 0 && (
          <button
            type="button"
            onClick={async () => {
              const date = newProperty(database.schema, 'date')
              await properties.mutateAsync({ kind: 'add', property: date })
              placeBy(date)
            }}
            className="rounded-md border border-border px-2.5 py-1 text-foreground hover:bg-accent"
          >
            Ajouter une Date
          </button>
        )}
      </div>
    </div>
  )
}

function Calendar({
  database,
  view,
  rows,
  onOpenRow,
  inherited,
  property,
  mode,
  anchor,
  today,
  onCreate,
}: CalendarProps & { property: DateProperty }) {
  const updateRow = useUpdateRow(database.id)
  const updateConfig = useUpdateViewConfig(database.id)
  const createRow = useCreateRow(database.id)
  const completion = useCompletion(database)
  const drag = useCalendarDrag({
    // Mise à jour optimiste : l'élément est à sa nouvelle date tout de suite (spec 6.8).
    onMove: (rowId, value) =>
      updateRow.mutate({ rowId, patch: { properties: { [property.id]: value } } }),
    onCreate: async (value) => {
      const row = await createRow.mutateAsync({
        properties: { ...inherited(), [property.id]: value },
      })
      requestTitleFocus(row.id)
      onOpenRow(row.id)
    },
  })

  // « Mes agendas » : les événements d'un agenda masqué ne s'affichent pas dans ce calendrier.
  const hidden = new Set(view.config.hidden_sources ?? [])
  const colors = new Map(database.sources.map((source) => [source.id, source.color]))
  const colorOf = (item: CalendarItem) =>
    item.row.calendar_source_id ? (colors.get(item.row.calendar_source_id) ?? null) : null

  const dated: CalendarItem[] = []
  const undated: DatabaseRowData[] = []
  for (const row of rows) {
    if (row.calendar_source_id && hidden.has(row.calendar_source_id)) continue
    const preview = drag.preview?.rowId === row.id ? drag.preview.value : null
    const parsed = dateValueSchema.safeParse(row.properties[property.id])
    const value: DateValue | null = preview ?? (parsed.success ? parsed.data : null)
    if (value) dated.push(calendarItem(row, value))
    else undated.push(row)
  }
  const creating =
    drag.preview && drag.preview.rowId === null && drag.preview.value.end
      ? { start: new Date(drag.preview.value.start), end: new Date(drag.preview.value.end) }
      : null

  const open = (rowId: string) => {
    if (!drag.wasDragging()) onOpenRow(rowId)
  }
  const grid = {
    anchor,
    today,
    items: dated,
    completion,
    colorOf,
    onOpen: open,
    onCreate,
    onDragStart: drag.start,
  }

  return (
    // Une seule colonne de côté, à gauche (« Mes agendas » puis « Sans date ») : la grille garde
    // sa largeur dans la colonne de la page. Sur téléphone, elle passe sous la grille.
    <div className="flex flex-col gap-3 md:flex-row md:items-start">
      <div className="order-2 grid gap-3 md:order-none md:w-52 md:shrink-0">
        {database.sources.length > 0 && (
          <MyCalendars
            database={database}
            hidden={hidden}
            onToggle={(sourceId, visible) => {
              const next = new Set(hidden)
              if (visible) next.delete(sourceId)
              else next.add(sourceId)
              updateConfig(view, { ...view.config, hidden_sources: [...next] })
            }}
          />
        )}
        <NoDatePanel
          databaseId={database.id}
          rows={undated}
          values={() => inherited()}
          onOpen={open}
          onDragStart={drag.start}
        />
      </div>
      <div className="min-w-0 flex-1">
        {mode === 'week' ? <WeekView {...grid} creating={creating} /> : <MonthView {...grid} />}
      </div>
    </div>
  )
}

/**
 * « Sans date » (spec 6.8), repliable, sur le côté : un élément qui n'est pas planifié ne se perd
 * jamais. On l'ouvre d'un clic, on le glisse sur un jour pour le dater.
 */
function NoDatePanel({
  databaseId,
  rows,
  values,
  onOpen,
  onDragStart,
}: {
  databaseId: string
  rows: DatabaseRowData[]
  values: () => Record<string, unknown>
  onOpen: (rowId: string) => void
  onDragStart: (event: React.PointerEvent, what: DragStart) => void
}) {
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState(false)
  return (
    <aside aria-label="Sans date" className="text-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-full items-center gap-1 rounded-sm px-1 text-muted-foreground hover:bg-accent"
      >
        <ChevronRight
          aria-hidden
          className={cn('size-4 transition-transform', open && 'rotate-90')}
        />
        Sans date
        <span className="ml-auto tabular-nums">{rows.length}</span>
      </button>
      {open && (
        <ul className="grid gap-0.5 pt-1">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                data-calendar-item={row.id}
                onClick={() => onOpen(row.id)}
                onPointerDown={(event) =>
                  onDragStart(event, { kind: 'move', rowId: row.id, value: null })
                }
                className="flex h-7 w-full items-center rounded-sm border border-border bg-background px-2 text-left select-none [-webkit-touch-callout:none] hover:bg-accent"
              >
                <span className="truncate">{displayTitle(row.title)}</span>
              </button>
            </li>
          ))}
          <li>
            <NewItemInput
              databaseId={databaseId}
              open={draft}
              onOpen={() => setDraft(true)}
              onClose={() => setDraft(false)}
              values={values}
              className="rounded-sm"
            />
          </li>
        </ul>
      )}
    </aside>
  )
}
