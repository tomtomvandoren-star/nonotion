<?php

namespace App\Http\Requests\Calendars;

use App\Support\Databases\PropertySchema;
use Illuminate\Foundation\Http\FormRequest;

/** Ajouter un agenda d'un compte connecté (spec 6.15) à une base, existante ou nouvelle. */
class AddAccountCalendarRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'remote_id' => ['required', 'string', 'max:2048'],
            'name' => ['required', 'string', 'max:100'],
            'color' => ['required', 'in:'.implode(',', PropertySchema::COLORS)],
            // Une base existante, ou une nouvelle base d'événements sous cette page, ou au premier
            // niveau de cet espace de travail.
            'database_id' => ['nullable', 'string', 'required_without_all:page_id,workspace_id'],
            'page_id' => ['nullable', 'string', 'required_without_all:database_id,workspace_id'],
            'workspace_id' => ['nullable', 'string', 'required_without_all:database_id,page_id'],
        ];
    }
}
