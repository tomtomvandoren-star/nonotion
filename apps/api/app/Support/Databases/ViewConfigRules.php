<?php

namespace App\Support\Databases;

use Closure;

/**
 * Règles de validation de la configuration d'une vue (spec 4.2), mêmes clés que viewConfigSchema
 * côté front. Seules les clés connues sont enregistrées (validated()).
 */
class ViewConfigRules
{
    public const VIEW_TYPES = ['table', 'board', 'list', 'calendar', 'gallery'];

    public const OPERATORS = [
        'contains', 'does_not_contain', 'is', 'is_not', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty',
        'equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal',
        'before', 'after', 'on_or_before', 'on_or_after',
    ];

    /** @return array<string, mixed> */
    public static function rules(string $prefix = 'config'): array
    {
        $id = 'regex:'.PropertySchema::ID_PATTERN;

        return [
            $prefix => ['sometimes', 'array'],
            "{$prefix}.filters" => ['sometimes', 'array'],
            "{$prefix}.filters.operator" => ["required_with:{$prefix}.filters", 'in:and,or'],
            "{$prefix}.filters.rules" => ["required_with:{$prefix}.filters", 'array', 'list', 'max:50'],
            "{$prefix}.filters.rules.*.property" => ['required', 'string', $id],
            "{$prefix}.filters.rules.*.op" => ['required', 'in:'.implode(',', self::OPERATORS)],
            "{$prefix}.filters.rules.*.value" => ['nullable', self::smallValue()],
            "{$prefix}.sorts" => ['sometimes', 'array', 'list', 'max:20'],
            "{$prefix}.sorts.*.property" => ['required', 'string', $id],
            "{$prefix}.sorts.*.direction" => ['required', 'in:asc,desc'],
            "{$prefix}.group_by" => ['sometimes', 'nullable', 'array'],
            "{$prefix}.group_by.property" => ["required_with:{$prefix}.group_by", 'string', $id],
            "{$prefix}.group_by.hide_empty" => ['sometimes', 'boolean'],
            "{$prefix}.group_by.hidden" => ['sometimes', 'array', 'list', 'max:200'],
            "{$prefix}.group_by.hidden.*" => ['string', 'max:32'],
            "{$prefix}.visible_properties" => ['sometimes', 'array', 'list', 'max:100'],
            "{$prefix}.visible_properties.*" => ['string', $id],
            "{$prefix}.property_widths" => ['sometimes', 'array', self::idKeys()],
            "{$prefix}.property_widths.*" => ['integer', 'min:60', 'max:1000'],
            "{$prefix}.calendar_by" => ['sometimes', 'nullable', 'string', $id],
            "{$prefix}.open_pages_in" => ['sometimes', 'in:side_peek,center_modal,full_page'],
            "{$prefix}.card_size" => ['sometimes', 'in:small,medium,large'],
        ];
    }

    /**
     * La configuration telle que renvoyée : un objet JSON partout où le front attend un objet,
     * même vide (un tableau PHP vide s'encoderait en « [] »).
     *
     * @param  array<string, mixed>|null  $config
     */
    public static function present(?array $config): object
    {
        $config ??= [];
        if (array_key_exists('property_widths', $config)) {
            $config['property_widths'] = (object) $config['property_widths'];
        }

        return (object) $config;
    }

    /** La valeur d'une règle de filtre : un texte, un nombre ou un booléen courts. */
    private static function smallValue(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) {
            $ok = is_bool($value) || is_int($value) || is_float($value) || (is_string($value) && mb_strlen($value) <= 1000);
            if (! $ok) {
                $fail('La valeur du filtre est invalide.');
            }
        };
    }

    private static function idKeys(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) {
            foreach (array_keys((array) $value) as $key) {
                if (! preg_match(PropertySchema::ID_PATTERN, (string) $key)) {
                    $fail('Une largeur de colonne vise une propriété invalide.');
                }
            }
        };
    }
}
