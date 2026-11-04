<?php

namespace App\Http\Requests\Pages;

use App\Rules\FractionalKey;
use Illuminate\Foundation\Http\FormRequest;

class MovePageRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // null = à la racine de l'arbre.
            'parent_page_id' => ['present', 'nullable', 'ulid'],
            'position' => ['required', new FractionalKey],
        ];
    }
}
