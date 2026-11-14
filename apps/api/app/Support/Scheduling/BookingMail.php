<?php

namespace App\Support\Scheduling;

use App\Models\Booking;
use App\Models\SchedulingLink;
use App\Models\User;
use Carbon\CarbonImmutable;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Sabre\VObject\Component\VCalendar;

/**
 * L'e-mail d'un rendez-vous (spec 6.17) : confirmé, déplacé ou annulé, pour l'invité ou pour
 * l'organisateur, à l'heure de chacun, avec l'invitation de calendrier (.ics) en pièce jointe.
 */
class BookingMail extends Mailable
{
    public function __construct(
        public Booking $booking,
        public SchedulingLink $link,
        public User $organizer,
        /** confirmed | rescheduled | cancelled */
        public string $kind,
        /** invitee | organizer */
        public string $recipient,
        /** Le lien « Replanifier ou annuler » (invité seulement). */
        public ?string $manageUrl,
    ) {}

    public function envelope(): Envelope
    {
        $title = $this->link->title;
        $when = $this->startText();

        return new Envelope(subject: match (true) {
            $this->kind === 'cancelled' => "Rendez-vous annulé : {$title}",
            $this->kind === 'rescheduled' => "Rendez-vous déplacé : {$title}, {$when}",
            $this->recipient === 'organizer' => "Nouveau rendez-vous : {$title} avec {$this->booking->invitee_name}",
            default => "Rendez-vous confirmé : {$title}, {$when}",
        });
    }

    public function content(): Content
    {
        return new Content(htmlString: $this->body());
    }

    /** @return list<Attachment> */
    public function attachments(): array
    {
        $method = $this->kind === 'cancelled' ? 'CANCEL' : 'REQUEST';

        return [
            Attachment::fromData(fn () => self::ics($this->booking, $this->link, $this->organizer), 'rendez-vous.ics')
                ->withMime("text/calendar; charset=UTF-8; method={$method}"),
        ];
    }

    /** L'invitation de calendrier : même identifiant d'un envoi à l'autre, version (SEQUENCE) en hausse. */
    public static function ics(Booking $booking, SchedulingLink $link, User $organizer): string
    {
        $cancelled = $booking->status === 'cancelled';
        $calendar = new VCalendar([
            'PRODID' => '-//Nonotion//Planifier//FR',
            'METHOD' => $cancelled ? 'CANCEL' : 'REQUEST',
        ]);
        $utc = new DateTimeZone('UTC');
        $event = $calendar->add('VEVENT', [
            'UID' => "booking-{$booking->id}@nonotion",
            'SEQUENCE' => $booking->sequence,
            'DTSTAMP' => now()->utc()->toDateTimeImmutable(),
            'DTSTART' => (new DateTimeImmutable($booking->start_at->toIso8601String()))->setTimezone($utc),
            'DTEND' => (new DateTimeImmutable($booking->end_at->toIso8601String()))->setTimezone($utc),
            'SUMMARY' => $link->title,
            'STATUS' => $cancelled ? 'CANCELLED' : 'CONFIRMED',
        ]);
        $details = array_filter([
            $link->description,
            $link->video_url ? "Visioconférence : {$link->video_url}" : null,
            $link->phone ? "Téléphone : {$link->phone}" : null,
        ]);
        if ($details !== []) {
            $event->add('DESCRIPTION', implode("\n", $details));
        }
        if ($link->location) {
            $event->add('LOCATION', $link->location);
        }
        if ($link->video_url) {
            $event->add('URL', $link->video_url);
        }
        $event->add('ORGANIZER', "mailto:{$organizer->email}", ['CN' => $organizer->name]);
        $event->add('ATTENDEE', "mailto:{$booking->invitee_email}", [
            'CN' => $booking->invitee_name,
            'ROLE' => 'REQ-PARTICIPANT',
            'PARTSTAT' => $cancelled ? 'DECLINED' : 'ACCEPTED',
        ]);

        return $calendar->serialize();
    }

    /** Le fuseau du destinataire : celui choisi par l'invité, ou celui du lien pour l'organisateur. */
    private function timezone(): string
    {
        return $this->recipient === 'invitee' ? $this->booking->invitee_timezone : $this->link->timezone;
    }

    private function startText(): string
    {
        return CarbonImmutable::instance($this->booking->start_at)
            ->setTimezone($this->timezone())
            ->locale('fr')
            ->isoFormat('dddd D MMMM YYYY [à] HH:mm');
    }

    private function body(): string
    {
        $b = $this->booking;
        $l = $this->link;
        $p = fn (string $text) => '<p style="margin:0 0 12px">'.$text.'</p>';
        $title = e($l->title);
        $when = e($this->startText()).' <span style="color:#787774">(heure de '.e($this->timezone()).', '.$l->duration_minutes.' min)</span>';

        $parts = [];
        if ($this->recipient === 'invitee') {
            $parts[] = $p('Bonjour '.e($b->invitee_name).',');
            $parts[] = $p(match ($this->kind) {
                'cancelled' => "Votre rendez-vous « {$title} » avec ".e($this->organizer->name).' est annulé.',
                'rescheduled' => "Votre rendez-vous « {$title} » avec ".e($this->organizer->name).' a été déplacé.',
                default => "Votre rendez-vous « {$title} » avec ".e($this->organizer->name).' est confirmé.',
            });
        } else {
            $who = e($b->invitee_name).' ('.e($b->invitee_email).')';
            $parts[] = $p(match ($this->kind) {
                'cancelled' => "{$who} a annulé le rendez-vous « {$title} ».",
                'rescheduled' => "{$who} a déplacé le rendez-vous « {$title} ».",
                default => "{$who} a réservé « {$title} ».",
            });
        }
        $parts[] = $p('<strong>'.$when.'</strong>');
        if ($this->kind !== 'cancelled') {
            foreach (array_filter([
                $l->location ? 'Lieu : '.e($l->location) : null,
                $l->video_url ? 'Visioconférence : <a href="'.e($l->video_url).'">'.e($l->video_url).'</a>' : null,
                $l->phone ? 'Téléphone : '.e($l->phone) : null,
            ]) as $line) {
                $parts[] = $p($line);
            }
        }
        if ($this->recipient === 'organizer' && $b->note) {
            $parts[] = $p('Message : '.nl2br(e($b->note)));
        }
        if ($this->kind === 'cancelled' && $b->cancel_reason) {
            $parts[] = $p('Motif : '.nl2br(e($b->cancel_reason)));
        }
        if ($this->manageUrl !== null && $this->kind !== 'cancelled') {
            $label = $l->single_use ? 'Annuler ce rendez-vous' : 'Replanifier ou annuler ce rendez-vous';
            $parts[] = $p('<a href="'.e($this->manageUrl).'">'.$label.'</a>');
        }
        $parts[] = '<p style="margin:16px 0 0;color:#787774;font-size:13px">L’invitation est jointe (rendez-vous.ics) pour l’ajouter à votre agenda.</p>';

        return '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;color:#37352f;line-height:1.5">'
            .implode('', $parts).'</div>';
    }
}
