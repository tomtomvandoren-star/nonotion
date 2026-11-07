<?php

use App\Http\Controllers\TrashController;
use App\Support\Calendars\CalendarImporter;
use App\Support\Calendars\CalendarSync;
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

// Corbeille : purge définitive après 30 jours (une seule requête, rien à faire la plupart du temps).
Schedule::call(fn () => TrashController::purgeExpired())
    ->everyMinute()
    ->name('purge-trash');

// Agendas en abonnement (spec 6.9) : ceux dont la synchronisation est due (toutes les 30 minutes,
// plus espacée après une erreur), quelques-uns par passage pour rester sous la limite de durée.
Schedule::call(fn () => CalendarImporter::syncDue())
    ->everyMinute()
    ->name('sync-calendars');

// Agendas Google et iCloud (spec 6.15) : toutes les 15 minutes, dans les deux sens (ce qui n'a pas
// pu partir chez le fournisseur repart ici).
Schedule::call(fn () => CalendarSync::syncDue())
    ->everyMinute()
    ->name('sync-connected-calendars');
