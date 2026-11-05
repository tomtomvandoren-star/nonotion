import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { displayTitle } from '@/features/pages/displayTitle'
import { cn } from '@/lib/utils'
import {
  type CalendarItem,
  dayLabel,
  dayOf,
  daysBetween,
  layoutRow,
  layoutTimed,
  minutesOf,
  overlaps,
  parseDay,
  snapMinutes,
  timeOf,
  weekDays,
} from './dates'
import { ItemPill } from './ItemPill'
import type { GridProps } from './MonthView'
import { HOUR_HEIGHT, PX_PER_MINUTE } from './useCalendarDrag'

const dayName = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** Un élément à heure, dans la journée : il a sa place sur la grille des heures. */
const onGrid = (item: CalendarItem) => !item.allDay && daysBetween(item.startDay, item.endDay) === 0

/**
 * La semaine (spec 6.8) : la colonne des heures à gauche, les journées entières et les plages en
 * bandeau, les événements placés selon leurs heures, et une ligne rouge pour l'heure actuelle.
 * Cliquer-glisser sur la grille crée un événement avec ces horaires.
 */
export function WeekView({
  anchor,
  today,
  items,
  completion,
  colorOf,
  onOpen,
  onCreate,
  onDragStart,
  creating,
  single = false,
}: GridProps & {
  creating: { start: Date; end: Date } | null
  /** La vue Jour : une seule colonne, la journée de `anchor`. */
  single?: boolean
}) {
  const days = single ? [anchor] : weekDays(anchor)
  const band = layoutRow(
    items.filter((item) => !onGrid(item)),
    days,
  )
  const lanes = Math.max(1, ...band.map((segment) => segment.lane + 1))
  const scroller = useRef<HTMLDivElement>(null)
  const now = useNow()

  // On ouvre la journée vers 7 h, pas à minuit.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_HEIGHT
  }, [])

  const columns = 'grid'
  const columnTemplate = { gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }

  return (
    <div className="border-t border-border text-sm">
      <div className={columns} style={columnTemplate}>
        <div className="border-b border-border" />
        {days.map((day) => (
          <div
            key={day}
            data-day={day}
            aria-label={dayLabel(day)}
            className="group/day relative flex flex-col items-center border-b border-l border-border py-1"
          >
            {/* Le nom du jour au-dessus de son numéro : la colonne reste lisible même étroite. */}
            <span className="text-[10px] leading-3 text-muted-foreground">
              {dayName.format(parseDay(day))}
            </span>
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-sm tabular-nums',
                day === today && 'bg-primary font-semibold text-primary-foreground',
              )}
            >
              {Number(day.slice(8))}
            </span>
            <button
              type="button"
              aria-label={`Nouveau le ${dayLabel(day)}`}
              onClick={() => onCreate(day)}
              className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-sm bg-background text-muted-foreground opacity-0 transition-opacity group-hover/day:opacity-100 hover:bg-accent focus-visible:opacity-100 touch:opacity-60"
            >
              <Plus aria-hidden className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Bandeau des journées entières et des plages : les cases reçoivent les éléments glissés. */}
      <div className={cn(columns, 'relative')} style={columnTemplate}>
        <div className="flex items-center justify-end border-b border-border pr-1 text-[10px] text-muted-foreground">
          jour
        </div>
        {days.map((day) => (
          <div
            key={day}
            data-day={day}
            className="border-b border-l border-border"
            style={{ minHeight: lanes * 24 + 6 }}
          />
        ))}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 left-12 grid gap-y-0.5 py-0.5"
          style={{
            gridTemplateRows: `repeat(${lanes}, 22px)`,
            gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          {band.map((segment) => (
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

      <div ref={scroller} data-calendar-scroll className="max-h-[560px] overflow-y-auto">
        <div className={columns} style={columnTemplate}>
          <div>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="relative pr-1 text-right text-[10px] text-muted-foreground tabular-nums"
                style={{ height: HOUR_HEIGHT }}
              >
                {hour > 0 && <span className="relative -top-2">{`${hour}:00`}</span>}
              </div>
            ))}
          </div>
          {days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              isToday={day === today}
              now={now}
              items={items.filter((item) => onGrid(item) && overlaps(item, day, day))}
              creating={creating && dayOf(creating.start) === day ? creating : null}
              completion={completion}
              colorOf={colorOf}
              onOpen={onOpen}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayColumn({
  day,
  isToday,
  now,
  items,
  creating,
  completion,
  colorOf,
  onOpen,
  onDragStart,
}: Pick<GridProps, 'completion' | 'colorOf' | 'onOpen' | 'onDragStart'> & {
  day: string
  isToday: boolean
  now: Date
  items: CalendarItem[]
  creating: { start: Date; end: Date } | null
}) {
  const events = layoutTimed(
    items.map((item) => {
      const top = minutesOf(item.start!)
      const end = item.end && item.end > item.start! ? item.end : null
      const bottom = end ? (dayOf(end) === day ? minutesOf(end) : 24 * 60) : top + 30
      return { item, top, bottom: Math.max(bottom, top + 20) }
    }),
  )

  return (
    <div
      data-day={day}
      data-hours
      aria-label={dayLabel(day)}
      onPointerDown={(event) => {
        // Sur la grille vide, à la souris : cliquer-glisser crée un événement (spec 6.8).
        if (event.target !== event.currentTarget || event.pointerType === 'touch') return
        const minutes =
          (event.clientY - event.currentTarget.getBoundingClientRect().top) / PX_PER_MINUTE
        onDragStart(event, {
          kind: 'create',
          day,
          minutes: snapMinutes(Math.floor(minutes / 15) * 15),
        })
      }}
      className="relative border-l border-border"
      style={{
        height: 24 * HOUR_HEIGHT,
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT - 1}px ${HOUR_HEIGHT}px)`,
      }}
    >
      {events.map(({ item, top, bottom, col, cols }) => {
        const color = colorOf(item)
        return (
          <div
            key={item.row.id}
            data-done={completion?.isDone(item.row) || undefined}
            className="group/event absolute px-px"
            style={{
              top: top * PX_PER_MINUTE,
              height: (bottom - top) * PX_PER_MINUTE,
              left: `${(col / cols) * 100}%`,
              width: `${100 / cols}%`,
            }}
          >
            <button
              type="button"
              data-calendar-item={item.row.id}
              data-day-start={item.startDay}
              aria-label={`${displayTitle(item.row.title)}, ${timeOf(item.start!)}`}
              data-color={color ?? undefined}
              onClick={() => onOpen(item.row.id)}
              onPointerDown={(event) =>
                // Un événement importé garde ses heures : elles viennent de l'agenda d'origine.
                color
                  ? undefined
                  : onDragStart(event, {
                      kind: 'move',
                      rowId: item.row.id,
                      value: item.value,
                      grabMinutes:
                        (event.clientY - event.currentTarget.getBoundingClientRect().top) /
                        PX_PER_MINUTE,
                    })
              }
              className={cn(
                'flex size-full flex-col overflow-hidden rounded-sm border-l-2 px-1 text-left text-xs select-none [-webkit-touch-callout:none]',
                color
                  ? 'nn-tint border-current hover:brightness-95'
                  : 'border-primary bg-primary/15 hover:bg-primary/25',
              )}
            >
              <span className="nn-task-title truncate font-medium">
                {displayTitle(item.row.title)}
              </span>
              <span className="truncate text-muted-foreground tabular-nums">
                {timeOf(item.start!)}
                {item.end && item.end > item.start! && ` – ${timeOf(item.end)}`}
              </span>
            </button>
            {/* Tirer le bord du bas change la fin (spec 6.8). */}
            {!color && (
              <span
                aria-hidden
                onPointerDown={(event) =>
                  onDragStart(event, { kind: 'resize', rowId: item.row.id, value: item.value })
                }
                className="absolute inset-x-1 bottom-0 h-1.5 cursor-ns-resize rounded-b-sm group-hover/event:bg-primary/40"
              />
            )}
          </div>
        )
      })}
      {creating && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0.5 rounded-sm border border-primary bg-primary/20 px-1 text-xs tabular-nums"
          style={{
            top: minutesOf(creating.start) * PX_PER_MINUTE,
            height:
              Math.max(15, minutesOf(creating.end) - minutesOf(creating.start)) * PX_PER_MINUTE,
          }}
        >
          {timeOf(creating.start)} – {timeOf(creating.end)}
        </div>
      )}
      {isToday && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-red-500"
          style={{ top: minutesOf(now) * PX_PER_MINUTE }}
        >
          <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-red-500" />
        </div>
      )}
    </div>
  )
}

/** L'heure actuelle, rafraîchie chaque minute (la ligne rouge avance). */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}
