<?php

namespace App\Support;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Trace le dernier passage d'un composant ('web', 'cron') dans la table health_checks.
 * Sert à prouver, sur l'hébergement, que la base accepte les écritures et que le cron tourne.
 */
class Heartbeat
{
    public const WEB = 'web';

    public const CRON = 'cron';

    public static function record(string $name): Carbon
    {
        $now = Carbon::now()->startOfSecond();

        DB::table('health_checks')->upsert(
            [['name' => $name, 'checked_at' => $now]],
            ['name'],
            ['checked_at'],
        );

        return $now;
    }

    public static function lastSeen(string $name): ?Carbon
    {
        $value = DB::table('health_checks')->where('name', $name)->value('checked_at');

        return $value === null ? null : Carbon::parse($value);
    }
}
