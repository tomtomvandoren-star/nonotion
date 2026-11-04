<?php

namespace App\Http\Requests\Pages;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePageContentRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Document BlockNote : un tableau de blocs (ou null pour une page vide). Le détail d'un
            // bloc appartient à l'éditeur ; le serveur vérifie la forme qu'il exploite lui-même
            // (type, enfants) pour l'extraction du texte de recherche.
            'content' => ['present', 'nullable', 'array', 'max:10000'],
            'content.*' => ['array'],
            'content.*.type' => ['required', 'string', 'max:64'],
            'content.*.children' => ['sometimes', 'array'],
            // Version lue par le client : verrouillage optimiste (spec 1.3.5).
            'version' => ['required', 'integer', 'min:1'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'content.*' => 'bloc',
            'content.*.type' => 'type de bloc',
            'content.*.children' => 'blocs imbriqués',
        ];
    }
}
