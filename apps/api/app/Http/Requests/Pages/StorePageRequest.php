<?php

namespace App\Http\Requests\Pages;

use App\Rules\FractionalKey;
use Illuminate\Foundation\Http\FormRequest;

class StorePageRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title' => ['nullable', 'string', 'max:255'],
            'icon' => ['nullable', 'string', 'max:64'],
            'parent_page_id' => ['nullable', 'ulid'],
            // Facultative : sans position, la page va en fin de liste.
            'position' => ['nullable', new FractionalKey],
        ];
    }
}
