<?php

namespace App\Http\Requests\Databases;

use Illuminate\Foundation\Http\FormRequest;

class UpdateDatabaseRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['title' => ['present', 'nullable', 'string', 'max:255']];
    }
}
