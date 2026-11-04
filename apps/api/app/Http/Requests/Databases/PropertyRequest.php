<?php

namespace App\Http\Requests\Databases;

use Illuminate\Foundation\Http\FormRequest;

/** Une définition de propriété ; le détail est vérifié par PropertySchema::normalize. */
class PropertyRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['property' => ['required', 'array']];
    }
}
