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
use Illuminate\Support\Carbon;

/**
 * Un lien de planification (spec 6.17) : sa page publique propose les créneaux libres de
 * l'organisateur, et chaque réservation devient un élément de son agenda.
 *
 * @property string $id
 * @property string $workspace_id
 * @property string $user_id
 * @property string $type one_off | recurring
 * @property string $slug
 * @property string $title
 * @property string|null $description
 * @property int $duration_minutes
 * @property int $slot_step_minutes
 * @property int $buffer_before_minutes
 * @property int $buffer_after_minutes
 * @property string $timezone
 * @property list<array<string, mixed>> $availability
 * @property string|null $target_database_id
 * @property bool $avoid_conflicts
 * @property bool $allow_multiple_bookings
 * @property bool $single_use
 * @property int $min_notice_minutes
 * @property int $max_advance_days
 * @property string|null $location
 * @property string|null $video_url
 * @property string|null $phone
 * @property Carbon|null $expires_at
 * @property string $status active | disabled | consumed
 */
#[Fillable([
    'workspace_id', 'user_id', 'type', 'slug', 'title', 'description', 'duration_minutes',
    'slot_step_minutes', 'buffer_before_minutes', 'buffer_after_minutes', 'timezone', 'availability',
    'target_database_id', 'avoid_conflicts', 'allow_multiple_bookings', 'single_use',
    'min_notice_minutes', 'max_advance_days', 'location', 'video_url', 'phone', 'expires_at', 'status',
])]
#[ScopedBy([VisibleToCurrentUser::class])]
class SchedulingLink extends Model
{
    use HasUlids, SoftDeletes;

    public const ONE_OFF = 'one_off';

    public const RECURRING = 'recurring';

    protected function casts(): array
    {
        return [
            'availability' => 'array',
            'avoid_conflicts' => 'boolean',
            'allow_multiple_bookings' => 'boolean',
            'single_use' => 'boolean',
            'expires_at' => 'datetime',
            'duration_minutes' => 'integer',
            'slot_step_minutes' => 'integer',
            'buffer_before_minutes' => 'integer',
            'buffer_after_minutes' => 'integer',
            'min_notice_minutes' => 'integer',
            'max_advance_days' => 'integer',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** @return HasMany<Booking, $this> */
    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class, 'link_id');
    }

    /** Pourquoi on ne peut plus réserver (null : réservable). */
    public function unavailableReason(): ?string
    {
        return match (true) {
            $this->trashed() => 'Ce lien de planification n’existe plus.',
            $this->status === 'disabled' => 'Ce lien de planification est désactivé.',
            $this->status === 'consumed' => 'Ce lien a déjà servi : il n’était valable que pour un rendez-vous.',
            $this->expires_at !== null && $this->expires_at->isPast() => 'Ce lien de planification a expiré.',
            default => null,
        };
    }
}
