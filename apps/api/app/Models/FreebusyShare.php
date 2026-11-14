<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * « Qui peut voir mes disponibilités » (spec 6.17, fonction A) : une adresse e-mail à qui
 * l'organisateur montre ses blocs « Occupé », sans titre ni détail. Par adresse, pour ne jamais
 * révéler si un compte existe.
 *
 * @property string $id
 * @property string $owner_id
 * @property string $viewer_email
 */
#[Fillable(['owner_id', 'viewer_email'])]
class FreebusyShare extends Model
{
    use HasUlids;

    /** @return BelongsTo<User, $this> */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }
}
