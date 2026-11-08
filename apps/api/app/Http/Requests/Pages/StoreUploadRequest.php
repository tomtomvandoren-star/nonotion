<?php

namespace App\Http\Requests\Pages;

use Illuminate\Foundation\Http\FormRequest;

class StoreUploadRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // En kilo-octets pour la règle max.
            'file' => ['required', 'file', 'max:'.(config('nonotion.uploads.max_mb') * 1024)],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'file.max' => 'Ce fichier dépasse '.config('nonotion.uploads.max_mb').' Mo.',
            // PHP l'a refusé avant Laravel : en pratique, il est trop lourd pour le serveur.
            'file.uploaded' => 'Ce fichier n’a pas pu être envoyé (trop lourd pour le serveur ?).',
            'file.required' => 'Aucun fichier reçu.',
        ];
    }
}
