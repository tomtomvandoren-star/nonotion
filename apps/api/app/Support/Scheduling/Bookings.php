<?php

namespace App\Support\Scheduling;

use App\Models\Booking;
use App\Models\Database;
use App\Models\Page;
use App\Models\SchedulingLink;
use App\Models\User;
use App\Support\BlockText;
use App\Support\Calendars\Agenda;
use App\Support\Calendars\CalendarSync;
use App\Support\Databases\Databases;
use App\Support\MailCheck;
use Carbon\CarbonImmutable;
use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

/**
 * Réserver, replanifier, annuler (spec 6.17, 6 et 7). Le créneau est revalidé au dernier moment,
 * l'organisateur verrouillé le temps de la transaction : deux invités ne prennent jamais le même
 * créneau, même au même instant. Le rendez-vous devient un élément de la base choisie dans l'Agenda.
 */
class Bookings
{
    /**
     * @return array{0: Booking, 1: string} la réservation et le jeton secret de l'invité
     *
     * @throws SlotTaken
     */
    public static function book(
        SchedulingLink $link,
        CarbonImmutable $start,
        string $name,
        string $email,
        string $timezone,
        ?string $note,
    ): array {
        $token = self::newToken();
        $booking = DB::transaction(function () use ($link, $start, $name, $email, $timezone, $note, $token) {
            // Un organisateur à la fois : une autre réservation attend la fin de celle-ci.
            User::query()->whereKey($link->user_id)->lockForUpdate()->first();
            $link = SchedulingLink::query()->withoutGlobalScopes()->lockForUpdate()->findOrFail($link->id);
            self::ensureFree($link, $start);

            $end = $start->addMinutes($link->duration_minutes);
            $booking = Booking::query()->create([
                'link_id' => $link->id,
                'workspace_id' => $link->workspace_id,
                'user_id' => $link->user_id,
                'invitee_name' => $name,
                'invitee_email' => $email,
                'invitee_timezone' => $timezone,
                'note' => $note,
                'start_at' => $start,
                'end_at' => $end,
                'status' => 'confirmed',
                'manage_token_hash' => Booking::hashToken($token),
            ]);
            $booking->page_id = self::createEvent($link, $booking)?->id;
            $booking->save();
            if ($link->single_use) {
                $link->update(['status' => 'consumed']);
            }

            return $booking;
        });

        self::afterEventChange($booking);
        self::notify($booking, 'confirmed', $token);

        return [$booking, $token];
    }

    /**
     * Un autre horaire pour le même rendez-vous ; l'ancien lien de gestion ne marche plus.
     *
     * @return string le nouveau jeton
     *
     * @throws SlotTaken
     */
    public static function reschedule(Booking $booking, CarbonImmutable $start): string
    {
        $token = self::newToken();
        DB::transaction(function () use ($booking, $start, $token) {
            User::query()->whereKey($booking->user_id)->lockForUpdate()->first();
            $link = SchedulingLink::query()->withoutGlobalScopes()->withTrashed()->findOrFail($booking->link_id);
            self::ensureFree($link, $start, $booking);

            $booking->forceFill([
                'start_at' => $start,
                'end_at' => $start->addMinutes($link->duration_minutes),
                'manage_token_hash' => Booking::hashToken($token),
                'sequence' => $booking->sequence + 1,
            ])->save();
            self::moveEvent($booking, $link);
        });

        self::afterEventChange($booking);
        self::notify($booking, 'rescheduled', $token);

        return $token;
    }

    /**
     * Annulé par l'invité (avec un motif, s'il le donne) ou par l'organisateur (élément supprimé de
     * son agenda). L'élément part à la corbeille ; un lien à usage unique ne se réactive pas.
     *
     * @return string|null le nouveau jeton de l'invité (null quand c'est l'organisateur qui annule)
     */
    public static function cancel(Booking $booking, ?string $reason, string $by): ?string
    {
        if ($booking->status === 'cancelled') {
            return null;
        }
        $token = $by === 'invitee' ? self::newToken() : null;
        $booking->forceFill([
            'status' => 'cancelled',
            'cancel_reason' => $reason,
            'cancelled_by' => $by,
            'sequence' => $booking->sequence + 1,
            ...($token !== null ? ['manage_token_hash' => Booking::hashToken($token)] : []),
        ])->save();

        if ($by === 'invitee' && $booking->page_id !== null) {
            $page = Page::query()->withoutGlobalScopes()->whereNull('deleted_at')->find($booking->page_id);
            if ($page !== null) {
                Page::query()->withoutGlobalScopes()->whereKey($page->id)->update(['deleted_at' => now()]);
                CalendarSync::afterTrash($page);
            }
        }
        self::notify($booking, 'cancelled', $token);

        return $token;
    }

    /**
     * Des éléments de l'agenda mis à la corbeille par l'organisateur : leurs rendez-vous sont annulés,
     * et l'invité prévenu.
     *
     * @param  list<string>  $pageIds
     */
    public static function afterTrash(array $pageIds): void
    {
        $bookings = Booking::query()->withoutGlobalScopes()
            ->whereIn('page_id', $pageIds)->where('status', 'confirmed')
            ->where('end_at', '>', now())
            ->get();
        foreach ($bookings as $booking) {
            self::cancel($booking, null, 'organizer');
        }
    }

