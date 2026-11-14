<?php

namespace App\Support\Scheduling;

use App\Models\Booking;
use App\Models\Database;
use App\Models\Page;
use App\Models\SchedulingLink;
use App\Models\Workspace;
use App\Support\Calendars\Agenda;
use App\Support\Databases\PropertySchema;
use Carbon\CarbonImmutable;
use Throwable;

/**
 * Les disponibilités d'un organisateur (spec 6.17, 5.1). Les créneaux proposés se calculent à chaque
 * demande, jamais gardés : plages ouvertes du lien, moins les occupations de son Agenda (si « éviter
 * les conflits ») et ses rendez-vous déjà pris, élargies des marges, puis découpées en créneaux.
 *
 * Tout se lit sans la portée « données de l'utilisateur connecté » : un invité n'a pas de compte, et
 * une personne qui regarde les disponibilités d'une autre n'a pas accès à son espace.
 */
class Availability
{
    /** Un élément avec une heure mais sans fin occupe 30 minutes (comme dans le flux ICS). */
    private const DEFAULT_ITEM_SECONDS = 1800;

    /**
     * Les plages ouvertes du lien qui touchent [from, to[, sans les couper (les créneaux restent alignés
     * sur le début de chaque plage).
     *
     * @return list<array{0: int, 1: int}>
     */
    public static function windows(SchedulingLink $link, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $windows = [];
        if ($link->type === SchedulingLink::RECURRING) {
            $day = $from->setTimezone($link->timezone)->subDay()->startOfDay();
            $last = $to->setTimezone($link->timezone)->addDay()->startOfDay();
            for (; $day <= $last; $day = $day->addDay()) {
                foreach ($link->availability as $rule) {
                    if ((int) ($rule['weekday'] ?? 0) !== $day->dayOfWeekIso) {
                        continue;
                    }
                    // Heure locale du jour : « lundi 9 h » reste 9 h après un changement d'heure.
                    $start = $day->setTimeFromTimeString($rule['start'])->getTimestamp();
                    $end = $day->setTimeFromTimeString($rule['end'])->getTimestamp();
                    $windows[] = [$start, $end];
                }
            }
        } else {
            foreach ($link->availability as $range) {
                try {
                    $windows[] = [CarbonImmutable::parse($range['start'])->getTimestamp(), CarbonImmutable::parse($range['end'])->getTimestamp()];
                } catch (Throwable) {
                    continue;
                }
            }
        }

        return array_values(array_filter(
            $windows,
            fn (array $w) => $w[1] > $w[0] && $w[1] > $from->getTimestamp() && $w[0] < $to->getTimestamp(),
        ));
    }

    /**
     * Ce qui occupe l'organisateur entre from et to : les éléments datés avec une heure de son Agenda
     * (bases et agendas affichés ; pas les journées entières, ni les tâches terminées), et ses
     * rendez-vous confirmés. Sans titre ni détail : seulement des intervalles.
     *
     * @param  bool  $agenda  false : seulement les rendez-vous (lien sans « éviter les conflits »)
     * @return list<array{0: int, 1: int}>
     */
    public static function busy(
        string $userId,
        string $workspaceId,
        CarbonImmutable $from,
        CarbonImmutable $to,
        bool $agenda = true,
        ?Booking $except = null,
    ): array {
        $lo = $from->getTimestamp();
        $hi = $to->getTimestamp();
        $busy = [];

        if ($agenda) {
            $workspace = Workspace::query()->withoutGlobalScopes()->find($workspaceId);
            $settings = [...Agenda::DEFAULTS, ...($workspace?->agenda ?? [])];
            $hiddenDatabases = $settings['hidden_databases'];
            $hiddenSources = $settings['hidden_sources'];

            $databases = Database::query()->withoutGlobalScopes()
                ->where('workspace_id', $workspaceId)->whereNull('deleted_at')
                ->whereHas('page', fn ($page) => $page->withoutGlobalScopes()->whereNull('deleted_at'))
                ->get();
            foreach ($databases as $database) {
                $dateProperty = Agenda::dateProperty($database);
                if ($dateProperty === null) {
                    continue;
                }
                $status = collect($database->schema)->firstWhere('type', 'status');
                $done = $status === null ? [] : collect($status['options'])
                    ->where('group', PropertySchema::STATUS_GROUPS[2])->pluck('id')->all();

                $rows = Page::query()->withoutGlobalScopes()
                    ->where('database_id', $database->id)->whereNull('deleted_at')
                    ->get(['id', 'properties', 'calendar_source_id']);
                foreach ($rows as $row) {
                    if ($except !== null && $row->id === $except->page_id) {
                        continue;
                    }
                    $hidden = $row->calendar_source_id === null
                        ? in_array($database->id, $hiddenDatabases, true)
                        : in_array($row->calendar_source_id, $hiddenSources, true);
                    if ($hidden) {
                        continue;
                    }
                    $values = $row->properties ?? [];
                    if ($status !== null && in_array($values[$status['id']] ?? null, $done, true)) {
                        continue;
                    }
                    $interval = self::timedInterval($values[$dateProperty] ?? null);
                    if ($interval !== null && $interval[1] > $lo && $interval[0] < $hi) {
                        $busy[] = $interval;
                    }
                }
            }
        }

        $bookings = Booking::query()->withoutGlobalScopes()
            ->where('user_id', $userId)->where('status', 'confirmed')
            ->where('start_at', '<', $to)->where('end_at', '>', $from)
            ->when($except !== null, fn ($query) => $query->whereKeyNot($except->id))
            ->get(['start_at', 'end_at']);
        foreach ($bookings as $booking) {
            $busy[] = [$booking->start_at->getTimestamp(), $booking->end_at->getTimestamp()];
        }

        return Intervals::merge($busy);
    }

