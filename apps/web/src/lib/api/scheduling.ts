import { z } from 'zod'
import { apiGet, apiRequest } from './client'

/** Planifier (spec 6.17) : liens de planification, réservations, disponibilités partagées. */

const dataOf = <T extends z.ZodType>(schema: T) => z.object({ data: schema })

export const recurringRangeSchema = z.object({
  /** 1 = lundi … 7 = dimanche (ISO). */
  weekday: z.number().int().min(1).max(7),
  start: z.string(),
  end: z.string(),
})
export type RecurringRange = z.infer<typeof recurringRangeSchema>

export const datedRangeSchema = z.object({ start: z.string(), end: z.string() })
export type DatedRange = z.infer<typeof datedRangeSchema>

export const schedulingLinkSchema = z.object({
  id: z.string(),
  type: z.enum(['one_off', 'recurring']),
  slug: z.string(),
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  duration_minutes: z.number(),
  slot_step_minutes: z.number(),
  buffer_before_minutes: z.number(),
  buffer_after_minutes: z.number(),
  timezone: z.string(),
  availability: z.array(z.union([recurringRangeSchema, datedRangeSchema])),
  target_database_id: z.string().nullable(),
  avoid_conflicts: z.boolean(),
  allow_multiple_bookings: z.boolean(),
  single_use: z.boolean(),
  min_notice_minutes: z.number(),
  max_advance_days: z.number(),
  location: z.string().nullable(),
  video_url: z.string().nullable(),
  phone: z.string().nullable(),
  expires_at: z.string().nullable(),
  status: z.enum(['active', 'disabled', 'consumed']),
  unavailable_reason: z.string().nullable(),
  upcoming_count: z.number(),
})
export type SchedulingLink = z.infer<typeof schedulingLinkSchema>

/** Ce qu'on envoie pour créer ou modifier un lien. */
export type SchedulingLinkInput = Partial<
  Omit<SchedulingLink, 'id' | 'url' | 'status' | 'unavailable_reason' | 'upcoming_count'>
> & { status?: 'active' | 'disabled' }

export const bookingSchema = z.object({
  id: z.string(),
  page_id: z.string().nullable(),
  invitee_name: z.string(),
  invitee_email: z.string(),
  note: z.string().nullable(),
  start_at: z.string(),
  end_at: z.string(),
  status: z.enum(['confirmed', 'cancelled']),
  cancel_reason: z.string().nullable(),
  cancelled_by: z.string().nullable(),
})
export type Booking = z.infer<typeof bookingSchema>

export const fetchLinks = (workspaceId: string) =>
  apiGet(`workspaces/${workspaceId}/scheduling-links`, dataOf(z.array(schedulingLinkSchema))).then(
    (r) => r.data,
  )

export const createLink = (workspaceId: string, input: SchedulingLinkInput) =>
  apiRequest(
    'POST',
    `workspaces/${workspaceId}/scheduling-links`,
    dataOf(schedulingLinkSchema),
    input,
  ).then((r) => r.data)

export const updateLink = (linkId: string, input: SchedulingLinkInput) =>
  apiRequest('PATCH', `scheduling-links/${linkId}`, dataOf(schedulingLinkSchema), input).then(
    (r) => r.data,
  )

export const duplicateLink = (linkId: string) =>
  apiRequest('POST', `scheduling-links/${linkId}/duplicate`, dataOf(schedulingLinkSchema)).then(
    (r) => r.data,
  )

export const deleteLink = (linkId: string) =>
  apiRequest('DELETE', `scheduling-links/${linkId}`, z.unknown())

export const fetchLinkBookings = (linkId: string) =>
  apiGet(`scheduling-links/${linkId}/bookings`, dataOf(z.array(bookingSchema))).then((r) => r.data)

/** Disponibilités partagées (fonction A) : qui peut voir mes blocs « Occupé ». */
export const freebusyShareSchema = z.object({ id: z.string(), email: z.string() })
export type FreebusyShare = z.infer<typeof freebusyShareSchema>

export const fetchShares = () =>
  apiGet('freebusy-shares', dataOf(z.array(freebusyShareSchema))).then((r) => r.data)

