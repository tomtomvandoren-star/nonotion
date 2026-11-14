<?php

namespace App\Support\Scheduling;

/**
 * Arithmétique d'intervalles de temps [début, fin[ en secondes UTC (spec 6.17, 5.1) : réunir,
 * soustraire, et vérifier qu'un créneau tient dans une plage libre.
 */
class Intervals
{
    /**
     * Trie et fusionne les intervalles qui se chevauchent ou se touchent ; ignore les vides.
     *
     * @param  list<array{0: int, 1: int}>  $intervals
     * @return list<array{0: int, 1: int}>
     */
    public static function merge(array $intervals): array
    {
        $intervals = array_values(array_filter($intervals, fn (array $i) => $i[1] > $i[0]));
        usort($intervals, fn (array $a, array $b) => $a[0] <=> $b[0] ?: $a[1] <=> $b[1]);
        $merged = [];
        foreach ($intervals as [$start, $end]) {
            $last = array_key_last($merged);
            if ($last !== null && $start <= $merged[$last][1]) {
                $merged[$last][1] = max($merged[$last][1], $end);
            } else {
                $merged[] = [$start, $end];
            }
        }

        return $merged;
    }

    /**
     * Ce qui reste de `$free` une fois retiré tout ce qui est dans `$busy`.
     *
     * @param  list<array{0: int, 1: int}>  $free
     * @param  list<array{0: int, 1: int}>  $busy
     * @return list<array{0: int, 1: int}>
     */
    public static function subtract(array $free, array $busy): array
    {
        $busy = self::merge($busy);
        $result = [];
        foreach (self::merge($free) as [$start, $end]) {
            $cursor = $start;
            foreach ($busy as [$busyStart, $busyEnd]) {
                if ($busyEnd <= $cursor || $busyStart >= $end) {
                    continue;
                }
                if ($busyStart > $cursor) {
                    $result[] = [$cursor, $busyStart];
                }
                $cursor = max($cursor, $busyEnd);
                if ($cursor >= $end) {
                    break;
                }
            }
            if ($cursor < $end) {
                $result[] = [$cursor, $end];
            }
        }

        return $result;
    }

    /**
     * Le créneau [start, end[ tient-il entièrement dans l'une des plages ?
     *
     * @param  list<array{0: int, 1: int}>  $intervals
     */
    public static function contains(array $intervals, int $start, int $end): bool
    {
        foreach ($intervals as [$from, $to]) {
            if ($from <= $start && $end <= $to) {
                return true;
            }
        }

        return false;
    }
}
