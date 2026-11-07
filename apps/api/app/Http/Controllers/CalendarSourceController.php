<?php

namespace App\Http\Controllers;

use App\Http\Requests\Calendars\PreviewCalendarRequest;
use App\Http\Requests\Calendars\StoreCalendarRequest;
use App\Http\Requests\Calendars\UpdateCalendarRequest;
use App\Models\CalendarSource;
use App\Models\Database;
use App\Models\Page;
use App\Models\Workspace;
use App\Support\Calendars\CalendarImporter;
use App\Support\Calendars\FetchFailed;
use App\Support\Calendars\SafeFetcher;
use App\Support\Databases\Databases;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/**
 * Agendas importés par lien ICS (spec 6.9) : aperçu, import, resynchronisation, réglages,
 * suppression. Le lien n'est jamais renvoyé au client : seulement son domaine.
 */
class CalendarSourceController extends Controller
{
    public function __construct(private CalendarImporter $importer) {}

    public function preview(PreviewCalendarRequest $request): JsonResponse
    {
        $workspace = Workspace::query()->findOrFail($request->string('workspace_id'));
        Gate::authorize('createPage', $workspace);
        $url = $this->normalized($request->string('url'));

        try {
            $preview = $this->importer->preview($url, $request->input('time_zone'));
        } catch (FetchFailed $e) {
            throw ValidationException::withMessages(['url' => $e->getMessage()]);
        }

        return response()->json(['data' => [
            ...$preview,
            // Le même lien déjà importé : on propose de mettre l'existant à jour.
            'duplicate' => $this->duplicate($workspace->id, $url),
        ]]);
    }

    public function store(StoreCalendarRequest $request): JsonResponse
    {
        $database = null;
        $host = null;
        if ($request->filled('database_id')) {
            $database = Database::query()->findOrFail($request->string('database_id'));
            Gate::authorize('update', $database);
        } elseif ($request->filled('page_id')) {
            $host = Page::query()->whereNull('database_id')->findOrFail($request->string('page_id'));
            Gate::authorize('update', $host);
        } else {
            $host = Workspace::query()->findOrFail($request->string('workspace_id'));
            Gate::authorize('createPage', $host);
        }
        $workspaceId = $database->workspace_id ?? ($host instanceof Workspace ? $host->id : $host->workspace_id);
        $url = $this->normalized($request->string('url'));

        $existing = $this->duplicate($workspaceId, $url);
        if ($existing !== null) {
            return response()->json([
                'message' => "Cet agenda est déjà importé (« {$existing['name']} ») : resynchronisez-le plutôt.",
                'existing' => $existing,
            ], 409);
        }

        try {
            $result = $this->importer->create([
                'url' => $url,
                'name' => trim($request->string('name')),
                'color' => (string) $request->string('color'),
                'mode' => (string) $request->string('mode'),
                'time_zone' => $request->input('time_zone'),
            ], $database, $host);
        } catch (FetchFailed $e) {
            throw ValidationException::withMessages(['url' => $e->getMessage()]);
        }

        return response()->json([
            'data' => self::present($result['source']),
            'imported' => $result['created'],
            'database' => Databases::detail($result['database']),
            'page' => $result['page'] === null ? null : PageController::detail($result['page']->refresh()),
        ], 201);
    }

    public function sync(CalendarSource $source): JsonResponse
    {
        Gate::authorize('update', $source);

        try {
            $result = $this->importer->sync($source, force: true);
        } catch (FetchFailed $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'data' => self::present($source->refresh()),
            ], 422);
        }

        return response()->json([
            'data' => self::present($source->refresh()),
            'result' => $result,
            'database' => Databases::detail(Database::query()->findOrFail($source->database_id)),
        ]);
    }

    public function update(UpdateCalendarRequest $request, CalendarSource $source): JsonResponse
    {
        Gate::authorize('update', $source);
        $source->update($request->validated());

        return response()->json(['data' => self::present($source)]);
    }

    /** L'agenda disparaît ; ses événements vont à la corbeille. */
    public function destroy(CalendarSource $source): JsonResponse
    {
        Gate::authorize('delete', $source);

        return response()->json(['data' => ['moved_to_trash' => $this->importer->remove($source)]]);
    }

    /** @return array<string, mixed> */
    public static function present(CalendarSource $source): array
    {
        return [
            'id' => $source->id,
            'database_id' => $source->database_id,
            // ics (lien, lecture seule) | google | icloud (compte connecté, spec 6.15).
            'kind' => $source->kind,
            'account_id' => $source->account_id,
            'writable' => $source->writable,
            'name' => $source->name,
            'color' => $source->color,
            'url_host' => $source->url_host,
            'mode' => $source->mode,
            'status' => $source->status,
            'error_message' => $source->error_message,
            'last_sync_at' => $source->last_sync_at?->toIso8601String(),
            'events_count' => $source->events_count,
            'property_map' => (object) ($source->property_map ?? []),
        ];
    }

    private function normalized(string $url): string
    {
        try {
            return SafeFetcher::normalize($url);
        } catch (FetchFailed $e) {
            throw ValidationException::withMessages(['url' => $e->getMessage()]);
        }
    }

    /** @return array{id: string, name: string, database_id: string}|null */
    private function duplicate(string $workspaceId, string $url): ?array
    {
        $source = CalendarSource::query()
            ->where('workspace_id', $workspaceId)
            ->where('url_hash', CalendarSource::hashUrl($url))
            ->first();

        return $source === null ? null : ['id' => $source->id, 'name' => $source->name, 'database_id' => $source->database_id];
    }
}
