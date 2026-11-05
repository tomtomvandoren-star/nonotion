import type { DateValue } from '@nonotion/shared'
import { displayTitle } from '@/features/pages/displayTitle'
import { cn } from '@/lib/utils'
import type { Completion } from '../completion'
import { formatDate } from '../values'
import { type CalendarItem, daysBetween, timeOf } from './dates'
import type { DragStart } from './useCalendarDrag'

/**
 * Un élément dans une case du mois ou le bandeau des journées entières : une pastille (heure et
 * titre) pour une heure dans la journée, une barre pour une journée entière ou une plage.
 */
export function ItemPill({
  item,
  completion,
  continuesBefore = false,
  continuesAfter = false,
  onOpen,
  onDragStart,
  className,
  style,
}: {
  item: CalendarItem
  completion: Completion | null
  continuesBefore?: boolean
  continuesAfter?: boolean
  onOpen: () => void
  onDragStart?: (event: React.PointerEvent, what: DragStart) => void
  className?: string
  style?: React.CSSProperties
}) {
  const bar = item.allDay || daysBetween(item.startDay, item.endDay) > 0
  const time = !item.allDay && item.start ? timeOf(item.start) : null
  return (
    <div
      style={style}
      data-done={completion?.isDone(item.row) || undefined}
      className={cn('group/pill relative flex min-w-0', className)}
    >
      <button
        type="button"
        data-calendar-item={item.row.id}
        data-day-start={item.startDay}
        aria-label={`${displayTitle(item.row.title)}, ${formatDate(item.value as DateValue)}`}
        onClick={onOpen}
        onPointerDown={(event) =>
          onDragStart?.(event, { kind: 'move', rowId: item.row.id, value: item.value })
        }
        className={cn(
          'flex h-[22px] min-w-0 flex-1 items-center gap-1 overflow-hidden px-1.5 text-left text-xs select-none [-webkit-touch-callout:none]',
          bar
            ? 'rounded-sm bg-primary/15 font-medium text-foreground hover:bg-primary/25'
            : 'rounded-sm hover:bg-accent',
          bar && continuesBefore && 'rounded-l-none',
          bar && continuesAfter && 'rounded-r-none',
        )}
      >
        {!bar && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />}
        {time && <span className="shrink-0 text-muted-foreground tabular-nums">{time}</span>}
        <span className="nn-task-title truncate">{displayTitle(item.row.title)}</span>
      </button>
      {bar && !continuesAfter && onDragStart && (
        // Tirer le bord droit change la fin (spec 6.8).
        <span
          aria-hidden
          onPointerDown={(event) =>
            onDragStart(event, { kind: 'resize', rowId: item.row.id, value: item.value })
          }
          className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-sm group-hover/pill:bg-primary/40"
        />
      )}
    </div>
  )
}
