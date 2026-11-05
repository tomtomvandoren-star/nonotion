<?php

namespace App\Policies;

use App\Models\CalendarSource;
use App\Models\User;

/** Seul un membre du workspace voit, resynchronise, modifie ou supprime un agenda importé. */
class CalendarSourcePolicy
{
    public function update(User $user, CalendarSource $source): bool
    {
        return $user->belongsToWorkspace($source->workspace_id);
    }

    public function delete(User $user, CalendarSource $source): bool
    {
        return $user->belongsToWorkspace($source->workspace_id);
    }
}
