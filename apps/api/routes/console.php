<?php

use App\Support\Heartbeat;
use Illuminate\Support\Facades\Schedule;

// Lancé par le Planificateur de tâches du Manager Infomaniak, qui appelle GET /api/cron
// (au plus toutes les 15 minutes, à des minutes quelconques). Chaque tâche doit donc :
// - tourner à chaque passage (everyMinute) et décider elle-même si elle a du travail ;
// - s'exécuter dans le processus : Schedule::call() ou Schedule::job(), jamais ->command().
// Le battement prouve que le planificateur tourne ; /api/health en affiche la date.
Schedule::call(fn () => Heartbeat::record(Heartbeat::CRON))
    ->everyMinute()
    ->name('heartbeat');
