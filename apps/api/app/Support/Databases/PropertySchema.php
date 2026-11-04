<?php

namespace App\Support\Databases;

use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Le schéma d'une base : la liste de ses propriétés [{id, name, type, options…}] (spec 4.1).
 * Mêmes règles que packages/shared (propertySchema) ; une définition est nettoyée avant d'être
 * enregistrée (seules les clés connues sont gardées).
 */
class PropertySchema
{
    public const TYPES = ['title', 'text', 'number', 'checkbox', 'date', 'select', 'multi_select', 'status'];

    public const COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];

    public const STATUS_GROUPS = ['todo', 'in_progress', 'complete'];

    public const ID_PATTERN = '/^[A-Za-z0-9_-]{1,32}$/';

    public const TITLE_ID = 'title';

    /** Le schéma d'une nouvelle base : le seul Titre (spec 6.4). */
    public static function initial(): array
    {
        return [['id' => self::TITLE_ID, 'name' => 'Nom', 'type' => 'title']];
    }

    /**
     * Vérifie et nettoie une définition de propriété ; lève une erreur de validation sinon.
     *
     * @return array<string, mixed>
     */
    public static function normalize(mixed $property, string $field = 'property'): array
    {
        $fail = fn (string $message) => throw ValidationException::withMessages([$field => $message]);

        if (! is_array($property)) {
            $fail('La propriété est invalide.');
        }
        $id = $property['id'] ?? null;
        $name = is_string($property['name'] ?? null) ? trim($property['name']) : '';
        $type = $property['type'] ?? null;

        if (! is_string($id) || ! preg_match(self::ID_PATTERN, $id)) {
            $fail('L’identifiant de la propriété est invalide.');
        }
        if ($name === '' || mb_strlen($name) > 100) {
            $fail('Le nom de la propriété doit faire de 1 à 100 caractères.');
        }
        if (! in_array($type, self::TYPES, true)) {
            $fail('Ce type de propriété n’existe pas.');
        }

        $clean = ['id' => $id, 'name' => $name, 'type' => $type];
        if (in_array($type, ['select', 'multi_select', 'status'], true)) {
            $clean['options'] = self::normalizeOptions($property['options'] ?? [], $type === 'status', $fail);
        }

        return $clean;
    }

    /**
     * @param  callable(string): never  $fail
     * @return list<array<string, string>>
     */
    private static function normalizeOptions(mixed $options, bool $status, callable $fail): array
    {
        if (! is_array($options) || ! array_is_list($options) || count($options) > 200) {
            $fail('Les options de la propriété sont invalides.');
        }

        $clean = [];
        foreach ($options as $option) {
            $id = is_array($option) ? ($option['id'] ?? null) : null;
            $name = is_array($option) && is_string($option['name'] ?? null) ? trim($option['name']) : '';
            $color = is_array($option) ? ($option['color'] ?? null) : null;
            if (! is_string($id) || ! preg_match(self::ID_PATTERN, $id) || $name === '' || mb_strlen($name) > 100 || ! in_array($color, self::COLORS, true)) {
                $fail('Une option est invalide (nom de 1 à 100 caractères, couleur connue).');
            }
            $item = ['id' => $id, 'name' => $name, 'color' => $color];
            if ($status) {
                $group = $option['group'] ?? null;
                if (! in_array($group, self::STATUS_GROUPS, true)) {
                    $fail('Une option de statut doit appartenir à À faire, En cours ou Terminé.');
                }
                $item['group'] = $group;
            }
            $clean[] = $item;
        }

        if (count(array_unique(array_column($clean, 'id'))) !== count($clean)) {
            $fail('Deux options ont le même identifiant.');
        }

        return $clean;
    }

    /**
     * Des options créées à partir des textes existants, quand une propriété devient une sélection :
     * « Urgent » en texte devient l'option « Urgent », comme dans Notion.
     *
     * @param  array<string, mixed>  $property  la propriété d'arrivée (options déjà nettoyées)
     * @param  list<string>  $texts
     * @return array<string, mixed>
     */
    public static function withOptionsFor(array $property, array $texts): array
    {
        if (! in_array($property['type'], ['select', 'multi_select', 'status'], true)) {
            return $property;
        }
        $known = array_map(fn (array $option) => mb_strtolower($option['name']), $property['options']);
        $colors = array_values(array_diff(self::COLORS, ['default']));
        foreach (array_unique($texts) as $text) {
            $parts = $property['type'] === 'multi_select' ? array_map('trim', explode(',', $text)) : [trim($text)];
            foreach ($parts as $name) {
                if ($name === '' || mb_strlen($name) > 100 || in_array(mb_strtolower($name), $known, true) || count($property['options']) >= 200) {
                    continue;
                }
                $option = ['id' => Str::lower(Str::random(8)), 'name' => $name, 'color' => $colors[count($property['options']) % count($colors)]];
                if ($property['type'] === 'status') {
                    $option['group'] = 'todo';
                }
                $property['options'][] = $option;
                $known[] = mb_strtolower($name);
            }
        }

        return $property;
    }
}
