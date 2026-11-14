import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { addMonths, type Day, monthWeeks, periodLabel } from '@/features/databases/calendar/dates'
import { cn } from '@/lib/utils'
import { dayIn, isoUtc, longDay, timeIn, timeZones, zoneLabel } from './time'

const navButton =
  'flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent touch:size-10'
const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/**
 * Le choix d'un créneau (spec 6.17, 6.1) : un mois, ses jours qui ont des créneaux, puis les
 * heures du jour choisi, dans le fuseau de l'invité. Les créneaux sont calculés par le serveur à
 * chaque demande, jamais stockés.
 */
export function SlotPicker({
  queryKey,
  fetchSlots,
  timeZone,
  selected,
  onPick,
}: {
  queryKey: readonly unknown[]
  fetchSlots: (from: string, to: string) => Promise<string[]>
  timeZone: string
  selected: string | null
  onPick: (slot: string) => void
}) {
  const thisMonth = dayIn(new Date(), timeZone).slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [day, setDay] = useState<Day | null>(null)
  const [year, monthIndex] = month.split('-').map(Number) as [number, number]
  // Le mois dans le fuseau de l'invité : un peu plus large en UTC, puis trié par jour local.
  const from = isoUtc(new Date(Date.UTC(year, monthIndex - 1, 1) - 14 * 3_600_000))
  const to = isoUtc(new Date(Date.UTC(year, monthIndex, 1) + 14 * 3_600_000))
  const slots = useQuery({
    queryKey: [...queryKey, from, to],
    queryFn: () => fetchSlots(from, to),
    refetchInterval: 60_000,
  })
  const byDay = new Map<Day, string[]>()
  for (const slot of slots.data ?? []) {
    const key = dayIn(slot, timeZone)
    if (!key.startsWith(month)) continue
    byDay.set(key, [...(byDay.get(key) ?? []), slot])
  }
  // Le jour choisi s'il a des créneaux ce mois-ci, sinon le premier qui en a.
  const shownDay = day && byDay.has(day) ? day : ([...byDay.keys()][0] ?? null)

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
      <div>
        <div className="mb-2 flex items-center gap-1">
          <h3 className="flex-1 font-medium capitalize">{periodLabel('month', `${month}-01`)}</h3>
          <button
            type="button"
            aria-label="Mois précédent"
            disabled={month <= thisMonth}
            onClick={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))}
            className={navButton}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Mois suivant"
            onClick={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))}
            className={navButton}
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
        <div role="grid" aria-label="Jours" className="grid grid-cols-7 gap-1 text-center text-sm">
          {WEEKDAY_INITIALS.map((initial, i) => (
            <span key={i} aria-hidden className="text-xs text-muted-foreground">
              {initial}
            </span>
          ))}
          {monthWeeks(`${month}-01`)
            .flat()
            .map((date) => {
              const count = byDay.get(date)?.length ?? 0
              if (!date.startsWith(month)) return <span key={date} aria-hidden />
              return (
                <button
                  key={date}
                  type="button"
                  disabled={count === 0}
                  aria-pressed={date === shownDay}
                  aria-label={`${longDay(date)}${count > 0 ? `, ${count} créneau${count > 1 ? 'x' : ''}` : ', complet'}`}
                  onClick={() => setDay(date)}
                  className={cn(
                    'mx-auto flex size-9 items-center justify-center rounded-full tabular-nums',
                    count > 0
                      ? 'bg-primary/10 font-medium text-primary hover:bg-primary/20'
                      : 'text-muted-foreground/50',
                    date === shownDay && 'bg-primary text-primary-foreground hover:bg-primary',
                  )}
                >
                  {Number(date.slice(8))}
                </button>
              )
            })}
        </div>
      </div>
      <div className="grid content-start gap-1.5">
        {slots.isPending ? (
          <p className="text-sm text-muted-foreground">Recherche des créneaux…</p>
        ) : slots.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Les créneaux n’ont pas pu être chargés. Réessayez dans un instant.
          </p>
        ) : !shownDay ? (
          <div className="grid gap-2 text-sm">
            <p className="text-muted-foreground">Aucun créneau disponible ce mois-ci.</p>
            <button
              type="button"
              onClick={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))}
              className="w-fit text-primary hover:underline"
            >
              Voir le mois suivant
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-sm font-medium first-letter:uppercase">{longDay(shownDay)}</h3>
            <ul aria-label="Créneaux" className="grid gap-1.5">
              {byDay.get(shownDay)!.map((slot) => (
                <li key={slot}>
                  <button
                    type="button"
                    aria-pressed={slot === selected}
                    onClick={() => onPick(slot)}
                    className={cn(
                      'h-9 w-full rounded-md border border-primary/40 text-sm font-medium text-primary tabular-nums hover:bg-primary/10 touch:h-11',
                      slot === selected && 'bg-primary text-primary-foreground hover:bg-primary',
                    )}
                  >
                    {timeIn(slot, timeZone)}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

/** Le fuseau de l'invité : détecté, affiché clairement, modifiable (spec 6.17, 5.2). */
export function TimeZoneSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (timeZone: string) => void
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs text-muted-foreground">Fuseau horaire</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:border-primary touch:h-11"
      >
        {timeZones(value).map((zone) => (
          <option key={zone} value={zone}>
            {zone === value ? zoneLabel(zone) : zone.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </label>
  )
}
