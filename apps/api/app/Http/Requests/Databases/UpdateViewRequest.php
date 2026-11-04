<?php

namespace App\Http\Requests\Databases;

use App\Rules\FractionalKey;
use App\Support\Databases\ViewConfigRules;
use Illuminate\Foundation\Http\FormRequest;

class UpdateViewRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:100'],
            'position' => ['sometimes', new FractionalKey],
            ...ViewConfigRules::rules(),
        ];
    }
}
