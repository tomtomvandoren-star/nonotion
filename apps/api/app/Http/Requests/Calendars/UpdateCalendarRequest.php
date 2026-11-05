<?php

namespace App\Http\Requests\Calendars;

use App\Models\CalendarSource;
use App\Support\Databases\PropertySchema;
use Illuminate\Foundation\Http\FormRequest;

class UpdateCalendarRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:100'],
            'color' => ['sometimes', 'in:'.implode(',', PropertySchema::COLORS)],
            'mode' => ['sometimes', 'in:'.CalendarSource::SUBSCRIPTION.','.CalendarSource::ONE_SHOT],
        ];
    }
}
