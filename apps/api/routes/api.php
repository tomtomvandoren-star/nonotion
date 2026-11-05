<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CalendarSourceController;
use App\Http\Controllers\CronController;
use App\Http\Controllers\DatabaseController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\PageController;
use App\Http\Controllers\PropertyController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\TrashController;
use App\Http\Controllers\ViewController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class)->middleware('throttle:30,1');

// Appelée par le Planificateur de tâches du Manager Infomaniak (webcron).
Route::match(['get', 'post'], '/cron', CronController::class)->middleware('throttle:10,1');

Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:register');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:30,1');
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:10,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

// La sauvegarde automatique envoie au plus une requête par demi-seconde de frappe.
Route::middleware(['auth:sanctum', 'throttle:240,1'])->group(function () {
    Route::get('/workspaces/{workspace}/pages', [PageController::class, 'index']);
    Route::post('/workspaces/{workspace}/pages', [PageController::class, 'store']);
    Route::get('/workspaces/{workspace}/trash', [TrashController::class, 'index']);
    Route::get('/workspaces/{workspace}/search', SearchController::class);

    Route::get('/pages/{page}', [PageController::class, 'show']);
    Route::patch('/pages/{page}', [PageController::class, 'update']);
    Route::put('/pages/{page}/content', [PageController::class, 'updateContent']);
    Route::post('/pages/{page}/move', [PageController::class, 'move']);
    Route::post('/pages/{page}/duplicate', [PageController::class, 'duplicate']);
    Route::delete('/pages/{page}', [PageController::class, 'destroy']);

    Route::post('/pages/{page}/restore', [TrashController::class, 'restore'])->withTrashed();
    Route::delete('/pages/{page}/permanent', [TrashController::class, 'destroy'])->withTrashed();

    // Bases de données (spec 6.4 à 6.6) : les lignes sont des pages, modifiées par PATCH /pages/{page}.
    Route::post('/workspaces/{workspace}/databases', [DatabaseController::class, 'store']);
    Route::get('/databases/{database}', [DatabaseController::class, 'show']);
    Route::patch('/databases/{database}', [DatabaseController::class, 'update']);
    Route::post('/databases/{database}/rows', [DatabaseController::class, 'storeRow']);
    Route::post('/databases/{database}/properties', [PropertyController::class, 'store']);
    Route::patch('/databases/{database}/properties/{property}', [PropertyController::class, 'update']);
    Route::delete('/databases/{database}/properties/{property}', [PropertyController::class, 'destroy']);
    Route::post('/databases/{database}/views', [ViewController::class, 'store']);
    Route::patch('/views/{view}', [ViewController::class, 'update']);
    Route::post('/views/{view}/duplicate', [ViewController::class, 'duplicate']);
    Route::delete('/views/{view}', [ViewController::class, 'destroy']);

    Route::patch('/calendar-sources/{source}', [CalendarSourceController::class, 'update']);
    Route::delete('/calendar-sources/{source}', [CalendarSourceController::class, 'destroy']);
});

// Agendas par lien ICS (spec 6.9) : chaque appel télécharge un fichier distant, d'où une limite basse.
Route::middleware(['auth:sanctum', 'throttle:20,1'])->group(function () {
    Route::post('/calendar-sources/preview', [CalendarSourceController::class, 'preview']);
    Route::post('/calendar-sources', [CalendarSourceController::class, 'store']);
    Route::post('/calendar-sources/{source}/sync', [CalendarSourceController::class, 'sync']);
});
