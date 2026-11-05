import { Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { Completion } from '../completion'
import { type CalendarItem, type Day, dayLabel, layoutRow, monthWeeks, overlaps } from './dates'
import { ItemPill } from './ItemPill'
import type { DragStart } from './useCalendarDrag'

/** Lignes d'éléments visibles dans une case ; au-delà, « +3 autres ». */
const MAX_LANES = 3
const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']

export type GridProps = {
  anchor: Day
  today: Day
  items: CalendarItem[]
  completion: Completion | null
  /** La couleur de l'agenda importé d'un élément (null : un élément de la base). */
  colorOf: (item: CalendarItem) => string | null
  onOpen: (rowId: string) => void
  onCreate: (day: Day) => void
  onDragStart: (event: React.PointerEvent, what: DragStart) => void
}

/**
 * Le mois (spec 6.8) : 7 colonnes, une pastille par élément dans la case de son jour, les plages en
 * barres. Au survol d'une case, un « + » en haut à droite crée un élément daté de ce jour.
 */
export function MonthView({ anchor, today, items, ...rest }: GridProps) {
  const month = anchor.slice(0, 7)
  return (
    <div className="border-t border-l border-border text-sm">
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((name) => (
          <div
            key={name}
            className="border-r border-b border-border px-1.5 py-1 text-xs text-muted-foreground"
          >
            {name}
          </div>
        ))}
      </div>
      {monthWeeks(anchor).map((days) => (
        <MonthWeek
          key={days[0]}
          days={days}
          month={month}
          today={today}
          items={items.filter((item) => overlaps(item, days[0]!, days[6]!))}
          {...rest}
        />
      ))}
    </div>
  )
}

function MonthWeek({
  days,
  month,
  today,
  items,
  completion,
  colorOf,
  onOpen,
  onCreate,
  onDragStart,
}: Omit<GridProps, 'anchor'> & { days: Day[]; month: string }) {
  const segments = layoutRow(items, days)
  const shown = segments.filter((segment) => segment.lane < MAX_LANES)
  const hiddenOn = (col: number) =>
    segments.filter((s) => s.lane >= MAX_LANES && s.startCol <= col && s.endCol >= col).length

  return (
    <div className="relative grid min-h-[122px] grid-cols-7">
      {days.map((day, col) => {
        const hidden = hiddenOn(col)
        const label = dayLabel(day)
        return (
          <div
            key={day}
            data-day={day}
            aria-label={label}
            className={cn(
              'group/day relative border-r border-b border-border',
              !day.startsWith(month) && 'bg-muted/40',
            )}
          >
            <div className="flex h-7 items-center justify-between px-1">
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                  day === today && 'bg-primary font-semibold text-primary-foreground',
                  !day.startsWith(month) && day !== today && 'text-muted-foreground',
                )}
              >
                {Number(day.slice(8))}
              </span>
              <button
                type="button"
                aria-label={`Nouveau le ${label}`}
                onClick={() => onCreate(day)}
                className="flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover/day:opacity-100 hover:bg-accent focus-visible:opacity-100 touch:opacity-60"
              >
                <Plus aria-hidden className="size-4" />
              </button>
            </div>
            {hidden > 0 && (
              <MoreItems
                day={day}
                count={hidden}
                items={items.filter((item) => overlaps(item, day, day))}
                completion={completion}
                colorOf={colorOf}
                onOpen={onOpen}
              />
            )}
          </div>
        )
      })}
      <div
        className="pointer-events-none absolute inset-x-0 top-7 grid grid-cols-7 gap-y-0.5 px-px"
        style={{ gridTemplateRows: `repeat(${MAX_LANES}, 22px)` }}
      >
        {shown.map((segment) => (
          <ItemPill
            key={segment.item.row.id}
            item={segment.item}
            completion={completion}
            continuesBefore={segment.continuesBefore}
            continuesAfter={segment.continuesAfter}
            color={colorOf(segment.item)}
            onOpen={() => onOpen(segment.item.row.id)}
            onDragStart={colorOf(segment.item) ? undefined : onDragStart}
            className="pointer-events-auto mx-px"
            style={{
              gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
              gridRow: segment.lane + 1,
            }}
          />
        ))}
      </div>
    </div>
  )
}

/** « +3 autres » : tous les éléments du jour, dans une petite fenêtre. */
function MoreItems({
  day,
  count,
  items,
  completion,
  colorOf,
  onOpen,
}: {
  day: Day
  count: number
  items: CalendarItem[]
  completion: Completion | null
  colorOf: (item: CalendarItem) => string | null
  onOpen: (rowId: string) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute inset-x-1 bottom-0.5 h-5 truncate rounded-sm px-1 text-left text-xs text-muted-foreground hover:bg-accent"
        >
          +{count} autre{count > 1 ? 's' : ''}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2" aria-label={dayLabel(day)}>
        <p className="mb-1 px-1 text-xs font-medium text-muted-foreground first-letter:uppercase">
          {dayLabel(day)}
        </p>
        <div className="grid gap-0.5">
          {items.map((item) => (
            <ItemPill
              key={item.row.id}
              item={item}
              completion={completion}
              color={colorOf(item)}
              onOpen={() => onOpen(item.row.id)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
