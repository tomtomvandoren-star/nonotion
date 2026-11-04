<?php

namespace App\Http\Requests\Pages;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePageContentRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Document BlockNote : un tableau de blocs (ou null pour une page vide).
            'content' => ['present', 'nullable', 'array', 'max:10000'],
            // Version lue par le client : verrouillage optimiste (spec 1.3.5).
            'version' => ['required', 'integer', 'min:1'],
        ];
    }
}
