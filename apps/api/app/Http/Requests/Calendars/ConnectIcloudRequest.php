<?php

namespace App\Http\Requests\Calendars;

use Illuminate\Foundation\Http\FormRequest;

/** Connecter iCloud (spec 6.15) : l'identifiant Apple et un mot de passe pour application. */
class ConnectIcloudRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'username' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:255'],
        ];
    }
}
