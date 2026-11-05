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
use Illuminate\Support\Facades\Crypt;

/**
 * Un agenda importé par lien ICS (spec 6.9). Le lien est un secret : chiffré (Crypt, APP_KEY),
 * jamais renvoyé au client ni écrit dans les journaux ; seul son domaine (url_host) s'affiche.
 *
 * @property string $id
 * @property string $workspace_id
 * @property string $database_id
 * @property string $name
 * @property string $color
 * @property string $url_host
 * @property string $url_hash
 * @property string $mode subscription | one_shot
 * @property array{date: string, location?: string|null, url?: string|null} $property_map
 * @property string|null $time_zone
 * @property string|null $etag
 * @property string|null $last_modified
 * @property Carbon|null $last_sync_at
 * @property Carbon|null $next_sync_at
 * @property int $failure_count
 * @property string $status pending | ok | error
 * @property string|null $error_message
 * @property int $events_count
 */
#[Fillable(['workspace_id', 'database_id', 'name', 'color', 'mode', 'property_map', 'time_zone'])]
#[Hidden(['url_encrypted', 'url_hash', 'etag', 'last_modified'])]
#[ScopedBy([VisibleToCurrentUser::class])]
class CalendarSource extends Model
{
    use HasUlids;

    public const SUBSCRIPTION = 'subscription';

    public const ONE_SHOT = 'one_shot';

    protected function casts(): array
    {
        return [
            'property_map' => 'array',
            'last_sync_at' => 'datetime',
            'next_sync_at' => 'datetime',
            'failure_count' => 'integer',
            'events_count' => 'integer',
        ];
    }

    /** @return BelongsTo<Database, $this> */
    public function database(): BelongsTo
    {
        return $this->belongsTo(Database::class);
    }

    /** Le lien en clair : uniquement pour le télécharger, jamais pour l'afficher ou le journaliser. */
    public function url(): string
    {
        return Crypt::decryptString($this->getAttribute('url_encrypted'));
    }

    public function setUrl(string $url): void
    {
        $this->forceFill([
            'url_encrypted' => Crypt::encryptString($url),
            'url_host' => (string) parse_url($url, PHP_URL_HOST),
            'url_hash' => self::hashUrl($url),
        ]);
    }

    /** Empreinte du lien (HMAC avec APP_KEY) : retrouve un doublon sans rien déchiffrer. */
    public static function hashUrl(string $url): string
    {
        return hash_hmac('sha256', $url, (string) config('app.key'));
    }
}
