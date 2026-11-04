<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

/**
 * GET /api/cron : lance « schedule:run » dans la requête.
 * Remplace la tâche cron en ligne de commande, que l'hébergement mutualisé n'autorise pas.
 * Les tâches planifiées s'exécutent donc dans ce processus : uniquement Schedule::call()
 * ou Schedule::job(), jamais ->command() (qui lancerait un processus PHP en ligne de commande).
 */
class CronController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $password = (string) config('nonotion.cron.password');
        abort_if($password === '', 404);

        $userMatches = hash_equals((string) config('nonotion.cron.user'), (string) $request->getUser());
        $passwordMatches = hash_equals($password, (string) $request->getPassword());

        if (! $userMatches || ! $passwordMatches) {
            return response()->json(
                ['message' => 'Unauthenticated.'],
                401,
                ['WWW-Authenticate' => 'Basic realm="Nonotion cron"'],
            );
        }

        Artisan::call('schedule:run');

        return response()->json([
            'status' => 'ok',
            'ran_at' => now()->toIso8601String(),
            'output' => trim(Artisan::output()),
        ]);
    }
}
