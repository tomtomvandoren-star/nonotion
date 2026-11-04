<?php

namespace App\Policies;

use App\Models\Database;
use App\Models\User;

/**
 * Deuxième barrière de l'isolation, après la portée globale VisibleToCurrentUser :
 * seul un membre du workspace peut lire ou modifier cette donnée.
 */
class DatabasePolicy
{
    public function view(User $user, Database $model): bool
    {
        return $user->belongsToWorkspace($model->workspace_id);
    }

    public function update(User $user, Database $model): bool
    {
        return $user->belongsToWorkspace($model->workspace_id);
    }

    public function delete(User $user, Database $model): bool
    {
        return $user->belongsToWorkspace($model->workspace_id);
    }
}
