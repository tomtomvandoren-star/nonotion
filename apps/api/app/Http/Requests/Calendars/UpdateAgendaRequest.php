<?php

namespace App\Http\Requests\Calendars;

use App\Support\Databases\PropertySchema;
use Illuminate\Foundation\Http\FormRequest;

/** Les réglages de l'Agenda (spec 6.15) ; chaque champ est facultatif. */
class UpdateAgendaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'hidden_databases' => ['sometimes', 'array', 'max:500'],
            'hidden_databases.*' => ['string', 'max:26'],
            'hidden_sources' => ['sometimes', 'array', 'max:500'],
            'hidden_sources.*' => ['string', 'max:26'],
            'colors' => ['sometimes', 'array', 'max:500'],
            'colors.*' => ['string', 'in:'.implode(',', PropertySchema::COLORS)],
            'default_database_id' => ['sometimes', 'nullable', 'string', 'max:26'],
        ];
    }
}
