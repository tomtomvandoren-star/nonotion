<?php

namespace App\Models;

use App\Models\Scopes\VisibleToCurrentUser;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Attributes\ScopedBy;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Un rendez-vous pris par un lien de planification (spec 6.17). L'invité le replanifie ou l'annule
 * par un lien secret, dont seule l'empreinte est gardée ici (renouvelé à chaque usage).
 *
 * @property string $id
 * @property string $link_id
 * @property string $workspace_id
 * @property string $user_id
 * @property string|null $page_id
 * @property string $invitee_name
 * @property string $invitee_email
 * @property string $invitee_timezone
 * @property string|null $note
 * @property Carbon $start_at
 * @property Carbon $end_at
 * @property string $status confirmed | cancelled
 * @property int $sequence
 * @property string|null $cancel_reason
 * @property string|null $cancelled_by invitee | organizer
 */
#[Fillable([
    'link_id', 'workspace_id', 'user_id', 'page_id', 'invitee_name', 'invitee_email', 'invitee_timezone',
    'note', 'start_at', 'end_at', 'status', 'manage_token_hash', 'sequence', 'cancel_reason', 'cancelled_by',
])]
#[Hidden(['manage_token_hash'])]
#[ScopedBy([VisibleToCurrentUser::class])]
class Booking extends Model
{
    use HasUlids;

    protected function casts(): array
    {
        return [
            'start_at' => 'datetime',
            'end_at' => 'datetime',
            'sequence' => 'integer',
        ];
    }

    /** @return BelongsTo<SchedulingLink, $this> */
    public function link(): BelongsTo
    {
        return $this->belongsTo(SchedulingLink::class, 'link_id')->withTrashed()->withoutGlobalScopes();
    }

    /** @return BelongsTo<User, $this> */
    public function organizer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** Le jeton donné à l'invité ; seule son empreinte est gardée. */
    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }
}
