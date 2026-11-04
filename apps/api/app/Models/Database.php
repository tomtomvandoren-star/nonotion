<?php

namespace App\Models;

use App\Models\Scopes\VisibleToCurrentUser;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ScopedBy;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Une base de données (spec 6.4) : un schéma de propriétés, des vues, et des lignes qui sont des
 * pages (pages.database_id). Elle vit dans une page (page_id), en ligne ou en pleine page.
 *
 * @property string $id
 * @property string $workspace_id
 * @property string $page_id
 * @property string $title
 * @property list<array<string, mixed>> $schema
 */
#[Fillable(['workspace_id', 'page_id', 'title', 'schema'])]
#[ScopedBy([VisibleToCurrentUser::class])]
class Database extends Model
{
    use HasUlids, SoftDeletes;

    protected function casts(): array
    {
        return ['schema' => 'array'];
    }

    /** @return BelongsTo<Page, $this> */
    public function page(): BelongsTo
    {
        return $this->belongsTo(Page::class);
    }

    /** @return HasMany<View, $this> */
    public function views(): HasMany
    {
        return $this->hasMany(View::class)->orderBy('position')->orderBy('id');
    }

    /** @return HasMany<Page, $this> */
    public function rows(): HasMany
    {
        return $this->hasMany(Page::class)->orderBy('position')->orderBy('id');
    }

    /** @return array<string, mixed>|null */
    public function property(string $id): ?array
    {
        foreach ($this->schema as $property) {
            if ($property['id'] === $id) {
                return $property;
            }
        }

        return null;
    }
}
