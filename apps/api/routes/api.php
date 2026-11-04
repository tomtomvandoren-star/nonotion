<?php

use App\Http\Controllers\CronController;
use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class)->middleware('throttle:30,1');

// Appelée par le Planificateur de tâches du Manager Infomaniak (webcron).
Route::match(['get', 'post'], '/cron', CronController::class)->middleware('throttle:10,1');
