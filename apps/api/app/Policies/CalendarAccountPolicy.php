<?php

namespace App\Policies;

use App\Models\CalendarAccount;
use App\Models\User;

class CalendarAccountPolicy
{
    public function update(User $user, CalendarAccount $account): bool
    {
        return $user->belongsToWorkspace($account->workspace_id);
    }

    public function delete(User $user, CalendarAccount $account): bool
    {
        return $user->belongsToWorkspace($account->workspace_id);
    }
}