export const addShare = (email: string) =>
  apiRequest('POST', 'freebusy-shares', dataOf(freebusyShareSchema), { email }).then((r) => r.data)

export const removeShare = (shareId: string) =>
  apiRequest('DELETE', `freebusy-shares/${shareId}`, z.unknown())

export const personSchema = z.object({ id: z.string(), name: z.string(), email: z.string() })
export type Person = z.infer<typeof personSchema>

export const searchPeople = (query: string, signal?: AbortSignal) =>
  apiGet(`people?${new URLSearchParams({ q: query })}`, dataOf(z.array(personSchema)), signal).then(
    (r) => r.data,
  )

export const busySchema = z.array(z.object({ start: z.string(), end: z.string() }))
export type Busy = z.infer<typeof busySchema>

export const fetchFreebusy = (personId: string, from: string, to: string) =>
  apiGet(
    `people/${personId}/freebusy?${new URLSearchParams({ from, to })}`,
    dataOf(busySchema),
  ).then((r) => r.data)

/* Pages publiques (sans compte) */

export const publicLinkSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  duration_minutes: z.number(),
  location: z.string().nullable(),
  has_video: z.boolean(),
  has_phone: z.boolean(),
  organizer: z.string().nullable(),
  timezone: z.string(),
  type: z.enum(['one_off', 'recurring']),
  single_use: z.boolean(),
  unavailable_reason: z.string().nullable(),
})
export type PublicLink = z.infer<typeof publicLinkSchema>

export const publicBookingSchema = z.object({
  link: publicLinkSchema,
  invitee_name: z.string(),
  invitee_email: z.string(),
  invitee_timezone: z.string(),
  start_at: z.string(),
  end_at: z.string(),
  status: z.enum(['confirmed', 'cancelled']),
  cancel_reason: z.string().nullable(),
  cancelled_by: z.string().nullable(),
  video_url: z.string().nullable(),
  phone: z.string().nullable(),
  can_reschedule: z.boolean(),
  can_cancel: z.boolean(),
  token: z.string(),
  manage_url: z.string(),
})
export type PublicBooking = z.infer<typeof publicBookingSchema>

const slotsSchema = dataOf(z.object({ slots: z.array(z.string()) }))
const range = (from: string, to: string) => new URLSearchParams({ from, to }).toString()

export const fetchPublicLink = (slug: string) =>
  apiGet(`public/scheduling/${encodeURIComponent(slug)}`, dataOf(publicLinkSchema)).then(
    (r) => r.data,
  )

export const fetchPublicSlots = (slug: string, from: string, to: string) =>
  apiGet(
    `public/scheduling/${encodeURIComponent(slug)}/slots?${range(from, to)}`,
    slotsSchema,
  ).then((r) => r.data.slots)

export const bookSlot = (
  slug: string,
  input: { start: string; name: string; email: string; timezone: string; note?: string },
) =>
  apiRequest(
    'POST',
    `public/scheduling/${encodeURIComponent(slug)}/bookings`,
    dataOf(publicBookingSchema),
    input,
  ).then((r) => r.data)

export const fetchPublicBooking = (token: string) =>
  apiGet(`public/bookings/${encodeURIComponent(token)}`, dataOf(publicBookingSchema)).then(
    (r) => r.data,
  )

export const fetchRescheduleSlots = (token: string, from: string, to: string) =>
  apiGet(`public/bookings/${encodeURIComponent(token)}/slots?${range(from, to)}`, slotsSchema).then(
    (r) => r.data.slots,
  )

export const rescheduleBooking = (token: string, start: string) =>
  apiRequest(
    'POST',
    `public/bookings/${encodeURIComponent(token)}/reschedule`,
    dataOf(publicBookingSchema),
    { start },
  ).then((r) => r.data)

export const cancelBooking = (token: string, reason: string) =>
  apiRequest(
    'POST',
    `public/bookings/${encodeURIComponent(token)}/cancel`,
    dataOf(publicBookingSchema),
    { reason: reason.trim() || null },
  ).then((r) => r.data)
