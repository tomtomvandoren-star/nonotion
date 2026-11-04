<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CronController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\PageController;
use App\Http\Controllers\TrashController;
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

    Route::get('/pages/{page}', [PageController::class, 'show']);
    Route::patch('/pages/{page}', [PageController::class, 'update']);
    Route::put('/pages/{page}/content', [PageController::class, 'updateContent']);
    Route::post('/pages/{page}/move', [PageController::class, 'move']);
    Route::post('/pages/{page}/duplicate', [PageController::class, 'duplicate']);
    Route::delete('/pages/{page}', [PageController::class, 'destroy']);

    Route::post('/pages/{page}/restore', [TrashController::class, 'restore'])->withTrashed();
    Route::delete('/pages/{page}/permanent', [TrashController::class, 'destroy'])->withTrashed();
});
