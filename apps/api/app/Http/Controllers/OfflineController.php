<?php

namespace App\Http\Controllers;

use App\Models\CalendarSource;
use App\Models\Database;
use App\Models\Page;
use App\Models\View;
use App\Models\Workspace;
use App\Support\Databases\Databases;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;

/**
 * La copie de l'espace de travail des applications natives, pour travailler hors ligne (spec 6.16).
 * Un seul appel, incrémental : les pages et les bases modifiées depuis la dernière fois (`since`),
 * et la liste de celles qui existent encore (l'application oublie les autres). Sans `since`, tout.
 */
class OfflineController extends Controller
{
    public function show(Request $request, Workspace $workspace): JsonResponse
    {
        Gate::authorize('view', $workspace);
        $request->validate(['since' => ['sometimes', 'nullable', 'date']]);

        $now = now();
        // Une seconde de recouvrement : une modification faite pendant l'appel précédent n'échappe pas.
        $since = $request->filled('since') ? Carbon::parse($request->input('since'))->subSecond() : null;
        $changedSince = fn ($query) => $since === null ? $query : $query->where('updated_at', '>=', $since);

        $pages = $changedSince(Page::query()->where('workspace_id', $workspace->id))
            ->get()
            ->map(fn (Page $page) => PageController::detail($page))
            ->all();

        $databaseIds = Database::query()->where('workspace_id', $workspace->id)->pluck('id');
        if ($since !== null) {
            // Une base change avec son schéma, ses vues, ses lignes (même mises à la corbeille) et ses agendas.
            $touched = collect()
                ->merge($changedSince(Database::query()->where('workspace_id', $workspace->id))->pluck('id'))
                ->merge($changedSince(View::query()->withTrashed()->where('workspace_id', $workspace->id))->pluck('database_id'))
                ->merge($changedSince(Page::query()->withTrashed()->where('workspace_id', $workspace->id)->whereNotNull('database_id'))->pluck('database_id'))
                ->merge($changedSince(CalendarSource::query()->where('workspace_id', $workspace->id))->pluck('database_id'))
                ->unique();
            $changedDatabases = $databaseIds->intersect($touched);
        } else {
            $changedDatabases = $databaseIds;
        }
        $databases = Database::query()->whereIn('id', $changedDatabases)->get()
            ->map(fn (Database $database) => Databases::detail($database))
            ->all();

        return response()->json(['data' => [
            'pages' => $pages,
            'databases' => $databases,
            'page_ids' => Page::query()->where('workspace_id', $workspace->id)->pluck('id')->all(),
            'database_ids' => $databaseIds->values()->all(),
            // Petits, et lus en entier : l'Agenda et la corbeille s'ouvrent aussi hors ligne.
            'agenda' => AgendaController::present($workspace),
            'trash' => TrashController::items($workspace),
            'server_time' => $now->toIso8601String(),
        ]]);
    }
}