    public static function findByToken(string $token): ?Booking
    {
        return Booking::query()->withoutGlobalScopes()->where('manage_token_hash', Booking::hashToken($token))->first();
    }

    public static function manageUrl(string $token): string
    {
        return config('nonotion.frontend_url').'/rdv/gerer/'.$token;
    }

    public static function publicUrl(SchedulingLink $link): string
    {
        return config('nonotion.frontend_url').'/rdv/'.$link->slug;
    }

    /** @throws SlotTaken */
    private static function ensureFree(SchedulingLink $link, CarbonImmutable $start, ?Booking $except = null): void
    {
        $slots = Availability::slots($link, $start->subDay(), $start->addDay(), $except);
        foreach ($slots as $slot) {
            if ($slot->getTimestamp() === $start->getTimestamp()) {
                return;
            }
        }
        throw new SlotTaken;
    }

    /** Un jeton aléatoire de 256 bits, lisible dans une adresse. */
    private static function newToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    /** La base de destination et sa Date, si elles existent encore. */
    private static function target(SchedulingLink $link): ?array
    {
        if ($link->target_database_id === null) {
            return null;
        }
        $database = Database::query()->withoutGlobalScopes()->whereNull('deleted_at')
            ->where('workspace_id', $link->workspace_id)->find($link->target_database_id);
        $dateProperty = $database === null ? null : Agenda::dateProperty($database);

        return $dateProperty === null ? null : [$database, $dateProperty];
    }

    private static function dateValue(Booking $booking, SchedulingLink $link): array
    {
        return [
            'start' => $booking->start_at->utc()->format('Y-m-d\TH:i:s\Z'),
            'end' => $booking->end_at->utc()->format('Y-m-d\TH:i:s\Z'),
            'time_zone' => $link->timezone,
        ];
    }

    /** L'élément du rendez-vous dans l'agenda : titre, horaire, et ce que l'organisateur doit savoir. */
    private static function createEvent(SchedulingLink $link, Booking $booking): ?Page
    {
        $target = self::target($link);
        if ($target === null) {
            return null;
        }
        [$database, $dateProperty] = $target;

        $lines = ["Rendez-vous pris par {$booking->invitee_name} ({$booking->invitee_email}) avec le lien « {$link->title} »."];
        if ($booking->note) {
            $lines[] = "Message : {$booking->note}";
        }
        if ($link->location) {
            $lines[] = "Lieu : {$link->location}";
        }
        if ($link->video_url) {
            $lines[] = "Visioconférence : {$link->video_url}";
        }
        if ($link->phone) {
            $lines[] = "Téléphone : {$link->phone}";
        }
        $blocks = array_map(fn (string $text) => [
            'id' => (string) Str::uuid(),
            'type' => 'paragraph',
            'props' => (object) [],
            'content' => [['type' => 'text', 'text' => $text, 'styles' => (object) []]],
            'children' => [],
        ], $lines);

        $row = Databases::createRow($database, [
            'title' => mb_substr("{$link->title} · {$booking->invitee_name}", 0, 255),
            'properties' => [$dateProperty => self::dateValue($booking, $link)],
        ]);
        $row->forceFill([
            'content' => json_decode(json_encode($blocks), true),
            'search_text' => BlockText::extract(json_decode(json_encode($blocks), true)),
        ])->save();

        return $row;
    }

    private static function moveEvent(Booking $booking, SchedulingLink $link): void
    {
        $target = self::target($link);
        $row = $booking->page_id === null ? null : Page::query()->withoutGlobalScopes()->whereNull('deleted_at')->find($booking->page_id);
        if ($target === null || $row === null) {
            return;
        }
        $row->forceFill(['properties' => [...($row->properties ?? []), $target[1] => self::dateValue($booking, $link)]])->save();
    }

    /** L'élément créé ou déplacé part chez Google ou iCloud si sa base y est reliée (spec 6.15). */
    private static function afterEventChange(Booking $booking): void
    {
        $row = $booking->page_id === null ? null : Page::query()->withoutGlobalScopes()->find($booking->page_id);
        if ($row !== null) {
            CalendarSync::afterChange($row);
        }
    }

    /**
     * Prévient l'invité (avec son lien pour replanifier ou annuler) et l'organisateur, chacun à son
     * heure et avec l'invitation (.ics). Un envoi raté ne défait pas le rendez-vous.
     */
    private static function notify(Booking $booking, string $kind, ?string $token): void
    {
        $link = SchedulingLink::query()->withoutGlobalScopes()->withTrashed()->find($booking->link_id);
        $organizer = User::query()->find($booking->user_id);
        if ($link === null || $organizer === null) {
            return;
        }
        // L'organisateur qui annule lui-même est déjà au courant.
        $organizerToo = ! ($kind === 'cancelled' && $booking->cancelled_by === 'organizer');
        self::send($booking->invitee_email, new BookingMail($booking, $link, $organizer, $kind, 'invitee', $token === null ? null : self::manageUrl($token)));
        if ($organizerToo) {
            self::send($organizer->email, new BookingMail($booking, $link, $organizer, $kind, 'organizer', null));
        }
    }

    private static function send(string $to, Mailable $mail): void
    {
        try {
            Mail::to($to)->send($mail);
        } catch (Throwable $e) {
            Log::error('Envoi d’un e-mail de rendez-vous impossible', ['exception' => $e::class, 'message' => $e->getMessage()]);
            MailCheck::rememberFailure($e);
        }
    }
}
