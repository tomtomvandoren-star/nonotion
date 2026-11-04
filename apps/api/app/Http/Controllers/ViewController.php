<?php

namespace App\Http\Controllers;

use App\Http\Requests\Databases\StoreViewRequest;
use App\Http\Requests\Databases\UpdateViewRequest;
use App\Models\Database;
use App\Models\View;
use App\Support\Databases\Databases;
use App\Support\FractionalIndex;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/** Onglets de vues d'une base (spec 6.5) : une vue est une configuration, jamais une copie (P6). */
class ViewController extends Controller
{
    public function store(StoreViewRequest $request, Database $database): JsonResponse
    {
        Gate::authorize('update', $database);

        $view = View::create([
            'workspace_id' => $database->workspace_id,
            'database_id' => $database->id,
            'name' => $request->string('name')->trim()->value() ?: 'Vue',
            'type' => $request->input('type'),
            'position' => self::positionAtEnd($database->id),
            'config' => $request->validated('config') ?? [],
        ]);

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

    public function duplicate(View $view): JsonResponse
    {
        Gate::authorize('update', $view);

        $next = DB::table('views')
            ->where('database_id', $view->database_id)
            ->whereNull('deleted_at')
            ->where('position', '>', $view->position)
            ->orderBy('position')
            ->value('position');

        $copy = $view->replicate();
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
