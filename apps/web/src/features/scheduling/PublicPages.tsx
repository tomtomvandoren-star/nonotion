import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { CalendarCheck, CalendarPlus, CalendarX, Clock, MapPin, Phone, Video } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, apiUrl } from '@/lib/api/client'
import {
  bookSlot,
  cancelBooking,
  fetchPublicBooking,
  fetchPublicLink,
  fetchPublicSlots,
  fetchRescheduleSlots,
  type PublicBooking,
  type PublicLink,
  rescheduleBooking,
} from '@/lib/api/scheduling'
import { cn } from '@/lib/utils'
import { SlotPicker, TimeZoneSelect } from './SlotPicker'
import { DEVICE_TIME_ZONE, minutesLabel, whenLabel, zoneLabel } from './time'

const field =
  'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary touch:h-11'
const primary =
  'h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 touch:h-11'
const secondary =
  'inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent touch:h-11'

/** Le cadre des pages publiques : hors de l'application, sans barre latérale ni compte. */
function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-muted/40 px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-16">
      <div className="mx-auto grid max-w-[920px] gap-4">
        {children}
        <p className="text-center text-xs text-muted-foreground">Planifié avec Nonotion</p>
      </div>
    </main>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-background p-6 shadow-sm', className)}>
      {children}
    </div>
  )
}

/** Ce que l'invité sait du rendez-vous : l'organisateur, le titre, la durée, le lieu. */
function LinkDetails({ link }: { link: PublicLink }) {
  return (
    <aside className="grid content-start gap-2 text-sm">
      {link.organizer && <p className="text-muted-foreground">{link.organizer}</p>}
      <h1 className="text-2xl font-semibold">{link.title}</h1>
      <p className="flex items-center gap-2 text-muted-foreground">
        <Clock aria-hidden className="size-4" /> {minutesLabel(link.duration_minutes)}
      </p>
      {link.location && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <MapPin aria-hidden className="size-4" /> {link.location}
        </p>
      )}
      {link.has_video && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Video aria-hidden className="size-4" /> Visioconférence (le lien suit la réservation)
        </p>
      )}
      {link.has_phone && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Phone aria-hidden className="size-4" /> Par téléphone
        </p>
      )}
      {link.description && <p className="mt-2 whitespace-pre-line">{link.description}</p>}
    </aside>
  )
}

