<?php

namespace App\Http\Requests\Pages;

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
        ];
    }
}
