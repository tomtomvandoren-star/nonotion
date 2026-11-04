<?php

namespace App\Http\Requests\Databases;

use Illuminate\Foundation\Http\FormRequest;

class StoreDatabaseRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // La page où la base est insérée (bloc en ligne), ou sous laquelle elle est créée (pleine page).
            'page_id' => ['required', 'string'],
            'full_page' => ['sometimes', 'boolean'],
            'title' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
