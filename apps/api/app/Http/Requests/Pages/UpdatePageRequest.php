<?php

namespace App\Http\Requests\Pages;

use App\Rules\FractionalKey;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePageRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'nullable', 'string', 'max:255'],
            'icon' => ['sometimes', 'nullable', 'string', 'max:64'],
            // Couverture prédéfinie (« preset:sauge ») ou image en ligne (https uniquement).
            'cover_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'regex:/^(preset:[a-z0-9-]{1,32}|https:\/\/\S+)$/'],
            'is_favorite' => ['sometimes', 'boolean'],
            // Ligne de base : valeurs de propriétés, vérifiées contre le schéma (Databases::validateValues).
            'properties' => ['sometimes', 'array'],
            // Ligne de base : sa place dans la base (glisser une carte du Board, spec 6.11).
            'position' => ['sometimes', new FractionalKey],
        ];
    }
}
