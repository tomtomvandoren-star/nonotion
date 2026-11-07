<?php

namespace App\Models;

use App\Models\Scopes\VisibleToCurrentUser;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Attributes\ScopedBy;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;

/**
 * Un compte Google ou iCloud connecté (spec 6.15). Ses identifiants sont des secrets : chiffrés
 * (Crypt, APP_KEY), jamais renvoyés au client ni écrits dans les journaux.
 *
 * Google : {"refresh_token", "access_token", "expires_at"} ; iCloud : {"username", "password",
 * "home"} (le mot de passe pour application et l'adresse de ses agendas).
 *
 * @property string $id
 * @property string $workspace_id
 * @property string $provider google | icloud
 * @property string $account_email
 * @property string $status ok | error
 * @property string|null $error_message
 * @property Carbon|null $last_sync_at
 */
#[Fillable(['workspace_id', 'provider', 'account_email'])]
#[Hidden(['credentials_encrypted'])]
#[ScopedBy([VisibleToCurrentUser::class])]
class CalendarAccount extends Model
{
    use HasUlids;

    public const GOOGLE = 'google';

    public const ICLOUD = 'icloud';

    protected function casts(): array
    {
        return ['last_sync_at' => 'datetime'];
    }

    /** @return HasMany<CalendarSource, $this> */
    public function sources(): HasMany
    {
        return $this->hasMany(CalendarSource::class, 'account_id');
    }

    /** @return array<string, mixed> */
    public function credentials(): array
    {
        return json_decode(Crypt::decryptString($this->getAttribute('credentials_encrypted')), true) ?? [];
    }

    /** @param  array<string, mixed>  $credentials */
    public function setCredentials(array $credentials): void
    {
        $this->forceFill(['credentials_encrypted' => Crypt::encryptString(json_encode($credentials))]);
    }
}
