<?php

namespace App\Http\Controllers;

use App\Http\Requests\Databases\StoreDatabaseRequest;
use App\Http\Requests\Databases\StoreRowRequest;
use App\Http\Requests\Databases\UpdateDatabaseRequest;
use App\Models\Database;
use App\Models\Page;
use App\Models\Workspace;
use App\Support\Databases\Databases;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/**
 * Bases de données (spec 6.4) : création, lecture complète (schéma, vues, lignes) et nouvelles lignes.
 * Le filtrage, le tri et le regroupement se font côté client (spec 6.6, MVP).
 */
class DatabaseController extends Controller
{
    public function store(StoreDatabaseRequest $request, Workspace $workspace): JsonResponse
    {
        Gate::authorize('createPage', $workspace);

        $host = Page::query()->whereKey($request->string('page_id'))->where('workspace_id', $workspace->id)->first();
        if ($host === null) {
            throw ValidationException::withMessages(['page_id' => 'La page est introuvable.']);
        }

        [$database, $container] = Databases::create(
            $host,
            $request->boolean('full_page'),
            $request->input('title'),
            $request->input('template'),
        );

        return response()->json([
            'data' => Databases::detail($database),
            'page' => PageController::detail($container->refresh()),
        ], 201);
    }

    public function show(Database $database): JsonResponse
    {
        Gate::authorize('view', $database);

        return response()->json(['data' => Databases::detail($database)]);
    }

    public function update(UpdateDatabaseRequest $request, Database $database): JsonResponse
    {
        Gate::authorize('update', $database);

        $database->update(['title' => $request->input('title') ?? '']);

        return response()->json(['data' => ['id' => $database->id, 'title' => $database->title]]);
    }

    /** Une nouvelle ligne, avec les valeurs héritées de la vue (filtre actif, section…). */
    public function storeRow(StoreRowRequest $request, Database $database): JsonResponse
    {
        Gate::authorize('update', $database);

        $row = Databases::createRow($database, [
            'title' => $request->input('title'),
            'properties' => Databases::validateValues($database, $request->input('properties', [])),
            'position' => $request->input('position'),
        ]);

        return response()->json(['data' => Databases::row($row->refresh())], 201);
    }
}
