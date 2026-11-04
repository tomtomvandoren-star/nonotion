<?php

namespace App\Http\Controllers;

use App\Http\Requests\Pages\MovePageRequest;
use App\Http\Requests\Pages\StorePageRequest;
use App\Http\Requests\Pages\UpdatePageContentRequest;
use App\Http\Requests\Pages\UpdatePageRequest;
use App\Models\Page;
use App\Models\Workspace;
use App\Support\BlockText;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/**
 * Pages et arbre de la barre latérale (spec 6.1, 6.2).
 * Les lignes de bases de données (database_id non null) n'apparaissent pas dans l'arbre.
 */
class PageController extends Controller
{
    /** Taille maximale d'un document enregistré, en octets de JSON. */
    private const MAX_CONTENT_BYTES = 5_000_000;

    /** L'arbre complet du workspace (métadonnées seulement, sans le contenu des pages). */
    public function index(Workspace $workspace): JsonResponse
    {
        Gate::authorize('view', $workspace);

        $pages = Page::query()
            ->where('workspace_id', $workspace->id)
            ->whereNull('database_id')
            ->orderBy('position')
            ->orderBy('id')
            ->get();

        return response()->json(['data' => $pages->map(fn (Page $page) => self::treeItem($page))]);
    }

    public function store(StorePageRequest $request, Workspace $workspace): JsonResponse
    {
        Gate::authorize('createPage', $workspace);

        $parentId = $request->input('parent_page_id');
        if ($parentId !== null) {
            $this->findParent($workspace->id, $parentId);
        }

        $page = Page::create([
            'workspace_id' => $workspace->id,
            'parent_page_id' => $parentId,
            'title' => $request->input('title') ?? '',
            'icon' => $request->input('icon'),
            'position' => $request->input('position') ?? Page::positionAtEnd($workspace->id, $parentId),
        ]);

        return response()->json(['data' => self::detail($page->refresh())], 201);
    }

    public function show(Page $page): JsonResponse
    {
        Gate::authorize('view', $page);

        return response()->json(['data' => self::detail($page)]);
    }

    /** Titre, icône, couverture, favori. Ne touche pas au contenu ni à sa version. */
    public function update(UpdatePageRequest $request, Page $page): JsonResponse
    {
        Gate::authorize('update', $page);

        $attributes = $request->validated();
        if (array_key_exists('title', $attributes)) {
            $attributes['title'] = $attributes['title'] ?? '';
        }
        $page->update($attributes);

        return response()->json(['data' => self::treeItem($page)]);
    }

    /**
     * Enregistre le document de la page, si le client a lu la dernière version (spec 1.3.5).
     * Sinon 409 : la page a été modifiée sur un autre appareil entre-temps.
     */
    public function updateContent(UpdatePageContentRequest $request, Page $page): JsonResponse
    {
        Gate::authorize('update', $page);

        $content = $request->input('content');
        $json = $content === null ? null : json_encode($content, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        if ($json !== null && strlen($json) > self::MAX_CONTENT_BYTES) {
            throw ValidationException::withMessages(['content' => 'Cette page est trop volumineuse pour être enregistrée.']);
        }

        $updated = Page::query()
            ->whereKey($page->id)
            ->where('version', $request->integer('version'))
            ->update([
                'content' => $json,
                'search_text' => BlockText::extract($content),
                'version' => DB::raw('version + 1'),
                'updated_at' => now(),
            ]);

        if ($updated === 0) {
            return response()->json([
                'message' => 'Cette page a été modifiée ailleurs.',
                'version' => (int) Page::query()->whereKey($page->id)->value('version'),
            ], 409);
        }

        return response()->json(['data' => ['version' => $request->integer('version') + 1]]);
    }

    /**
     * Change le parent et la position en une seule requête. Refuse de placer une page
     * dans elle-même ou dans l'une de ses sous-pages, ce qui créerait une boucle.
     */
    public function move(MovePageRequest $request, Page $page): JsonResponse
    {
        Gate::authorize('update', $page);

        $parentId = $request->input('parent_page_id');
        if ($parentId !== null) {
            $this->findParent($page->workspace_id, $parentId);
            if (Page::isSelfOrAncestor($page->id, $parentId)) {
                throw ValidationException::withMessages([
                    'parent_page_id' => 'Impossible de déplacer une page dans elle-même ou dans l’une de ses sous-pages.',
                ]);
            }
        }

        $page->update(['parent_page_id' => $parentId, 'position' => $request->input('position')]);

        return response()->json(['data' => self::treeItem($page)]);
    }

    /** Copie la page et toutes ses sous-pages, juste après l'original. */
    public function duplicate(Page $page): JsonResponse
    {
        Gate::authorize('update', $page);

        $copy = DB::transaction(function () use ($page) {
            // replicate() copie toutes les colonnes (contenu, texte de recherche…) sauf l'identifiant.
            $root = $page->replicate(['version']);
            $root->title = trim($page->title.' (copie)');
            $root->is_favorite = false;
            $root->position = $page->positionAfter();
            $root->save();

            $copies = [$page->id => $root->id];
            $level = [$page->id];
            while ($level !== []) {
                $children = Page::query()->whereIn('parent_page_id', $level)->whereNull('database_id')->get();
                foreach ($children as $child) {
                    $clone = $child->replicate(['version']);
                    $clone->parent_page_id = $copies[$child->parent_page_id];
                    $clone->is_favorite = false;
                    $clone->save();
                    $copies[$child->id] = $clone->id;
                }
                $level = $children->pluck('id')->all();
            }

            return $root;
        });

        return response()->json(['data' => self::detail($copy->refresh())], 201);
    }

    /** Met la page et ses sous-pages à la corbeille, avec la même date (pour les restaurer ensemble). */
    public function destroy(Page $page): JsonResponse
    {
        Gate::authorize('delete', $page);

        Page::query()
            ->whereIn('id', [$page->id, ...$page->descendantIds()])
            ->update(['deleted_at' => now()]);

        return response()->json(['status' => 'ok']);
    }

    private function findParent(string $workspaceId, string $parentId): Page
    {
        $parent = Page::query()
            ->whereKey($parentId)
            ->where('workspace_id', $workspaceId)
            ->whereNull('database_id')
            ->first();

        if ($parent === null) {
            throw ValidationException::withMessages(['parent_page_id' => 'La page parente est introuvable.']);
        }

        return $parent;
    }

    /** @return array<string, mixed> */
    public static function treeItem(Page $page): array
    {
        return [
            'id' => $page->id,
            'parent_page_id' => $page->parent_page_id,
            'title' => $page->title,
            'icon' => $page->icon,
            'is_favorite' => $page->is_favorite,
            'position' => $page->position,
            'updated_at' => $page->updated_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    public static function detail(Page $page): array
    {
        return [
            ...self::treeItem($page),
            'workspace_id' => $page->workspace_id,
            'cover_url' => $page->cover_url,
            'content' => $page->content,
            'version' => $page->version,
            'created_at' => $page->created_at?->toIso8601String(),
        ];
    }
}
