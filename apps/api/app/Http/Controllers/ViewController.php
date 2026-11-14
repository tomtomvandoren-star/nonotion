<?php

namespace App\Http\Controllers;

use App\Http\Requests\Databases\StoreViewRequest;
use App\Http\Requests\Databases\UpdateViewRequest;
use App\Models\Database;
use App\Models\View;
use App\Support\ClientId;
use App\Support\Databases\Databases;
use App\Support\FractionalIndex;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/** Onglets de vues d'une base (spec 6.5) : une vue est une configuration, jamais une copie (P6). */
class ViewController extends Controller
{
    public function store(StoreViewRequest $request, Database $database): JsonResponse
    {
        Gate::authorize('update', $database);

        // Déjà reçue (le même envoi répété après une coupure) : la vue existe, rien de plus.
        $existing = ClientId::existing(View::class, $request->input('id'), $database->workspace_id);
        if ($existing !== null) {
            return response()->json(['data' => Databases::view($existing)]);
        }

        $view = new View([
            'workspace_id' => $database->workspace_id,
            'database_id' => $database->id,
            'name' => $request->string('name')->trim()->value() ?: 'Vue',
            'type' => $request->input('type'),
            'position' => self::positionAtEnd($database->id),
            'config' => $request->validated('config') ?? [],
        ]);
        if ($request->filled('id')) {
            $view->id = $request->input('id');
        }
        $view->save();

        return response()->json(['data' => Databases::view($view->refresh())], 201);
    }

    /** Nom, position ou configuration (envoyée en entier : filtres, tris, colonnes…). */
    public function update(UpdateViewRequest $request, View $view): JsonResponse
    {
        Gate::authorize('update', $view);

        $attributes = [];
        if ($request->has('name')) {
            $attributes['name'] = $request->string('name')->trim()->value() ?: $view->name;
        }
        if ($request->has('position')) {
            $attributes['position'] = $request->input('position');
        }
        if ($request->has('config')) {
            $attributes['config'] = $request->validated('config') ?? [];
        }
        $view->update($attributes);

        return response()->json(['data' => Databases::view($view)]);
    }

    public function duplicate(Request $request, View $view): JsonResponse
    {
        Gate::authorize('update', $view);

        // La copie peut avoir été faite hors ligne (spec 6.16) : son identifiant vient de l'appareil.
        $request->validate(['id' => ClientId::rules()]);
        $existing = ClientId::existing(View::class, $request->input('id'), $view->workspace_id);
        if ($existing !== null) {
            return response()->json(['data' => Databases::view($existing)]);
        }

        $next = DB::table('views')
            ->where('database_id', $view->database_id)
            ->whereNull('deleted_at')
            ->where('position', '>', $view->position)
            ->orderBy('position')
            ->value('position');

        $copy = $view->replicate();
        if ($request->filled('id')) {
            $copy->id = $request->input('id');
        }
        $copy->name = mb_substr($view->name.' (copie)', 0, 100);
        $copy->position = FractionalIndex::between($view->position, $next);
        $copy->save();

        return response()->json(['data' => Databases::view($copy->refresh())], 201);
    }

    public function destroy(View $view): JsonResponse
    {
        Gate::authorize('delete', $view);

        if (View::query()->where('database_id', $view->database_id)->count() <= 1) {
            throw ValidationException::withMessages(['view' => 'Une base garde au moins une vue.']);
        }
        $view->delete();

        return response()->json(['status' => 'ok']);
    }

    private static function positionAtEnd(string $databaseId): string
    {
        $last = DB::table('views')
            ->where('database_id', $databaseId)
            ->whereNull('deleted_at')
            ->orderByDesc('position')
            ->value('position');

        return FractionalIndex::between($last, null);
    }
}
