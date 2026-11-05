<?php

namespace App\Support\Calendars;

use DateInterval;
use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Component\VEvent;
use Sabre\VObject\Property\ICalendar\DateTime as DateTimeProperty;
use Sabre\VObject\Reader;
use Sabre\VObject\TimeZoneUtil;

/**
 * Lit un agenda iCalendar avec sabre/vobject (spec 6.9) : les événements récurrents sont développés
 * sur la fenêtre demandée (les exceptions EXDATE exclues, les occurrences modifiées prises en compte),
 * chaque occurrence devient un événement à part, identifié par son UID et sa RECURRENCE-ID.
 * Une journée entière reste « AAAA-MM-JJ » ; une heure devient un instant UTC, avec son fuseau
 * d'origine (TZID, les noms Windows comme « W. Europe Standard Time » traduits en noms IANA).
 */
class IcsParser
{
    /**
     * @param  string|null  $floatingZone  le fuseau des heures « flottantes » (sans fuseau ni Z)
     * @return array{name: string|null, events: list<array<string, mixed>>, warnings: list<string>}
     */
    public static function parse(string $ics, DateTimeInterface $from, DateTimeInterface $to, ?string $floatingZone = null): array
    {
        try {
            $calendar = Reader::read($ics, Reader::OPTION_FORGIVING);
        } catch (\Throwable) {
            throw new FetchFailed('Cet agenda est illisible : le fichier iCalendar est mal formé.');
        }
        if (! $calendar instanceof VCalendar) {
            throw new FetchFailed('Ce lien ne renvoie pas un agenda au format iCalendar (.ics).');
        }

        // Le fuseau d'origine de chaque événement, lu avant le développement (qui passe tout en UTC).
        $zones = [];
        $unknownZones = [];
        foreach ($calendar->select('VEVENT') as $event) {
            /** @var VEvent $event */
            if (! isset($event->UID) || trim((string) $event->UID) === '') {
                // Sans UID, sabre ne sait pas développer : une empreinte stable en tient lieu.
                $event->UID = 'nonotion-'.sha1((string) $event->DTSTART.'|'.(string) $event->SUMMARY);
            }
            $start = $event->DTSTART;
            $tzid = $start instanceof DateTimeProperty && $start->hasTime() ? $start['TZID']?->getValue() : null;
            if ($tzid === null) {
                continue;
            }
            try {
                $zones[(string) $event->UID] = TimeZoneUtil::getTimeZone($tzid, $calendar, true)->getName();
            } catch (\Throwable) {
                $unknownZones[$tzid] = true;
            }
        }

        $floating = new DateTimeZone(self::validZone($floatingZone) ?? 'UTC');
        try {
            $expanded = $calendar->expand($from, $to, $floating);
        } catch (\Throwable) {
            throw new FetchFailed('Cet agenda est illisible : une règle de répétition est invalide.');
        }

        $events = [];
        $untitled = 0;
        foreach ($expanded->select('VEVENT') as $event) {
            /** @var VEvent $event */
            if (strtoupper(trim((string) $event->STATUS)) === 'CANCELLED' || ! $event->DTSTART instanceof DateTimeProperty) {
                continue;
            }
            $uid = (string) $event->UID;
            [$start, $end] = self::dates($event);
            $title = mb_substr(trim((string) $event->SUMMARY), 0, 255);
            if ($title === '') {
                $untitled++;
            }
            $url = trim((string) $event->URL);
            $events[] = [
                'uid' => strlen($uid) > 255 ? 'sha256:'.hash('sha256', $uid) : $uid,
                'recurrence_id' => self::recurrenceId($event),
                'title' => $title,
                'start' => $start,
                'end' => $end,
                'time_zone' => str_contains($start, 'T') ? ($zones[$uid] ?? null) : null,
                'location' => mb_substr(trim((string) $event->LOCATION), 0, 1000),
                'description' => mb_substr(trim(str_replace("\r\n", "\n", (string) $event->DESCRIPTION)), 0, 20_000),
                'url' => preg_match('#^https?://#i', $url) ? mb_substr($url, 0, 2000) : '',
            ];
        }
        usort($events, fn ($a, $b) => strcmp(self::sortKey($a['start']), self::sortKey($b['start'])));

        $warnings = [];
        if ($untitled > 0) {
            $warnings[] = $untitled === 1 ? 'Un événement n’a pas de titre.' : "{$untitled} événements n’ont pas de titre.";
        }
        foreach (array_keys($unknownZones) as $zone) {
            $warnings[] = "Fuseau inconnu « {$zone} » : ses heures sont lues en UTC.";
        }

        $name = mb_substr(trim((string) $calendar->{'X-WR-CALNAME'}), 0, 100);

        return ['name' => $name === '' ? null : $name, 'events' => $events, 'warnings' => $warnings];
    }

    /**
     * Début et fin au format des dates de Nonotion. La fin d'une journée entière est exclusive en
     * iCalendar (DTEND le lendemain) : elle devient le dernier jour inclus.
     *
     * @return array{0: string, 1: string|null}
     */
    private static function dates(VEvent $event): array
    {
        /** @var DateTimeProperty $startProperty */
        $startProperty = $event->DTSTART;
        $start = DateTimeImmutable::createFromInterface($startProperty->getDateTime());
        $end = isset($event->DTEND) && $event->DTEND instanceof DateTimeProperty
            ? DateTimeImmutable::createFromInterface($event->DTEND->getDateTime())
            : (isset($event->DURATION) ? $start->add(self::interval($event)) : null);

        if (! $startProperty->hasTime()) {
            $first = $start->format('Y-m-d');
            $last = $end?->modify('-1 day')->format('Y-m-d');

            return [$first, $last !== null && $last > $first ? $last : null];
        }

        $utc = new DateTimeZone('UTC');
        $startUtc = $start->setTimezone($utc);
        $endUtc = $end?->setTimezone($utc);

        return [
            $startUtc->format('Y-m-d\TH:i:s\Z'),
            $endUtc !== null && $endUtc > $startUtc ? $endUtc->format('Y-m-d\TH:i:s\Z') : null,
        ];
    }

    private static function interval(VEvent $event): DateInterval
    {
        try {
            return $event->DURATION->getDateInterval();
        } catch (\Throwable) {
            return new DateInterval('PT0S');
        }
    }

    /** « » pour un événement unique ; la date de l'occurrence pour un événement récurrent. */
    private static function recurrenceId(VEvent $event): string
    {
        $id = $event->{'RECURRENCE-ID'};
        if (! $id instanceof DateTimeProperty) {
            return '';
        }

        return $id->hasTime()
            ? DateTimeImmutable::createFromInterface($id->getDateTime())->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z')
            : $id->getDateTime()->format('Ymd');
    }

    /** Une journée entière se range avant les heures du même jour. */
    private static function sortKey(string $start): string
    {
        return strlen($start) === 10 ? $start.'T00:00:00' : $start;
    }

    public static function validZone(?string $zone): ?string
    {
        return $zone !== null && in_array($zone, DateTimeZone::listIdentifiers(), true) ? $zone : null;
    }
}
