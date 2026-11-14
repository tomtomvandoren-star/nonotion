<?php

namespace App\Http\Requests\Scheduling;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Créer (tout) ou modifier (ce qui est envoyé) un lien de planification (spec 6.17). */
class SchedulingLinkRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'type' => [$required, Rule::in(['one_off', 'recurring'])],
            'title' => [$required, 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'duration_minutes' => ['sometimes', 'integer', 'min:5', 'max:480'],
            'slot_step_minutes' => ['sometimes', 'integer', 'min:5', 'max:480'],
            'buffer_before_minutes' => ['sometimes', 'integer', 'min:0', 'max:240'],
            'buffer_after_minutes' => ['sometimes', 'integer', 'min:0', 'max:240'],
            'timezone' => [$required, 'string', 'timezone:all_with_bc'],
            // Vide permis : un lien se crée, puis ses plages s'ajoutent.
            'availability' => [$this->isMethod('POST') ? 'present' : 'sometimes', 'array', 'max:100'],
            'target_database_id' => ['sometimes', 'nullable', 'ulid'],
            'avoid_conflicts' => ['sometimes', 'boolean'],
            'allow_multiple_bookings' => ['sometimes', 'boolean'],
            'single_use' => ['sometimes', 'boolean'],
            'min_notice_minutes' => ['sometimes', 'integer', 'min:0', 'max:525600'],
            'max_advance_days' => ['sometimes', 'integer', 'min:1', 'max:365'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'video_url' => ['sometimes', 'nullable', 'url:http,https', 'max:2048'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:64'],
            'expires_at' => ['sometimes', 'nullable', 'date'],
            // « Personnaliser le lien » : lettres minuscules, chiffres et tirets.
            'slug' => ['sometimes', 'nullable', 'string', 'regex:/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/'],
            'status' => ['sometimes', Rule::in(['active', 'disabled'])],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'slug.regex' => 'L’adresse ne peut contenir que des lettres minuscules, des chiffres et des tirets (3 à 64).',
            'timezone.timezone' => 'Ce fuseau horaire est inconnu.',
            'video_url.url' => 'Le lien de visioconférence doit commencer par https://.',
        ];
    }
}
