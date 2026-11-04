<?php

namespace App\Models;

use App\Models\Scopes\VisibleToCurrentUser;
use App\Support\FractionalIndex;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ScopedBy;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Une page : un document (content), placé dans l'arbre par parent_page_id + position.
 * Si database_id n'est pas null, c'est une ligne de base de données (phase 3).
 *
 * @property string $id
 * @property string $workspace_id
 * @property string|null $parent_page_id
 * @property string $title
 * @property string $position
 * @property int $version
 * @property Carbon|null $deleted_at
 */
#[Fillable(['workspace_id', 'parent_page_id', 'title', 'icon', 'cover_url', 'content', 'is_favorite', 'position'])]
#[ScopedBy([VisibleToCurrentUser::class])]
class Page extends Model
{
    use HasUlids, SoftDeletes;

    protected function casts(): array
    {
        return [
            'content' => 'array',
            'properties' => 'array',
            'is_favorite' => 'boolean',
            'version' => 'integer',
        ];
    }

    /** @return BelongsTo<Workspace, $this> */
    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    /**
     * Identifiants de toutes les pages sous celle-ci (sous-pages, sous-sous-pages…),
     * corbeille comprise ou non. Parcours en largeur : une requête par niveau.
     *
     * @return list<string>
     */
    public function descendantIds(bool $withTrashed = false): array
    {
        $ids = [];
        $level = [$this->id];
        while ($level !== []) {
            $query = DB::table('pages')->whereIn('parent_page_id', $level);
            if (! $withTrashed) {
                $query->whereNull('deleted_at');
            }
            $level = $query->pluck('id')->all();
            $ids = [...$ids, ...$level];
        }

        return $ids;
    }

    /** Vrai si $pageId est cette page ou l'une de ses ancêtres (remontée par les parents). */
    public static function isSelfOrAncestor(string $pageId, ?string $of): bool
    {
        $current = $of;
        for ($guard = 0; $current !== null && $guard < 1000; $guard++) {
            if ($current === $pageId) {
                return true;
            }
            $current = DB::table('pages')->where('id', $current)->value('parent_page_id');
        }

        return false;
    }

    /** Position qui place une page à la fin des sous-pages de $parentId. */
    public static function positionAtEnd(string $workspaceId, ?string $parentId): string
    {
        $last = DB::table('pages')
            ->where('workspace_id', $workspaceId)
            ->where('parent_page_id', $parentId)
            ->whereNull('database_id')
            ->whereNull('deleted_at')
            ->orderByDesc('position')
            ->value('position');

        return FractionalIndex::between($last, null);
    }

    /** Position juste après cette page parmi ses sœurs. */
    public function positionAfter(): string
    {
        $next = DB::table('pages')
            ->where('workspace_id', $this->workspace_id)
            ->where('parent_page_id', $this->parent_page_id)
            ->whereNull('database_id')
            ->whereNull('deleted_at')
            ->where('position', '>', $this->position)
            ->orderBy('position')
            ->value('position');

        return FractionalIndex::between($this->position, $next);
    }
}
