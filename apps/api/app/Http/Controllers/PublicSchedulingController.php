<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\SchedulingLink;
use App\Models\User;
use App\Support\Scheduling\Availability;
use App\Support\Scheduling\BookingMail;
use App\Support\Scheduling\Bookings;
use App\Support\Scheduling\SlotTaken;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;

/**
 * La page publique de réservation et la page « Replanifier ou annuler » (spec 6.17, 6 et 7) : sans
 * compte, limitées en débit. Seuls des créneaux libres sont montrés, jamais un événement de
 * l'organisateur ; le lien de gestion est un jeton secret, renouvelé à chaque usage.
 */
class PublicSchedulingController extends Controller
{
    /** Au plus deux mois de créneaux par demande. */
    private const MAX_RANGE_DAYS = 62;

    public function show(string $slug): JsonResponse
    {
        return response()->json(['data' => self::presentLink($this->link($slug))]);
    }

    public function slots(Request $request, string $slug): JsonResponse
    {
        [$from, $to] = $this->range($request);

        return response()->json(['data' => [
            'slots' => self::iso(Availability::slots($this->link($slug), $from, $to)),
        ]]);
    }

    public function book(Request $request, string $slug): JsonResponse
    {
        $link = $this->link($slug);
        $data = $request->validate([
            'start' => ['required', 'date'],
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email:rfc', 'max:255'],
            // Avec les anciens noms (Asia/Calcutta…) que certains navigateurs donnent encore.
            'timezone' => ['required', 'string', 'timezone:all_with_bc'],
            'note' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);
        if (($reason = $link->unavailableReason()) !== null) {
            throw ValidationException::withMessages(['start' => $reason]);
        }

        try {
            [$booking, $token] = Bookings::book(
                $link,
                CarbonImmutable::parse($data['start'])->utc(),
                trim($data['name']),
                strtolower(trim($data['email'])),
                $data['timezone'],
                $data['note'] ?? null,
            );
        } catch (SlotTaken $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json(['data' => self::presentBooking($booking, $token)], 201);
    }

    public function booking(string $token): JsonResponse
    {
        $booking = $this->bookingByToken($token);

        return response()->json(['data' => self::presentBooking($booking, $token)]);
    }

    public function bookingSlots(Request $request, string $token): JsonResponse
    {
        $booking = $this->bookingByToken($token);
        [$from, $to] = $this->range($request);
        $link = $this->linkOf($booking);

        return response()->json(['data' => [
            'slots' => self::canReschedule($booking, $link) ? self::iso(Availability::slots($link, $from, $to, $booking)) : [],
        ]]);
    }

    public function reschedule(Request $request, string $token): JsonResponse
    {
        $booking = $this->bookingByToken($token);
        $data = $request->validate(['start' => ['required', 'date']]);
        if (! self::canReschedule($booking, $this->linkOf($booking))) {
            throw ValidationException::withMessages(['start' => 'Ce rendez-vous ne peut pas être replanifié.']);
        }

        try {
            $next = Bookings::reschedule($booking, CarbonImmutable::parse($data['start'])->utc());
        } catch (SlotTaken $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json(['data' => self::presentBooking($booking->refresh(), $next)]);
    }

    public function cancel(Request $request, string $token): JsonResponse
    {
        $booking = $this->bookingByToken($token);
        $data = $request->validate(['reason' => ['sometimes', 'nullable', 'string', 'max:2000']]);
        if ($booking->status !== 'confirmed') {
            throw ValidationException::withMessages(['reason' => 'Ce rendez-vous est déjà annulé.']);
        }
        $next = Bookings::cancel($booking, $data['reason'] ?? null, 'invitee');

        return response()->json(['data' => self::presentBooking($booking->refresh(), $next ?? $token)]);
    }

    /** L'invitation (.ics) à ajouter à son agenda. */
    public function ics(string $token): Response
    {
        $booking = $this->bookingByToken($token);
        $link = $this->linkOf($booking);
        $organizer = User::query()->findOrFail($booking->user_id);

        return response(BookingMail::ics($booking, $link, $organizer, Bookings::manageUrl($token)), 200, [
            'Content-Type' => 'text/calendar; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="rendez-vous.ics"',
        ]);
    }

    private function link(string $slug): SchedulingLink
    {
        return SchedulingLink::query()->withoutGlobalScopes()->withTrashed()
            ->where('slug', $slug)->firstOrFail();
    }

    private function bookingByToken(string $token): Booking
    {
        abort_unless(strlen($token) >= 32 && strlen($token) <= 64, 404);

        return Bookings::findByToken($token) ?? abort(404);
    }

    private function linkOf(Booking $booking): SchedulingLink
    {
        return SchedulingLink::query()->withoutGlobalScopes()->withTrashed()->findOrFail($booking->link_id);
    }

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} */
    private function range(Request $request): array
    {
        $data = $request->validate(['from' => ['required', 'date'], 'to' => ['required', 'date', 'after:from']]);
        $from = CarbonImmutable::parse($data['from'])->utc();
        $to = CarbonImmutable::parse($data['to'])->utc();
        if ($from->diffInDays($to) > self::MAX_RANGE_DAYS) {
            $to = $from->addDays(self::MAX_RANGE_DAYS);
        }

        return [$from, $to];
    }

    /** Pas de replanification pour un lien à usage unique, ni pour un rendez-vous annulé ou passé. */
    private static function canReschedule(Booking $booking, SchedulingLink $link): bool
    {
        return $booking->status === 'confirmed' && ! $link->single_use && $booking->start_at->isFuture()
            && ! $link->trashed() && $link->status !== 'disabled';
    }

    /**
     * @param  list<CarbonImmutable>  $slots
     * @return list<string>
     */
    private static function iso(array $slots): array
    {
        return array_map(fn (CarbonImmutable $slot) => $slot->format('Y-m-d\TH:i:s\Z'), $slots);
    }

    /** Ce qu'un invité voit du lien : jamais l'agenda de l'organisateur. */
    private static function presentLink(SchedulingLink $link): array
    {
        return [
            'title' => $link->title,
            'description' => $link->description,
            'duration_minutes' => $link->duration_minutes,
            'location' => $link->location,
            'has_video' => $link->video_url !== null,
            'has_phone' => $link->phone !== null,
            'organizer' => User::query()->find($link->user_id)?->name,
            'timezone' => $link->timezone,
            'type' => $link->type,
            'single_use' => $link->single_use,
            'unavailable_reason' => $link->unavailableReason(),
        ];
    }

    /** La réservation, pour l'invité : avec la visioconférence et le téléphone, et son lien de gestion. */
    private static function presentBooking(Booking $booking, string $token): array
    {
        $link = SchedulingLink::query()->withoutGlobalScopes()->withTrashed()->findOrFail($booking->link_id);

        return [
            'link' => self::presentLink($link),
            'invitee_name' => $booking->invitee_name,
            'invitee_email' => $booking->invitee_email,
            'invitee_timezone' => $booking->invitee_timezone,
            'start_at' => $booking->start_at->utc()->format('Y-m-d\TH:i:s\Z'),
            'end_at' => $booking->end_at->utc()->format('Y-m-d\TH:i:s\Z'),
            'status' => $booking->status,
            'cancel_reason' => $booking->cancel_reason,
            'cancelled_by' => $booking->cancelled_by,
            'video_url' => $link->video_url,
            'phone' => $link->phone,
            'can_reschedule' => self::canReschedule($booking, $link),
            'can_cancel' => $booking->status === 'confirmed' && $booking->end_at->isFuture(),
            'token' => $token,
            'manage_url' => Bookings::manageUrl($token),
        ];
    }
}
