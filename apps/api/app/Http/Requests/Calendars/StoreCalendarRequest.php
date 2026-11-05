<?php

namespace App\Http\Requests\Calendars;

use App\Models\CalendarSource;
use App\Support\Databases\PropertySchema;
use Illuminate\Foundation\Http\FormRequest;

class StoreCalendarRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'url' => ['required', 'string', 'max:2048'],
            'name' => ['required', 'string', 'max:100'],
            'color' => ['required', 'in:'.implode(',', PropertySchema::COLORS)],
            'mode' => ['required', 'in:'.CalendarSource::SUBSCRIPTION.','.CalendarSource::ONE_SHOT],
            // Une base existante, ou une nouvelle base d'événements créée sous cette page.
            'database_id' => ['nullable', 'string', 'required_without:page_id'],
            'page_id' => ['nullable', 'string', 'required_without:database_id'],
            'time_zone' => ['nullable', 'string', 'max:64'],
        ];
    }
}