/** « 20261116T130000Z », pour le lien Google Agenda. */
const compact = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Le rendez-vous et de quoi l'ajouter à son agenda, ou le replanifier et l'annuler. */
function BookingSummary({
  booking,
  timeZone,
  manage = true,
}: {
  booking: PublicBooking
  timeZone: string
  manage?: boolean
}) {
  const cancelled = booking.status === 'cancelled'
  const google = new URL('https://calendar.google.com/calendar/render')
  google.searchParams.set('action', 'TEMPLATE')
  google.searchParams.set('text', booking.link.title)
  google.searchParams.set('dates', `${compact(booking.start_at)}/${compact(booking.end_at)}`)
  google.searchParams.set('details', `Replanifier ou annuler : ${booking.manage_url}`)
  google.searchParams.set('location', booking.link.location ?? booking.video_url ?? '')

  return (
    <div className="grid gap-3 text-sm">
      <p className={cn('text-base font-medium', cancelled && 'line-through')}>
        {whenLabel(booking.start_at, booking.end_at, timeZone)}
      </p>
      <p className="text-xs text-muted-foreground">{zoneLabel(timeZone)}</p>
      {!cancelled && booking.video_url && (
        <p className="flex items-center gap-2">
          <Video aria-hidden className="size-4" />
          <a href={booking.video_url} className="text-primary hover:underline">
            Rejoindre la visioconférence
          </a>
        </p>
      )}
      {!cancelled && booking.phone && (
        <p className="flex items-center gap-2">
          <Phone aria-hidden className="size-4" /> {booking.phone}
        </p>
      )}
      {!cancelled && (
        <div className="flex flex-wrap gap-2 pt-1">
          <a
            href={apiUrl(`public/bookings/${encodeURIComponent(booking.token)}/ics`)}
            className={secondary}
          >
            <CalendarPlus aria-hidden className="size-4" /> Ajouter à mon agenda (.ics)
          </a>
          <a href={google.toString()} target="_blank" rel="noreferrer" className={secondary}>
            Google Agenda
          </a>
          {manage && (
            <Link to="/rdv/gerer/$token" params={{ token: booking.token }} className={secondary}>
              Replanifier ou annuler
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * La page publique d'un lien de planification (spec 6.17, 6.1), à /rdv/<adresse> : sans compte, le
 * fuseau de l'invité détecté et modifiable, les créneaux libres, puis nom et e-mail.
 */
export function PublicBookingPage({ slug }: { slug: string }) {
  const link = useQuery({
    queryKey: ['public-link', slug],
    queryFn: () => fetchPublicLink(slug),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
  const [timeZone, setTimeZone] = useState(DEVICE_TIME_ZONE)
  const [slot, setSlot] = useState<string | null>(null)
  const [booked, setBooked] = useState<PublicBooking | null>(null)

  return (
    <PublicFrame>
      {link.isPending ? (
        <Card>
          <p className="text-sm text-muted-foreground">Chargement…</p>
        </Card>
      ) : link.isError ? (
        <Card>
          <p role="alert" className="text-sm">
            {link.error instanceof ApiError && link.error.status === 404
              ? 'Ce lien de planification n’existe pas.'
              : 'La page n’a pas pu être chargée. Réessayez dans un instant.'}
          </p>
        </Card>
      ) : booked ? (
        <Card className="grid gap-4">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <CalendarCheck aria-hidden className="size-6 text-primary" /> Rendez-vous confirmé
          </h1>
          <p className="text-sm text-muted-foreground">
            {booked.link.title}
            {booked.link.organizer && ` avec ${booked.link.organizer}`}. Une confirmation part à{' '}
            {booked.invitee_email}, avec l’invitation à ajouter à votre agenda.
          </p>
          <BookingSummary booking={booked} timeZone={timeZone} />
        </Card>
      ) : (
        <Card className="grid gap-8 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          <LinkDetails link={link.data} />
          {link.data.unavailable_reason ? (
            <p role="alert" className="self-center rounded-md bg-muted px-4 py-3 text-sm">
              {link.data.unavailable_reason}
            </p>
          ) : slot ? (
            <BookingForm
              slug={slug}
              slot={slot}
              timeZone={timeZone}
              durationMinutes={link.data.duration_minutes}
              onBack={() => setSlot(null)}
              onBooked={setBooked}
            />
          ) : (
            <section aria-label="Choisir un créneau" className="grid content-start gap-4">
              <h2 className="font-medium">Choisissez un créneau</h2>
              <SlotPicker
                queryKey={['public-slots', slug]}
                fetchSlots={(from, to) => fetchPublicSlots(slug, from, to)}
                timeZone={timeZone}
                selected={slot}
                onPick={setSlot}
              />
              <TimeZoneSelect value={timeZone} onChange={setTimeZone} />
            </section>
          )}
        </Card>
      )}
    </PublicFrame>
  )
}

function BookingForm({
  slug,
  slot,
  timeZone,
  durationMinutes,
  onBack,
  onBooked,
}: {
  slug: string
  slot: string
  timeZone: string
  durationMinutes: number
  onBack: () => void
  onBooked: (booking: PublicBooking) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const book = useMutation({
    mutationFn: () =>
      bookSlot(slug, {
        start: slot,
        name: name.trim(),
        email: email.trim(),
        timezone: timeZone,
        note: note.trim() || undefined,
      }),
    onSuccess: onBooked,
    onError: (error) => {
      // Pris entre-temps : retour aux créneaux, relus.
      if (error instanceof ApiError && error.status === 409) {
        toast.error(error.message)
        void queryClient.invalidateQueries({ queryKey: ['public-slots', slug] })
        onBack()
      }
    },
  })
  const error = book.error instanceof ApiError && book.error.status !== 409 ? book.error : null
  const end = new Date(Date.parse(slot) + durationMinutes * 60_000).toISOString()

  return (
    <form
      aria-label="Vos coordonnées"
      className="grid content-start gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        book.mutate()
      }}
    >
      <div className="grid gap-1">
        <button
          type="button"
          onClick={onBack}
          className="w-fit text-sm text-primary hover:underline"
        >
          ← Choisir un autre créneau
        </button>
        <p className="font-medium">{whenLabel(slot, end, timeZone)}</p>
        <p className="text-xs text-muted-foreground">{zoneLabel(timeZone)}</p>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Nom</span>
        <input
          className={field}
          required
          maxLength={100}
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {error?.fieldError('name') && (
          <span className="text-xs text-destructive">{error.fieldError('name')}</span>
        )}
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-muted-foreground">E-mail</span>
        <input
          type="email"
          className={field}
          required
          maxLength={255}
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {error?.fieldError('email') && (
          <span className="text-xs text-destructive">{error.fieldError('email')}</span>
        )}
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-muted-foreground">
          Un mot pour préparer le rendez-vous (facultatif)
        </span>
        <textarea
          className={cn(field, 'h-auto min-h-20 py-2')}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      {(error || (book.error && !(book.error instanceof ApiError))) && (
        <p role="alert" className="text-sm text-destructive">
          {error?.fieldError('start') ??
            error?.message ??
            'La réservation n’a pas abouti. Réessayez dans un instant.'}
        </p>
      )}
      <button type="submit" disabled={book.isPending} className={cn(primary, 'w-fit')}>
        {book.isPending ? 'Réservation…' : 'Confirmer le rendez-vous'}
      </button>
    </form>
  )
}

/**
 * « Replanifier ou annuler » (spec 6.17, 7), à /rdv/gerer/<jeton> : le lien du dernier e-mail. Chaque
 * usage en donne un nouveau, et l'ancien ne sert plus.
 */
export function ManageBookingPage({ token }: { token: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const booking = useQuery({
    queryKey: ['public-booking', token],
    queryFn: () => fetchPublicBooking(token),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
  const [chosenZone, setTimeZone] = useState<string | null>(null)
  const timeZone = chosenZone ?? booking.data?.invitee_timezone ?? DEVICE_TIME_ZONE
  const [mode, setMode] = useState<'view' | 'reschedule' | 'cancel'>('view')
  const [slot, setSlot] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const moved = (next: PublicBooking, message: string) => {
    queryClient.setQueryData(['public-booking', next.token], next)
    setMode('view')
    setSlot(null)
    toast.success(message)
    void navigate({ to: '/rdv/gerer/$token', params: { token: next.token }, replace: true })
  }
  const reschedule = useMutation({
    mutationFn: (start: string) => rescheduleBooking(token, start),
    onSuccess: (next) => moved(next, 'Rendez-vous déplacé. Une confirmation part par e-mail.'),
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : 'Le rendez-vous n’a pas pu être déplacé.',
      )
      setSlot(null)
      void queryClient.invalidateQueries({ queryKey: ['reschedule-slots', token] })
    },
  })
  const cancel = useMutation({
    mutationFn: () => cancelBooking(token, reason),
    onSuccess: (next) => moved(next, 'Rendez-vous annulé. L’organisateur est prévenu.'),
    onError: () => toast.error('Le rendez-vous n’a pas pu être annulé.'),
  })

  if (booking.isPending)
    return (
      <PublicFrame>
        <Card>
          <p className="text-sm text-muted-foreground">Chargement…</p>
        </Card>
      </PublicFrame>
    )
  if (booking.isError)
    return (
      <PublicFrame>
        <Card>
          <p role="alert" className="text-sm">
            {booking.error instanceof ApiError && booking.error.status === 404
              ? 'Ce lien n’est plus valable : chaque lien de gestion ne sert qu’une fois. Utilisez celui du dernier e-mail reçu.'
              : 'La page n’a pas pu être chargée. Réessayez dans un instant.'}
          </p>
        </Card>
      </PublicFrame>
    )

  const data = booking.data
  const cancelled = data.status === 'cancelled'
  const end = slot
    ? new Date(Date.parse(slot) + data.link.duration_minutes * 60_000).toISOString()
    : null

  return (
    <PublicFrame>
      <Card className="grid gap-8 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <LinkDetails link={data.link} />
        <section aria-label="Votre rendez-vous" className="grid content-start gap-4">
          <h2 className="flex items-center gap-2 font-medium">
            {cancelled ? (
              <>
                <CalendarX aria-hidden className="size-5 text-destructive" /> Rendez-vous annulé
              </>
            ) : (
              <>
                <CalendarCheck aria-hidden className="size-5 text-primary" /> Votre rendez-vous
              </>
            )}
          </h2>
          <BookingSummary booking={data} timeZone={timeZone} manage={false} />
          {cancelled && (
            <p className="text-sm text-muted-foreground">
              {data.cancelled_by === 'organizer'
                ? 'Annulé par l’organisateur.'
                : 'Vous avez annulé ce rendez-vous.'}
              {data.cancel_reason && ` Motif : ${data.cancel_reason}`}
            </p>
          )}

          {mode === 'view' && !cancelled && (
            <div className="flex flex-wrap gap-2">
              {data.can_reschedule && (
                <button type="button" className={secondary} onClick={() => setMode('reschedule')}>
                  Choisir un autre horaire
                </button>
              )}
              {data.can_cancel && (
                <button type="button" className={secondary} onClick={() => setMode('cancel')}>
                  Annuler le rendez-vous
                </button>
              )}
              {!data.can_reschedule && data.can_cancel && (
                <p className="w-full text-xs text-muted-foreground">
                  {data.link.single_use
                    ? 'Ce lien ne valait que pour un rendez-vous : il ne se replanifie pas.'
                    : 'Ce rendez-vous ne peut plus être replanifié.'}
                </p>
              )}
            </div>
          )}

          {mode === 'reschedule' && (
            <div className="grid gap-4 border-t border-border pt-4">
              <h3 className="font-medium">Choisir un autre horaire</h3>
              <SlotPicker
                queryKey={['reschedule-slots', token]}
                fetchSlots={(from, to) => fetchRescheduleSlots(token, from, to)}
                timeZone={timeZone}
                selected={slot}
                onPick={setSlot}
              />
              <TimeZoneSelect value={timeZone} onChange={setTimeZone} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!slot || reschedule.isPending}
                  className={primary}
                  onClick={() => slot && reschedule.mutate(slot)}
                >
                  {slot && end
                    ? `Déplacer au ${whenLabel(slot, end, timeZone)}`
                    : 'Choisissez un créneau'}
                </button>
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    setMode('view')
                    setSlot(null)
                  }}
                >
                  Retour
                </button>
              </div>
            </div>
          )}

          {mode === 'cancel' && (
            <form
              className="grid gap-3 border-t border-border pt-4"
              onSubmit={(event) => {
                event.preventDefault()
                cancel.mutate()
              }}
            >
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-muted-foreground">
                  Motif (facultatif, transmis à l’organisateur)
                </span>
                <textarea
                  className={cn(field, 'h-auto min-h-20 py-2')}
                  maxLength={2000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={cancel.isPending}
                  className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50 touch:h-11"
                >
                  Confirmer l’annulation
                </button>
                <button type="button" className={secondary} onClick={() => setMode('view')}>
                  Garder le rendez-vous
                </button>
              </div>
            </form>
          )}
        </section>
      </Card>
    </PublicFrame>
  )
}
