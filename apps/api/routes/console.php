<?php

use App\Support\Heartbeat;
use Illuminate\Support\Facades\Schedule;

// Lancé par la tâche cron du Manager Infomaniak (« php artisan schedule:run »).
// Le battement prouve que le cron tourne ; /api/health en affiche la date.
Schedule::call(fn () => Heartbeat::record(Heartbeat::CRON))
    ->everyMinute()
    ->name('heartbeat');
