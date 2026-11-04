<?php

namespace App\Http\Controllers;

use App\Support\Heartbeat;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * GET /api/health : écrit puis relit une ligne en base (spec 1.8, phase 0).
 * Le détail des erreurs part dans les logs, jamais dans la réponse publique.
 */
class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        try {
            $written = Heartbeat::record(Heartbeat::WEB);
            $read = Heartbeat::lastSeen(Heartbeat::WEB);
            $cron = Heartbeat::lastSeen(Heartbeat::CRON);
        } catch (Throwable $e) {
            Log::error('Health check: base de données injoignable', ['exception' => $e::class]);

            return response()->json(['status' => 'error', 'database' => 'unreachable'], 503);
        }

        if ($read === null || ! $read->equalTo($written)) {
            return response()->json(['status' => 'error', 'database' => 'read_mismatch'], 503);
        }

        return response()->json([
            'status' => 'ok',
            'database' => 'ok',
            'checked_at' => $written->toIso8601String(),
            'cron_last_run_at' => $cron?->toIso8601String(),
        ]);
    }
}
