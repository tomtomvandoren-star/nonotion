import type { Agenda } from '@nonotion/shared'
import { ArrowLeft, Copy, Ellipsis, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { addDays, dayOf, instantAt, timeOf } from '@/features/databases/calendar/dates'
import { copyLink, useLinkBookings, useLinkMutations } from '@/features/scheduling/queries'
import {
  DEVICE_TIME_ZONE,
  minutesLabel,
  timeZones,
  WEEKDAYS,
  whenLabel,
  zoneLabel,
} from '@/features/scheduling/time'
import { ApiError } from '@/lib/api/client'
import type {
  DatedRange,
  RecurringRange,
  SchedulingLink,
  SchedulingLinkInput,
} from '@/lib/api/scheduling'
import { cn } from '@/lib/utils'
import type { DrawnRanges } from './LinksPanel'

const field =
  'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary touch:h-11'
const timeField =
  'h-8 w-[6.5rem] rounded-md border border-border bg-background px-2 text-sm tabular-nums outline-none focus-visible:border-primary touch:h-10'
const iconButton =
  'flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent touch:size-10'
const label = 'grid gap-1 text-sm'
const caption = 'text-xs font-medium text-muted-foreground'

const DURATIONS = [15, 20, 30, 45, 60, 90, 120]
const STEPS = [5, 10, 15, 20, 30, 60]
const BUFFERS = [0, 5, 10, 15, 30, 45, 60]
const NOTICES: [number, string][] = [
  [0, 'Aucun'],
  [60, '1 h'],
  [120, '2 h'],
  [240, '4 h'],
  [720, '12 h'],
  [1440, '24 h'],
  [2880, '48 h'],
  [10080, '1 semaine'],
]

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number) as [number, number]
  return h * 60 + m
}
const fromMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** Les horaires proposés par défaut : du lundi au vendredi, de 9 h à 17 h. */
const DEFAULT_WEEK: RecurringRange[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  start: '09:00',
  end: '17:00',
}))

const isRecurring = (range: RecurringRange | DatedRange): range is RecurringRange =>
  'weekday' in range

/**
 * L'éditeur d'un lien de planification (spec 6.17, 3.2 et 3.3) : ses disponibilités (horaires de
 * la semaine, ou plages datées, saisies ou tracées sur la grille), ses options, son adresse.
 */
