<?php

namespace App\Http\Requests\Databases;

use App\Rules\FractionalKey;
use App\Support\ClientId;
use Illuminate\Foundation\Http\FormRequest;

class StoreRowRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Choisi par l'appareil pour une ligne créée hors ligne (spec 6.16).
            'id' => ClientId::rules(),
            'title' => ['sometimes', 'nullable', 'string', 'max:255'],
            // Valeurs vérifiées une à une contre le schéma de la base (RowValues).
            'properties' => ['sometimes', 'array'],
            'position' => ['sometimes', new FractionalKey],
        ];
    }
}
