<?php

namespace App\Http\Requests\Calendars;

use Illuminate\Foundation\Http\FormRequest;

class PreviewCalendarRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'workspace_id' => ['required', 'string'],
            'url' => ['required', 'string', 'max:2048'],
            // Le fuseau de l'appareil : celui des heures « flottantes » de l'agenda.
            'time_zone' => ['nullable', 'string', 'max:64'],
        ];
    }
}
