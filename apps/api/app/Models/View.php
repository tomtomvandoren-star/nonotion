<?php

namespace App\Models;

use App\Models\Scopes\VisibleToCurrentUser;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ScopedBy;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Une vue d'une base (spec 6.5) : une configuration (filtres, tris, regroupement, colonnes),
 * jamais une copie des données (P6).
 *
 * @property string $id
 * @property string $workspace_id
 * @property string $database_id
 * @property string $name
 * @property string $type
 * @property string $position
 * @property array<string, mixed> $config
 */
#[Fillable(['workspace_id', 'database_id', 'name', 'type', 'position', 'config'])]
#[ScopedBy([VisibleToCurrentUser::class])]
class View extends Model
{
    use HasUlids, SoftDeletes;

    protected function casts(): array
    {
        return ['config' => 'array'];
    }

    /** @return BelongsTo<Database, $this> */
    public function database(): BelongsTo
    {
        return $this->belongsTo(Database::class);
    }
}
