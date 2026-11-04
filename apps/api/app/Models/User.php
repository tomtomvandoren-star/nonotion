<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasUlids, Notifiable;

    /** @var list<string>|null Identifiants des workspaces de l'utilisateur, mémorisés pour la requête. */
    private ?array $workspaceIdsCache = null;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    /** @return BelongsToMany<Workspace, $this> */
    public function workspaces(): BelongsToMany
    {
        return $this->belongsToMany(Workspace::class, 'workspace_members')
            ->withPivot('role')
            ->withTimestamps();
    }

    /**
     * Workspaces auxquels l'utilisateur a accès. Lu directement dans workspace_members
     * (sans passer par les portées globales) : c'est la source de l'isolation des données.
     *
     * @return list<string>
     */
    public function workspaceIds(): array
    {
        return $this->workspaceIdsCache ??= DB::table('workspace_members')
            ->where('user_id', $this->getKey())
            ->pluck('workspace_id')
            ->all();
    }

    public function belongsToWorkspace(string $workspaceId): bool
    {
        return in_array($workspaceId, $this->workspaceIds(), true);
    }

    public function forgetWorkspaceIds(): void
    {
        $this->workspaceIdsCache = null;
    }
}
