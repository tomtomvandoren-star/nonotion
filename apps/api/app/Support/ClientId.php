<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Validation\ValidationException;

/**
 * L'identifiant d'un objet créé hors ligne (spec 6.16) : l'application l'a choisi sur l'appareil
 * (un ULID), pour afficher l'objet avant même que le serveur ne le connaisse. Le même envoi, répété
 * après une coupure, ne crée jamais de doublon : on renvoie l'objet déjà créé.
 */
class ClientId
{
    /** Règle de validation du champ « id » des créations. */
    public static function rules(): array
    {
        return ['sometimes', 'nullable', 'string', 'regex:/^[0-9a-hjkmnp-tv-z]{26}$/'];
    }

    /**
     * L'objet déjà créé avec cet identifiant dans cet espace de travail, ou null s'il n'existe pas.
     * Un identifiant déjà pris ailleurs est refusé (jamais d'accès à l'objet d'un autre).
     *
     * @template T of Model
     *
     * @param  class-string<T>  $model
     * @return T|null
     */
    public static function existing(string $model, ?string $id, string $workspaceId): ?Model
    {
        if ($id === null || $id === '') {
            return null;
        }
        $query = $model::query()->withoutGlobalScopes();
        if (in_array(SoftDeletes::class, class_uses_recursive($model), true)) {
            $query->withTrashed();
        }
        $found = $query->find($id);
        if ($found === null) {
            return null;
        }
        if ($found->getAttribute('workspace_id') !== $workspaceId) {
            throw ValidationException::withMessages(['id' => 'Cet identifiant est déjà utilisé.']);
        }

        return $found;
    }
}
