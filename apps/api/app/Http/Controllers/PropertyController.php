<?php

namespace App\Http\Controllers;

use App\Http\Requests\Databases\PropertyRequest;
use App\Models\Database;
use App\Models\Page;
use App\Models\View;
use App\Support\Databases\Databases;
use App\Support\Databases\PropertySchema;
use App\Support\Databases\PropertyValue;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/**
 * Propriétés d'une base (spec 6.4, 6.10) : ajouter, renommer, changer de type ou d'options, supprimer.
 * Ajouter une propriété ne touche pas aux lignes : elles affichent simplement une valeur vide.
 * Changer de type convertit les valeurs qui ont un sens dans le nouveau type.
 */
class PropertyController extends Controller
{
    public function store(PropertyRequest $request, Database $database): JsonResponse
    {
        Gate::authorize('update', $database);

        $property = PropertySchema::normalize($request->input('property'));
        if ($property['type'] === 'title') {
            throw ValidationException::withMessages(['property' => 'Une base n’a qu’un Titre.']);
        }

        DB::transaction(function () use ($database, $property) {
            $database = Database::query()->lockForUpdate()->findOrFail($database->id);
            if ($database->property($property['id']) !== null) {
                throw ValidationException::withMessages(['property' => 'Cette propriété existe déjà.']);
            }
            if (count($database->schema) >= 100) {
                throw ValidationException::withMessages(['property' => 'Une base compte au plus 100 propriétés.']);
            }
            Databases::appendProperty($database, $property);
        });

        return response()->json(['data' => Databases::detail($database->refresh())], 201);
    }

    public function update(PropertyRequest $request, Database $database, string $property): JsonResponse
    {
        Gate::authorize('update', $database);

        $next = PropertySchema::normalize([...$request->input('property'), 'id' => $property]);

        DB::transaction(function () use ($database, $property, $next) {
            $database = Database::query()->lockForUpdate()->findOrFail($database->id);
            $current = $database->property($property) ?? abort(404);
            if (($current['type'] === 'title') !== ($next['type'] === 'title')) {
                throw ValidationException::withMessages(['property' => 'Le Titre reste un Titre, et une base n’en a qu’un.']);
            }

            $rows = Page::query()->where('database_id', $database->id)->get();
            $changesValues = $current['type'] !== $next['type'] || ($current['options'] ?? []) !== ($next['options'] ?? []);
            if ($changesValues && $next['type'] !== 'title') {
                // Une propriété qui devient une sélection reprend les textes existants comme options.
                if (! in_array($current['type'], ['select', 'multi_select', 'status'], true)) {
                    $texts = $rows->map(fn (Page $row) => PropertyValue::asText($current, $row->properties[$property] ?? null))->all();
                    $next = PropertySchema::withOptionsFor($next, $texts);
                }
                foreach ($rows as $row) {
                    $values = $row->properties ?? [];
                    if (array_key_exists($property, $values)) {
                        $values[$property] = PropertyValue::convert($current, $next, $values[$property]);
                        $row->forceFill(['properties' => $values])->saveQuietly();
                    }
                }
            }

            $schema = array_map(fn (array $item) => $item['id'] === $property ? $next : $item, $database->schema);
            $database->update(['schema' => $schema]);
        });

        return response()->json(['data' => Databases::detail($database->refresh())]);
    }

    public function destroy(Database $database, string $property): JsonResponse
    {
        Gate::authorize('update', $database);

        DB::transaction(function () use ($database, $property) {
            $database = Database::query()->lockForUpdate()->findOrFail($database->id);
            $current = $database->property($property) ?? abort(404);
            if ($current['type'] === 'title') {
                throw ValidationException::withMessages(['property' => 'Le Titre ne peut pas être supprimé.']);
            }

            $database->update(['schema' => array_values(array_filter($database->schema, fn (array $item) => $item['id'] !== $property))]);
            foreach (Page::query()->withTrashed()->where('database_id', $database->id)->get() as $row) {
                $values = $row->properties ?? [];
                if (array_key_exists($property, $values)) {
                    unset($values[$property]);
                    $row->forceFill(['properties' => $values])->saveQuietly();
                }
            }
            foreach (View::query()->where('database_id', $database->id)->get() as $view) {
                $view->update(['config' => Databases::configWithout($view->config ?? [], $property)]);
            }
        });

        return response()->json(['data' => Databases::detail($database->refresh())]);
    }
}
