import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addDays, addMonths, type Day, periodLabel } from './dates'

const navButton =
  'flex h-7 items-center justify-center rounded-sm px-1.5 text-sm text-muted-foreground hover:bg-accent'

/**
 * À gauche de la barre d'outils d'un calendrier (spec 6.8) : « ‹ Aujourd'hui › », la période
 * affichée, et la bascule Mois | Semaine. Basculer garde la période : la semaine montrée est dans
 * le mois, et inversement.
 */
export function CalendarControls({
  mode,
  anchor,
  today,
  onAnchor,
  onMode,
}: {
  mode: 'month' | 'week'
  anchor: Day
  today: Day
  onAnchor: (day: Day) => void
  onMode: (mode: 'month' | 'week') => void
}) {
  const step = (direction: 1 | -1) =>
    onAnchor(mode === 'month' ? addMonths(anchor, direction) : addDays(anchor, 7 * direction))

  return (
    <div className="mr-auto flex min-w-0 flex-wrap items-center gap-0.5">
      <button
        type="button"
        aria-label={mode === 'month' ? 'Mois précédent' : 'Semaine précédente'}
        onClick={() => step(-1)}
        className={navButton}
      >
        <ChevronLeft aria-hidden className="size-4" />
      </button>
      <button type="button" onClick={() => onAnchor(today)} className={navButton}>
        Aujourd’hui
      </button>
      <button
        type="button"
        aria-label={mode === 'month' ? 'Mois suivant' : 'Semaine suivante'}
        onClick={() => step(1)}
        className={navButton}
      >
        <ChevronRight aria-hidden className="size-4" />
      </button>
      <span
        aria-live="polite"
        data-testid="calendar-period"
        className="px-1.5 text-sm font-semibold whitespace-nowrap first-letter:uppercase"
      >
        {periodLabel(mode, anchor)}
      </span>
      <div
        role="radiogroup"
        aria-label="Affichage du calendrier"
        className="ml-1 flex rounded-md border border-border p-0.5"
      >
        {(['month', 'week'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => onMode(value)}
            className={cn(
              'h-6 rounded-sm px-2 text-xs text-muted-foreground',
              mode === value ? 'bg-accent font-medium text-foreground' : 'hover:bg-accent/60',
            )}
          >
            {value === 'month' ? 'Mois' : 'Semaine'}
          </button>
        ))}
      </div>
    </div>
  )
}
