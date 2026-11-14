<?php

namespace App\Http\Requests\Pages;

use App\Rules\FractionalKey;
use App\Support\ClientId;
use Illuminate\Foundation\Http\FormRequest;

class StorePageRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Choisi par l'appareil pour une page créée hors ligne (spec 6.16).
            'id' => ClientId::rules(),
            'title' => ['nullable', 'string', 'max:255'],
            'icon' => ['nullable', 'string', 'max:64'],
            'parent_page_id' => ['nullable', 'ulid'],
            // Facultative : sans position, la page va en fin de liste.
            'position' => ['nullable', new FractionalKey],
        ];
    }
}
