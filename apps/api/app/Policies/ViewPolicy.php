<?php

namespace App\Policies;

use App\Models\User;
use App\Models\View;

/**
 * Deuxième barrière de l'isolation, après la portée globale VisibleToCurrentUser :
 * seul un membre du workspace peut lire ou modifier cette donnée.
 */
class ViewPolicy
{
    public function view(User $user, View $model): bool
    {
        return $user->belongsToWorkspace($model->workspace_id);
    }

    public function update(User $user, View $model): bool
    {
        return $user->belongsToWorkspace($model->workspace_id);
    }

    public function delete(User $user, View $model): bool
    {
        return $user->belongsToWorkspace($model->workspace_id);
    }
}