    /**
     * Les créneaux proposés par le lien entre from et to : l'heure de début (UTC) de chacun.
     *
     * @return list<CarbonImmutable>
     */
    public static function slots(
        SchedulingLink $link,
        CarbonImmutable $from,
        CarbonImmutable $to,
        ?Booking $except = null,
    ): array {
        if ($link->unavailableReason() !== null) {
            return [];
        }
        // Un seul rendez-vous par ce lien : dès qu'il existe, plus rien n'est proposé (sauf à le replanifier).
        if (! $link->allow_multiple_bookings && $link->bookings()->withoutGlobalScopes()
            ->where('status', 'confirmed')
            ->when($except !== null, fn ($query) => $query->whereKeyNot($except->id))
            ->exists()) {
            return [];
        }

        $now = CarbonImmutable::now();
        $lo = max($from->getTimestamp(), $now->addMinutes($link->min_notice_minutes)->getTimestamp());
        $hi = min($to->getTimestamp(), $now->addDays($link->max_advance_days)->getTimestamp());
        if ($link->expires_at !== null) {
            $hi = min($hi, $link->expires_at->getTimestamp());
        }
        if ($hi <= $lo) {
            return [];
        }

        $duration = $link->duration_minutes * 60;
        $step = max(5, $link->slot_step_minutes) * 60;
        $windows = self::windows($link, CarbonImmutable::createFromTimestampUTC($lo), CarbonImmutable::createFromTimestampUTC($hi));
        // Les occupations, élargies des marges : un rendez-vous laisse de la place avant et après.
        $busy = array_map(
            fn (array $i) => [$i[0] - $link->buffer_after_minutes * 60, $i[1] + $link->buffer_before_minutes * 60],
            self::busy(
                $link->user_id,
                $link->workspace_id,
                CarbonImmutable::createFromTimestampUTC($lo)->subDay(),
                CarbonImmutable::createFromTimestampUTC($hi)->addDay(),
                $link->avoid_conflicts,
                $except,
            ),
        );
        $free = Intervals::subtract($windows, $busy);

        $slots = [];
        foreach ($windows as [$start, $end]) {
            for ($t = $start; $t + $duration <= $end; $t += $step) {
                if ($t >= $lo && $t + $duration <= $hi && Intervals::contains($free, $t, $t + $duration)) {
                    $slots[$t] = CarbonImmutable::createFromTimestampUTC($t);
                }
            }
        }
        ksort($slots);

        return array_values($slots);
    }

    /**
     * L'intervalle d'une valeur Date avec une heure ; null pour une journée entière ou une valeur vide.
     *
     * @return array{0: int, 1: int}|null
     */
    private static function timedInterval(mixed $value): ?array
    {
        if (! is_array($value) || ! is_string($value['start'] ?? null) || ! str_contains($value['start'], 'T')) {
            return null;
        }
        try {
            $start = CarbonImmutable::parse($value['start'])->getTimestamp();
            $end = is_string($value['end'] ?? null) && str_contains($value['end'], 'T')
                ? CarbonImmutable::parse($value['end'])->getTimestamp()
                : $start + self::DEFAULT_ITEM_SECONDS;
        } catch (Throwable) {
            return null;
        }

        return [$start, max($end, $start + 60)];
    }
}
