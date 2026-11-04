<?php

namespace App\Policies;

use App\Models\Page;
use App\Models\User;

/**
 * Deuxième barrière de l'isolation, après la portée globale VisibleToCurrentUser :
 * seul un membre du workspace de la page peut la lire ou la modifier.
 */
class PagePolicy
{
    public function view(User $user, Page $page): bool
    {
        return $user->belongsToWorkspace($page->workspace_id);
    }

    public function update(User $user, Page $page): bool
    {
        return $user->belongsToWorkspace($page->workspace_id);
    }

    public function delete(User $user, Page $page): bool
    {
        return $user->belongsToWorkspace($page->workspace_id);
    }

    public function restore(User $user, Page $page): bool
    {
        return $user->belongsToWorkspace($page->workspace_id);
    }

    public function forceDelete(User $user, Page $page): bool
    {
        return $user->belongsToWorkspace($page->workspace_id);
    }
}
