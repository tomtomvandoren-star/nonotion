<?php

namespace App\Support\Databases;

use App\Models\Database;
use App\Models\Page;
use App\Support\FractionalIndex;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\DB;

/**
 * Tâches récurrentes (spec 6.7) : quand une ligne dont une date « se répète » passe à « Terminé »,
 * la prochaine occurrence est créée (même titre, icône, contenu et valeurs), datée de l'échéance
 * suivante et remise « À faire ». La ligne terminée perd sa règle de répétition : la décocher puis
 * la recocher ne crée pas une deuxième occurrence.
 */
class Recurrence
{
    /**
     * À appeler après l'enregistrement des valeurs d'une ligne ; renvoie l'occurrence créée, s'il y a lieu.
     *
     * @param  array<string, mixed>  $before  les valeurs de la ligne avant la modification
     */
    public static function afterUpdate(Database $database, Page $row, array $before): ?Page
    {
        $after = $row->properties ?? [];
        $status = self::completedStatus($database, $before, $after);
        $date = $status === null ? null : self::repeatingDate($database, $after);
        if ($status === null || $date === null) {
            return null;
        }

        $value = $after[$date['id']];
        $todo = collect($status['options'])->firstWhere('group', 'todo');
        $nextValue = self::nextValue($value);
        unset($value['repeat']);
        if ($nextValue === null) {
            // La répétition est finie (date dépassée, dernière fois) : plus de suite.
            $row->forceFill(['properties' => [...$after, $date['id'] => $value]])->save();

            return null;
        }

        $next = $row->replicate(['version']);
        $next->is_favorite = false;
        $next->position = self::positionAfter($row);
        $next->properties = [
            ...$after,
            $date['id'] => $nextValue,
            $status['id'] => $todo['id'] ?? null,
        ];
        $next->save();
        // Une base contenue dans la tâche est copiée, pas partagée entre les deux occurrences.
        PageCopier::copyDatabases([$row->id => $next->id]);

        $row->forceFill(['properties' => [...$after, $date['id'] => $value]])->save();

        return $next->refresh();
    }

    /**
     * La date suivante : le début (et la fin, pour garder la durée) décalés de « tous les N … ».
     * Null si la répétition est finie : le jour suivant dépasse « jusqu'au », ou c'était la
     * dernière fois (count compte les occurrences restantes, celle-ci comprise).
     *
     * @param  array{start: string, end?: string|null, repeat: array{unit: string, interval: int, until?: string|null, count?: int|null}}  $value
     * @return array<string, mixed>|null
     */
    public static function nextValue(array $value): ?array
    {
        $repeat = $value['repeat'];
        ['unit' => $unit, 'interval' => $interval] = $repeat;
        $count = $repeat['count'] ?? null;
        if ($count !== null && $count <= 1) {
            return null;
        }
        $zone = $value['time_zone'] ?? null;
        $next = [...$value, 'start' => self::shift($value['start'], $unit, $interval, $zone)];
        if (isset($value['end'])) {
            $next['end'] = self::shift($value['end'], $unit, $interval, $zone);
        }
        $until = $repeat['until'] ?? null;
        if ($until !== null && self::localDay($next['start'], $zone) > $until) {
            return null;
        }
        if ($count !== null) {
            $next['repeat']['count'] = $count - 1;
        }

        return $next;
    }

    /** Le jour d'un début, dans son fuseau d'origine pour une heure. */
    private static function localDay(string $start, ?string $zone): string
    {
        if (strlen($start) === 10) {
            return $start;
        }
        $date = new DateTimeImmutable($start);
        $local = self::zone($zone);

        return ($local === null ? $date : $date->setTimezone($local))->format('Y-m-d');
    }

    /**
     * Décale une journée (« 2026-11-05 ») ou un instant ISO, dans le format reçu. Avec son fuseau
     * d'origine, une heure garde la même heure locale d'un jour à l'autre, changement d'heure compris.
     */
    public static function shift(string $value, string $unit, int $interval, ?string $zone = null): string
    {
        if (strlen($value) === 10) {
            return self::add(new DateTimeImmutable($value.'T00:00:00', new DateTimeZone('UTC')), $unit, $interval)->format('Y-m-d');
        }

        $date = new DateTimeImmutable($value);
        $local = self::zone($zone);
        $shifted = self::add($local === null ? $date : $date->setTimezone($local), $unit, $interval);
        if (str_ends_with($value, 'Z')) {
            $format = str_contains($value, '.') ? 'Y-m-d\TH:i:s.v\Z' : 'Y-m-d\TH:i:s\Z';

            return $shifted->setTimezone(new DateTimeZone('UTC'))->format($format);
        }

        return $shifted->format('Y-m-d\TH:i:sP');
    }

    /** Le fuseau nommé, s'il existe sur ce serveur. */
    private static function zone(?string $name): ?DateTimeZone
    {
        try {
            return $name === null ? null : new DateTimeZone($name);
        } catch (\Exception) {
            return null;
        }
    }

    /** « Tous les mois » le 31 janvier tombe le 28 (ou 29) février, pas le 3 mars. */
    private static function add(DateTimeImmutable $date, string $unit, int $interval): DateTimeImmutable
    {
        if ($unit === 'day' || $unit === 'week') {
            $days = $unit === 'week' ? 7 * $interval : $interval;

            return $date->modify("+{$days} days");
        }

        $months = (int) $date->format('n') - 1 + ($unit === 'year' ? 12 * $interval : $interval);
        $year = (int) $date->format('Y') + intdiv($months, 12);
        $month = $months % 12 + 1;
        $lastDay = (int) (new DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month)))->format('t');

        return $date->setDate($year, $month, min((int) $date->format('j'), $lastDay));
    }

    /**
     * Le Statut qui vient de passer dans le groupe « Terminé », s'il y en a un.
     *
     * @param  array<string, mixed>  $before
     * @param  array<string, mixed>  $after
     * @return array<string, mixed>|null
     */
    private static function completedStatus(Database $database, array $before, array $after): ?array
    {
        foreach ($database->schema ?? [] as $property) {
            if ($property['type'] !== 'status') {
                continue;
            }
            $group = fn (mixed $id) => collect($property['options'])->firstWhere('id', $id)['group'] ?? null;
            if ($group($after[$property['id']] ?? null) === 'complete' && $group($before[$property['id']] ?? null) !== 'complete') {
                return $property;
            }
        }

        return null;
    }

    /**
     * La première propriété Date de la ligne qui a une règle de répétition.
     *
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>|null
     */
    private static function repeatingDate(Database $database, array $values): ?array
    {
        foreach ($database->schema ?? [] as $property) {
            if ($property['type'] === 'date' && isset($values[$property['id']]['repeat'])) {
                return $property;
            }
        }

        return null;
    }

    private static function positionAfter(Page $row): string
    {
        $next = DB::table('pages')
            ->where('database_id', $row->database_id)
            ->whereNull('deleted_at')
            ->where('position', '>', $row->position)
            ->orderBy('position')
            ->value('position');

        return FractionalIndex::between($row->position, $next);
    }
}
