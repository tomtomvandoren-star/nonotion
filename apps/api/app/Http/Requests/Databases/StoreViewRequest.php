<?php

namespace App\Http\Requests\Databases;

use App\Support\Databases\ViewConfigRules;
use Illuminate\Foundation\Http\FormRequest;

class StoreViewRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'type' => ['required', 'in:'.implode(',', ViewConfigRules::VIEW_TYPES)],
            ...ViewConfigRules::rules(),
        ];
    }
}
