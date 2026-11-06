import type { DateValue } from '@nonotion/shared'
import { displayTitle } from '@/features/pages/displayTitle'
import { cn } from '@/lib/utils'
import { formatDate } from '../values'
import { type CalendarItem, daysBetween, timeOf } from './dates'
import { type ItemLook, itemLabel } from './look'
import { SourceBadge } from './SourceBadge'
import type { DragStart } from './useCalendarDrag'

/**
 * La case « c'est fait » dans la grille (Agenda, spec 6.15) : cocher une tâche sans l'ouvrir. Une
 * répétition à venir n'en a pas : elle n'existe pas encore.
 */
export function DoneBox({
  item,
  look,
  className,
}: {
  item: CalendarItem
  look: ItemLook
  className?: string
}) {
  const completion = look.completion
  if (!look.checkable || !completion || item.ghost) return null
  const done = completion.isDone(item.row)
  return (
    <input
      type="checkbox"
      aria-label={`${displayTitle(item.row.title)} : ${done ? 'fait' : 'à faire'}`}
      checked={done}
      onChange={() => completion.toggle(item.row)}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn('size-3.5 shrink-0 cursor-pointer accent-[var(--primary)]', className)}
    />
  )
}

/**
 * Un élément dans une case du mois ou le bandeau des journées entières : une pastille (heure et
 * titre) pour une heure dans la journée, une barre pour une journée entière ou une plage.
 */
export function ItemPill({
  item,
  look,
  continuesBefore = false,
  continuesAfter = false,
  onOpen,
  onDragStart,
  className,
  style,
}: {
  item: CalendarItem
  look: ItemLook
  continuesBefore?: boolean
  continuesAfter?: boolean
  onOpen: () => void
  onDragStart?: (event: React.PointerEvent, what: DragStart) => void
  className?: string
  style?: React.CSSProperties
}) {
  const { color } = look
  const bar = item.allDay || daysBetween(item.startDay, item.endDay) > 0
  const time = !item.allDay && item.start ? timeOf(item.start) : null
  // Un événement importé garde ses dates ; une répétition à venir n'existe pas encore.
  const drag = look.locked || item.ghost ? undefined : onDragStart
  return (
    <div
      style={style}
      data-done={look.completion?.isDone(item.row) || undefined}
      className={cn('group/pill relative flex min-w-0 items-center gap-1', className)}
    >
      <DoneBox item={item} look={look} className="ml-0.5" />
      <button
        type="button"
        {...(item.ghost
          ? { 'data-calendar-occurrence': item.row.id }
          : { 'data-calendar-item': item.row.id })}
        data-day-start={item.startDay}
        data-color={color ?? undefined}
        aria-label={itemLabel(item, look, formatDate(item.value as DateValue))}
        onClick={onOpen}
        onPointerDown={(event) =>
          drag?.(event, { kind: 'move', rowId: item.row.id, value: item.value })
        }
        className={cn(
          'flex h-[22px] min-w-0 flex-1 items-center gap-1 overflow-hidden px-1.5 text-left text-xs select-none [-webkit-touch-callout:none]',
          bar
            ? color
              ? 'nn-tint rounded-sm font-medium hover:brightness-95'
              : 'rounded-sm bg-primary/15 font-medium text-foreground hover:bg-primary/25'
            : 'rounded-sm hover:bg-accent',
          bar && continuesBefore && 'rounded-l-none',
          bar && continuesAfter && 'rounded-r-none',
          item.ghost && 'border border-dashed border-current/40 opacity-60',
        )}
      >
        {look.source && <SourceBadge source={look.source} />}
        {!bar && !look.source && (
          <span
            aria-hidden
            data-color={color ?? undefined}
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              color ? 'nn-tint brightness-75' : 'bg-primary',
            )}
          />
        )}
        {time && <span className="shrink-0 text-muted-foreground tabular-nums">{time}</span>}
        <span className="nn-task-title truncate">{displayTitle(item.row.title)}</span>
      </button>
      {bar && !continuesAfter && drag && (
        // Tirer le bord droit change la fin (spec 6.8).
        <span
          aria-hidden
          onPointerDown={(event) =>
            drag(event, { kind: 'resize', rowId: item.row.id, value: item.value })
          }
          className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-sm group-hover/pill:bg-primary/40"
        />
      )}
    </div>
  )
}
