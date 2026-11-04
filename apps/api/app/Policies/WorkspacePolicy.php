<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Workspace;

class WorkspacePolicy
{
    public function view(User $user, Workspace $workspace): bool
    {
        return $user->belongsToWorkspace($workspace->id);
    }

    public function createPage(User $user, Workspace $workspace): bool
    {
        return $user->belongsToWorkspace($workspace->id);
    }
}
