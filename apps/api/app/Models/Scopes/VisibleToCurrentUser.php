<?php

namespace App\Models\Scopes;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;
use Illuminate\Support\Facades\Auth;

/**
 * Isolation des données (spec 1.3.9) : dès qu'un utilisateur est connecté, toute requête
 * sur le modèle est limitée à ses workspaces. Une donnée d'un autre utilisateur n'existe donc
 * pas pour lui (404), même si son identifiant est connu. Sans utilisateur (console, planificateur),
 * la portée ne s'applique pas.
 */
class VisibleToCurrentUser implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $user = Auth::user();
        if (! $user instanceof User) {
            return;
        }

        $column = $model->getTable() === 'workspaces' ? $model->getKeyName() : 'workspace_id';
        $builder->whereIn($model->qualifyColumn($column), $user->workspaceIds());
    }
}