export function LinkEditor({
  workspaceId,
  agenda,
  link,
  type,
  drawn,
  onDone,
}: {
  workspaceId: string
  agenda: Agenda
  link: SchedulingLink | null
  type: SchedulingLink['type']
  drawn: DrawnRanges
  onDone: () => void
}) {
  const { create, update } = useLinkMutations(workspaceId)
  const bases = agenda.databases.filter((base) => !base.imported_only)
  const defaultTarget =
    bases.find((base) => base.id === agenda.settings.default_database_id)?.id ?? bases[0]?.id ?? ''
  const [form, setForm] = useState(() => ({
    title: link?.title ?? (type === 'recurring' ? 'Rendez-vous' : 'Rencontre'),
    description: link?.description ?? '',
    duration: link?.duration_minutes ?? 30,
    step: link?.slot_step_minutes ?? 30,
    bufferBefore: link?.buffer_before_minutes ?? 0,
    bufferAfter: link?.buffer_after_minutes ?? 0,
    minNotice: link?.min_notice_minutes ?? 240,
    maxAdvance: link?.max_advance_days ?? 60,
    expires: link?.expires_at ? dayOf(new Date(link.expires_at)) : '',
    location: link?.location ?? '',
    video: link?.video_url ?? '',
    phone: link?.phone ?? '',
    timezone: link?.timezone ?? DEVICE_TIME_ZONE,
    target: link ? (link.target_database_id ?? '') : defaultTarget,
    avoidConflicts: link?.avoid_conflicts ?? true,
    allowMultiple: link?.allow_multiple_bookings ?? true,
    singleUse: link?.single_use ?? false,
    slug: link?.slug ?? '',
    weekly: link ? link.availability.filter(isRecurring) : DEFAULT_WEEK,
  }))
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  const [customSlug, setCustomSlug] = useState(false)

  // Les plages d'un lien ponctuel vivent dans l'Agenda : on peut aussi les y tracer. Lues une fois,
  // à l'ouverture de l'éditeur : ensuite, ce sont celles de l'écran.
  const opening = useRef({ type, link, setDrawn: drawn.set })
  useEffect(() => {
    const { type: kind, link: initial, setDrawn } = opening.current
    if (kind !== 'one_off') return
    setDrawn(initial ? initial.availability.filter((range) => !isRecurring(range)) : [])
    return () => setDrawn(null)
  }, [])
  const ranges = drawn.ranges ?? []

  const save = link ? update : create
  const submit = () => {
    const input: SchedulingLinkInput = {
      type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      duration_minutes: form.duration,
      slot_step_minutes: form.step,
      buffer_before_minutes: form.bufferBefore,
      buffer_after_minutes: form.bufferAfter,
      min_notice_minutes: form.minNotice,
      max_advance_days: form.maxAdvance,
      expires_at: form.expires ? new Date(`${form.expires}T23:59:59`).toISOString() : null,
      location: form.location.trim() || null,
      video_url: form.video.trim() || null,
      phone: form.phone.trim() || null,
      timezone: form.timezone,
      target_database_id: form.target || null,
      avoid_conflicts: form.avoidConflicts,
      allow_multiple_bookings: form.allowMultiple,
      single_use: type === 'one_off' && form.singleUse,
      availability: type === 'recurring' ? form.weekly : ranges,
    }
    if (form.slug.trim() && form.slug.trim() !== link?.slug) input.slug = form.slug.trim()
    const done = (saved: SchedulingLink) => {
      toast.success(link ? 'Lien enregistré.' : 'Lien créé.', {
        action: { label: 'Copier le lien', onClick: () => void copyLink(saved.url) },
      })
      onDone()
    }
    if (link) update.mutate({ id: link.id, input }, { onSuccess: done })
    else create.mutate(input, { onSuccess: done })
  }
  const error = save.error
  const messages =
    error instanceof ApiError
      ? Object.keys(error.errors).length > 0
        ? [...new Set(Object.values(error.errors).flat())]
        : [error.message]
      : error
        ? ['Le lien n’a pas pu être enregistré. Réessayez dans un instant.']
        : []
  const slugError = error instanceof ApiError ? error.fieldError('slug') : undefined
  const prefix = link ? link.url.slice(0, link.url.length - link.slug.length) : '/rdv/'

  return (
    <form
      aria-label={link ? `Modifier ${link.title}` : 'Nouveau lien'}
      className="grid gap-5 px-5 pb-8"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <header className="grid gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" /> Tous les liens
        </button>
        <h2 className="text-lg font-semibold">
          {link
            ? 'Modifier le lien'
            : type === 'recurring'
              ? 'Nouveau lien récurrent'
              : 'Nouveau lien ponctuel'}
        </h2>
        {link?.unavailable_reason && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {link.unavailable_reason}
          </p>
        )}
      </header>

      <label className={label}>
        <span className={caption}>Titre (aussi celui du rendez-vous)</span>
        <input
          className={field}
          value={form.title}
          maxLength={255}
          required
          onChange={(event) => set('title', event.target.value)}
        />
      </label>

      <section aria-label="Disponibilités" className="grid gap-2">
        <h3 className="text-sm font-medium">Disponibilités</h3>
        {type === 'recurring' ? (
          <WeeklyEditor weekly={form.weekly} onChange={(weekly) => set('weekly', weekly)} />
        ) : (
          <RangesEditor ranges={ranges} onChange={(next) => drawn.set(next)} />
        )}
      </section>

      <section aria-label="Rendez-vous" className="grid grid-cols-2 gap-3">
        <h3 className="col-span-2 text-sm font-medium">Rendez-vous</h3>
        <label className={label}>
          <span className={caption}>Durée</span>
          <select
            className={field}
            value={form.duration}
            onChange={(event) => set('duration', Number(event.target.value))}
          >
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutesLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className={caption}>Un début possible toutes les</span>
          <select
            className={field}
            value={form.step}
            onChange={(event) => set('step', Number(event.target.value))}
          >
            {STEPS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutesLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className={caption}>Marge avant</span>
          <select
            className={field}
            value={form.bufferBefore}
            onChange={(event) => set('bufferBefore', Number(event.target.value))}
          >
            {BUFFERS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0 ? 'Aucune' : minutesLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className={caption}>Marge après</span>
          <select
            className={field}
            value={form.bufferAfter}
            onChange={(event) => set('bufferAfter', Number(event.target.value))}
          >
            {BUFFERS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0 ? 'Aucune' : minutesLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className={caption}>Pas de réservation à moins de</span>
          <select
            className={field}
            value={form.minNotice}
            onChange={(event) => set('minNotice', Number(event.target.value))}
          >
            {NOTICES.map(([minutes, text]) => (
              <option key={minutes} value={minutes}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className={caption}>Ni à plus de (jours)</span>
          <input
            type="number"
            className={field}
            min={1}
            max={365}
            value={form.maxAdvance}
            onChange={(event) => set('maxAdvance', Number(event.target.value) || 1)}
          />
        </label>
        <label className={label}>
          <span className={caption}>Expire après le</span>
          <input
            type="date"
            className={field}
            value={form.expires}
            onChange={(event) => set('expires', event.target.value)}
          />
        </label>
        <label className={label}>
          <span className={caption}>Fuseau horaire des horaires</span>
          <select
            className={field}
            value={form.timezone}
            onChange={(event) => set('timezone', event.target.value)}
          >
            {timeZones(form.timezone).map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className={cn(label, 'col-span-2')}>
          <span className={caption}>Le rendez-vous s’ajoute à</span>
          <select
            className={field}
            value={form.target}
            onChange={(event) => set('target', event.target.value)}
          >
            {bases.map((base) => (
              <option key={base.id} value={base.id}>
                {base.title || 'Sans titre'}
              </option>
            ))}
            <option value="">Aucune base (seulement les e-mails)</option>
          </select>
        </label>
      </section>

      <section aria-label="Options" className="grid gap-2 text-sm">
        <h3 className="font-medium">Options</h3>
        <Check
          checked={form.avoidConflicts}
          onChange={(value) => set('avoidConflicts', value)}
          label="Éviter les conflits"
          hint="Ce qui occupe déjà votre Agenda n’est pas proposé."
        />
        <Check
          checked={form.allowMultiple}
          onChange={(value) => set('allowMultiple', value)}
          label="Autoriser plusieurs réservations"
          hint="Sinon, plus aucun créneau n’est proposé après la première."
        />
        {type === 'one_off' && (
          <Check
            checked={form.singleUse}
            onChange={(value) => set('singleUse', value)}
            label="Lien à usage unique"
            hint="Il ne sert qu’une fois, et le rendez-vous ne se replanifie pas."
          />
        )}
      </section>

      <section aria-label="Lieu et détails" className="grid gap-3">
        <h3 className="text-sm font-medium">Lieu et détails</h3>
        <label className={label}>
          <span className={caption}>Lieu</span>
          <input
            className={field}
            value={form.location}
            maxLength={255}
            onChange={(event) => set('location', event.target.value)}
          />
        </label>
        <label className={label}>
          <span className={caption}>Lien de visioconférence</span>
          <input
            type="url"
            className={field}
            placeholder="https://…"
            value={form.video}
            onChange={(event) => set('video', event.target.value)}
          />
        </label>
        <label className={label}>
          <span className={caption}>Téléphone</span>
          <input
            type="tel"
            className={field}
            value={form.phone}
            maxLength={64}
            onChange={(event) => set('phone', event.target.value)}
          />
        </label>
        <label className={label}>
          <span className={caption}>Description</span>
          <textarea
            className={cn(field, 'h-auto min-h-20 py-2')}
            value={form.description}
            maxLength={5000}
            onChange={(event) => set('description', event.target.value)}
          />
        </label>
      </section>

      <section aria-label="Adresse du lien" className="grid gap-2 text-sm">
        <h3 className="font-medium">Adresse du lien</h3>
        {link && !customSlug && (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{link.url}</span>
            <button
              type="button"
              aria-label="Copier le lien"
              className={iconButton}
              onClick={() => void copyLink(link.url)}
            >
              <Copy aria-hidden className="size-4" />
            </button>
          </div>
        )}
        {customSlug ? (
          <label className="flex items-center gap-1">
            <span className="shrink-0 text-muted-foreground">{prefix}</span>
            <input
              aria-label="Adresse personnalisée"
              className={field}
              value={form.slug}
              maxLength={64}
              placeholder="mon-rendez-vous"
              onChange={(event) =>
                set('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
              }
            />
          </label>
        ) : (
          <button
            type="button"
            className="w-fit text-primary hover:underline"
            onClick={() => setCustomSlug(true)}
          >
            Personnaliser le lien
          </button>
        )}
        {slugError && <p className="text-xs text-destructive">{slugError}</p>}
      </section>

      {link && <BookingsList linkId={link.id} />}

      {messages.length > 0 && (
        <ul role="alert" className="grid gap-0.5 text-sm text-destructive">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 touch:h-11"
        >
          {link ? 'Enregistrer' : 'Créer'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-9 rounded-md px-3 text-sm hover:bg-accent touch:h-11"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}

function Check({
  checked,
  onChange,
  label: text,
  hint,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint: string
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={`${id}-hint`}
        className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
      />
      <label htmlFor={id} className="grid">
        <span>{text}</span>
        <span id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      </label>
    </div>
  )
}

/** Récurrent : une ligne par jour, plusieurs plages avec « + », et « ••• » → « Vider le jour ». */
function WeeklyEditor({
  weekly,
  onChange,
}: {
  weekly: RecurringRange[]
  onChange: (weekly: RecurringRange[]) => void
}) {
  const edit = (index: number, patch: Partial<RecurringRange>) =>
    onChange(weekly.map((range, i) => (i === index ? { ...range, ...patch } : range)))
  const add = (weekday: number) => {
    const last = weekly.filter((range) => range.weekday === weekday).at(-1)
    if (!last) return onChange([...weekly, { weekday, start: '09:00', end: '17:00' }])
    const start = Math.min(toMinutes(last.end), 23 * 60)
    onChange([
      ...weekly,
      { weekday, start: fromMinutes(start), end: fromMinutes(Math.min(start + 60, 23 * 60 + 59)) },
    ])
  }
  const copyToAll = (weekday: number) => {
    const day = weekly.filter((range) => range.weekday === weekday)
    onChange([1, 2, 3, 4, 5, 6, 7].flatMap((w) => day.map((range) => ({ ...range, weekday: w }))))
  }

  return (
    <div className="grid text-sm">
      {WEEKDAYS.map((name, i) => {
        const weekday = i + 1
        const entries = weekly
          .map((range, index) => ({ range, index }))
          .filter(({ range }) => range.weekday === weekday)
        return (
          <div
            key={name}
            role="group"
            aria-label={name}
            className="flex items-start gap-2 border-b border-border py-1.5 last:border-b-0"
          >
            <span className="w-20 shrink-0 pt-1.5">{name}</span>
            <div className="grid min-w-0 flex-1 gap-1">
              {entries.length === 0 ? (
                <span className="pt-1.5 text-muted-foreground">Indisponible</span>
              ) : (
                entries.map(({ range, index }, n) => (
                  <div key={index} className="flex items-center gap-1">
                    <input
                      type="time"
                      step={300}
                      aria-label={`${name}, début de la plage ${n + 1}`}
                      className={timeField}
                      value={range.start}
                      onChange={(event) => edit(index, { start: event.target.value })}
                    />
                    <span aria-hidden>–</span>
                    <input
                      type="time"
                      step={300}
                      aria-label={`${name}, fin de la plage ${n + 1}`}
                      className={timeField}
                      value={range.end}
                      onChange={(event) => edit(index, { end: event.target.value })}
                    />
                    <button
                      type="button"
                      aria-label={`Retirer la plage ${n + 1} du ${name.toLowerCase()}`}
                      className={iconButton}
                      onClick={() => onChange(weekly.filter((_, j) => j !== index))}
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              aria-label={`Ajouter une plage le ${name.toLowerCase()}`}
              className={iconButton}
              onClick={() => add(weekday)}
            >
              <Plus aria-hidden className="size-4" />
            </button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Options du ${name.toLowerCase()}`}
                  className={iconButton}
                >
                  <Ellipsis aria-hidden className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  onSelect={() => onChange(weekly.filter((range) => range.weekday !== weekday))}
                >
                  <Trash2 aria-hidden /> Vider le jour
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={entries.length === 0}
                  onSelect={() => copyToAll(weekday)}
                >
                  <Copy aria-hidden /> Copier sur tous les jours
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}
    </div>
  )
}

/** Ponctuel : des plages datées, saisies ici ou tracées sur la grille ; « ••• » → « Supprimer ». */
function RangesEditor({
  ranges,
  onChange,
}: {
  ranges: DatedRange[]
  onChange: (ranges: DatedRange[]) => void
}) {
  const sorted = ranges
    .map((range, index) => ({ range, index }))
    .sort((a, b) => a.range.start.localeCompare(b.range.start))
  const edit = (index: number, day: string, start: string, end: string) => {
    const from = toMinutes(start)
    const to = toMinutes(end) > from ? toMinutes(end) : Math.min(from + 60, 24 * 60 - 1)
    onChange(
      ranges.map((range, i) =>
        i === index ? { start: instantAt(day, from), end: instantAt(day, to) } : range,
      ),
    )
  }
  const add = () => {
    const last = sorted.at(-1)?.range
    const tomorrow = addDays(dayOf(new Date()), 1)
    const day = last ? addDays(dayOf(new Date(last.start)), 1) : tomorrow
    onChange([...ranges, { start: instantAt(day, 9 * 60), end: instantAt(day, 12 * 60) }])
  }

  return (
    <div className="grid gap-1 text-sm">
      {sorted.length === 0 ? (
        <p className="text-muted-foreground">Aucune plage pour l’instant.</p>
      ) : (
        <ul aria-label="Plages proposées" className="grid gap-1">
          {sorted.map(({ range, index }, n) => {
            const start = new Date(range.start)
            const end = new Date(range.end)
            const day = dayOf(start)
            return (
              <li key={index} className="flex items-center gap-1">
                <input
                  type="date"
                  aria-label={`Jour de la plage ${n + 1}`}
                  className={cn(timeField, 'w-[9.5rem]')}
                  value={day}
                  onChange={(event) =>
                    event.target.value &&
                    edit(index, event.target.value, timeOf(start), timeOf(end))
                  }
                />
                <input
                  type="time"
                  step={300}
                  aria-label={`Début de la plage ${n + 1}`}
                  className={timeField}
                  value={timeOf(start)}
                  onChange={(event) => edit(index, day, event.target.value, timeOf(end))}
                />
                <span aria-hidden>–</span>
                <input
                  type="time"
                  step={300}
                  aria-label={`Fin de la plage ${n + 1}`}
                  className={timeField}
                  value={timeOf(end)}
                  onChange={(event) => edit(index, day, timeOf(start), event.target.value)}
                />
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Options de la plage ${n + 1}`}
                      className={iconButton}
                    >
                      <Ellipsis aria-hidden className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => onChange(ranges.filter((_, i) => i !== index))}
                    >
                      <Trash2 aria-hidden /> Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={add}
        className="flex w-fit items-center gap-1 rounded-sm px-1 py-1 text-muted-foreground hover:bg-accent"
      >
        <Plus aria-hidden className="size-4" /> Ajouter une plage
      </button>
      <p className="text-xs text-muted-foreground">
        Ou tracez une plage sur la grille de l’Agenda (vue Semaine ou Jour). Heures de cet appareil
        : {zoneLabel(DEVICE_TIME_ZONE)}.
      </p>
    </div>
  )
}

/** Les rendez-vous pris par ce lien. */
function BookingsList({ linkId }: { linkId: string }) {
  const bookings = useLinkBookings(linkId)
  const [now] = useState(() => Date.now())
  const upcoming = (bookings.data ?? [])
    .filter((booking) => booking.status === 'confirmed' && Date.parse(booking.end_at) > now)
    .reverse()
  const others = (bookings.data ?? []).filter((booking) => !upcoming.includes(booking))

  return (
    <section aria-label="Rendez-vous pris" className="grid gap-2 text-sm">
      <h3 className="font-medium">Rendez-vous pris</h3>
      {bookings.isPending ? (
        <p className="text-muted-foreground">Chargement…</p>
      ) : upcoming.length === 0 && others.length === 0 ? (
        <p className="text-muted-foreground">Aucun pour l’instant.</p>
      ) : (
        <ul className="grid gap-1.5">
          {[...upcoming, ...others].map((booking) => (
            <li
              key={booking.id}
              className={cn('grid', !upcoming.includes(booking) && 'opacity-60')}
            >
              <span>
                {booking.invitee_name}{' '}
                <span className="text-muted-foreground">({booking.invitee_email})</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {whenLabel(booking.start_at, booking.end_at, DEVICE_TIME_ZONE)}
                {booking.status === 'cancelled' &&
                  ` · annulé${booking.cancelled_by === 'invitee' ? ' par l’invité' : ''}${booking.cancel_reason ? ` : ${booking.cancel_reason}` : ''}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
