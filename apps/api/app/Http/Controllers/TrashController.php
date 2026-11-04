<?php

namespace App\Http\Controllers;

use App\Models\Page;
use App\Models\Scopes\VisibleToCurrentUser;
use App\Models\Workspace;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/** Corbeille (spec 6.13) : restauration en un clic, purge définitive après 30 jours. */
class TrashController extends Controller
{
    private const LIMIT = 200;

    /**
     * Les pages supprimées « en tête » : une sous-page partie avec sa parente n'est pas listée
     * à part, elle reviendra avec elle.
     */
    public function index(Workspace $workspace): JsonResponse
    {
        Gate::authorize('view', $workspace);

        $trashed = Page::onlyTrashed()
            ->where('workspace_id', $workspace->id)
            ->whereNull('database_id')
            ->orderByDesc('deleted_at')
            ->limit(self::LIMIT)
            ->get(['id', 'parent_page_id', 'title', 'icon', 'deleted_at']);

        $deletedAt = $trashed->mapWithKeys(fn (Page $page) => [$page->id => $page->deleted_at?->getTimestamp()]);

        $roots = $trashed
            ->filter(fn (Page $page) => $page->parent_page_id === null
                || ($deletedAt[$page->parent_page_id] ?? null) !== $page->deleted_at?->getTimestamp())
            ->values()
            ->map(fn (Page $page) => [
                'id' => $page->id,
                'title' => $page->title,
                'icon' => $page->icon,
                'deleted_at' => $page->deleted_at?->toIso8601String(),
            ]);

        return response()->json(['data' => $roots]);
    }

    /** Restaure la page et les sous-pages supprimées en même temps qu'elle. */
    public function restore(Page $page): JsonResponse
    {
        Gate::authorize('restore', $page);
        abort_unless($page->trashed(), 422, 'Cette page n’est pas dans la corbeille.');

        DB::transaction(function () use ($page) {
            $deletedAt = $page->deleted_at;
            Page::onlyTrashed()
                ->whereIn('id', $page->descendantIds(withTrashed: true))
                ->where('deleted_at', $deletedAt)
                ->update(['deleted_at' => null]);

            // Si la page parente est encore à la corbeille, la page revient à la racine.
            $parentIsActive = $page->parent_page_id !== null
                && Page::query()->whereKey($page->parent_page_id)->exists();
            if (! $parentIsActive) {
                $page->parent_page_id = null;
                $page->position = Page::positionAtEnd($page->workspace_id, null);
            }
            $page->restore();
        });

        return response()->json(['data' => PageController::treeItem($page->refresh())]);
    }

    /** Suppression définitive depuis la corbeille ; les sous-pages partent avec (clé étrangère en cascade). */
    public function destroy(Page $page): JsonResponse
    {
        Gate::authorize('forceDelete', $page);
        abort_unless($page->trashed(), 422, 'Mettez d’abord la page à la corbeille.');

        $page->forceDelete();

        return response()->json(['status' => 'ok']);
    }

    /** Purge définitive des pages à la corbeille depuis plus de 30 jours (lancée par le planificateur). */
    public static function purgeExpired(): int
    {
        return Page::onlyTrashed()
            ->withoutGlobalScope(VisibleToCurrentUser::class)
            ->where('deleted_at', '<', now()->subDays(config('nonotion.trash_retention_days')))
            ->forceDelete();
    }
}
