<?php

namespace App\Support\Databases;

use DateTimeImmutable;

/**
 * Validation des valeurs de propriétés (spec 4.3, « règle d'or ») : une valeur invalide est refusée
 * par l'API, pas seulement par l'interface. Mêmes règles que packages/shared (Zod), vérifiées sur les
 * mêmes exemples (packages/shared/fixtures/property-values.json).
 */
class PropertyValue
{
    private const DAY = '/^\d{4}-\d{2}-\d{2}$/';

    private const INSTANT = '/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/';

    /** Fuseau d'origine d'une heure : un nom IANA (« Europe/Brussels »), comme TIME_ZONE_PATTERN côté front. */
    public const TIME_ZONE = '/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/';

    /** @param array<string, mixed> $property */
    public static function isValid(array $property, mixed $value): bool
    {
        return match ($property['type'] ?? null) {
            'text' => is_string($value) && mb_strlen($value) <= 10_000,
            'number' => $value === null || ((is_int($value) || is_float($value)) && is_finite((float) $value)),
            'checkbox' => is_bool($value),
            'date' => $value === null || self::isValidDate($value),
            'select', 'status' => $value === null || (is_string($value) && in_array($value, self::optionIds($property), true)),
            'multi_select' => self::isValidOptionList($property, $value),
            default => false,
        };
    }

    /** La valeur « vide » d'un type : celle d'une ligne qui n'a encore rien reçu. */
    public static function empty(string $type): mixed
    {
        return match ($type) {
            'text' => '',
            'checkbox' => false,
            'multi_select' => [],
            default => null,
        };
    }

    /**
     * Convertit une valeur quand la propriété change de type ou d'options, en gardant ce qui a un
     * sens (« 12 » en texte devient 12 en nombre, une option garde son identifiant si elle existe
     * encore, un texte retrouve l'option du même nom). Sinon, la valeur vide du nouveau type.
     *
     * @param  array<string, mixed>  $from
     * @param  array<string, mixed>  $to
     */
    public static function convert(array $from, array $to, mixed $value): mixed
    {
        $converted = self::rawConvert($from, $to, $value);

        return self::isValid($to, $converted) ? $converted : self::empty($to['type']);
    }

    /**
     * @param  array<string, mixed>  $from
     * @param  array<string, mixed>  $to
     */
    private static function rawConvert(array $from, array $to, mixed $value): mixed
    {
        if ($value === null) {
            return self::empty($to['type']);
        }
        $text = self::asText($from, $value);

        return match ($to['type']) {
            'text' => $text,
            'number' => is_int($value) || is_float($value) ? $value : (is_numeric(str_replace(',', '.', $text)) ? +str_replace(',', '.', $text) : null),
            'checkbox' => is_bool($value) ? $value : in_array(mb_strtolower(trim($text)), ['1', 'oui', 'yes', 'true', 'x', 'vrai'], true),
            'date' => $from['type'] === 'date' ? $value : (preg_match(self::DAY, trim($text)) ? ['start' => trim($text)] : null),
            'select', 'status' => self::optionFor($from, $to, $value),
            'multi_select' => self::optionsFor($from, $to, $value),
            default => null,
        };
    }

    /**
     * Le texte d'une valeur, pour la convertir : le nom d'une option, la date de début…
     *
     * @param  array<string, mixed>  $property
     */
    public static function asText(array $property, mixed $value): string
    {
        $names = array_column($property['options'] ?? [], 'name', 'id');

        return match (true) {
            is_string($value) && isset($names[$value]) => $names[$value],
            is_string($value) => $value,
            is_bool($value) => $value ? 'Oui' : '',
            is_int($value), is_float($value) => (string) $value,
            is_array($value) && array_is_list($value) => implode(', ', array_map(fn ($id) => $names[$id] ?? '', $value)),
            is_array($value) && isset($value['start']) && is_string($value['start']) => $value['start'],
            default => '',
        };
    }

    /**
     * @param  array<string, mixed>  $from
     * @param  array<string, mixed>  $to
     */
    private static function optionFor(array $from, array $to, mixed $value): ?string
    {
        $ids = self::optionIds($to);
        $first = is_array($value) && array_is_list($value) ? ($value[0] ?? null) : $value;
        if (is_string($first) && in_array($first, $ids, true)) {
            return $first;
        }

        return self::optionIdByName($to, self::asText($from, is_array($value) && array_is_list($value) ? [$first] : $value));
    }

    /**
     * @param  array<string, mixed>  $from
     * @param  array<string, mixed>  $to
     * @return list<string>
     */
    private static function optionsFor(array $from, array $to, mixed $value): array
    {
        $ids = self::optionIds($to);
        $values = match (true) {
            is_array($value) && array_is_list($value) => $value,
            // « Travail, Perso » en texte devient deux options.
            is_string($value) && $from['type'] === 'text' => array_map('trim', explode(',', $value)),
            default => [$value],
        };
        $kept = [];
        foreach ($values as $item) {
            $id = is_string($item) && in_array($item, $ids, true)
                ? $item
                : self::optionIdByName($to, self::asText($from, is_string($item) ? $item : $value));
            if ($id !== null && ! in_array($id, $kept, true)) {
                $kept[] = $id;
            }
        }

        return $kept;
    }

    /** @param array<string, mixed> $property */
    private static function optionIdByName(array $property, string $name): ?string
    {
        $name = mb_strtolower(trim($name));
        foreach ($property['options'] ?? [] as $option) {
            if (mb_strtolower($option['name']) === $name) {
                return $option['id'];
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $property
     * @return list<string>
     */
    private static function optionIds(array $property): array
    {
        return array_values(array_column($property['options'] ?? [], 'id'));
    }

    /** @param array<string, mixed> $property */
    private static function isValidOptionList(array $property, mixed $value): bool
    {
        if (! is_array($value) || ! array_is_list($value) || count($value) > 100) {
            return false;
        }
        $ids = self::optionIds($property);
        foreach ($value as $id) {
            if (! is_string($id) || ! in_array($id, $ids, true)) {
                return false;
            }
        }

        return count(array_unique($value)) === count($value);
    }

    /**
     * « 2026-11-05 » (journée entière) ou un instant ISO 8601 avec décalage ; une fin du même genre,
     * pas avant le début.
     */
    private static function isValidDate(mixed $value): bool
    {
        if (! is_array($value) || array_is_list($value) || ! isset($value['start']) || array_diff(array_keys($value), ['start', 'end', 'repeat', 'time_zone']) !== []) {
            return false;
        }
        if (! self::isValidRepeat($value['repeat'] ?? null)) {
            return false;
        }
        $zone = $value['time_zone'] ?? null;
        if ($zone !== null && (! is_string($zone) || strlen($zone) > 64 || ! preg_match(self::TIME_ZONE, $zone))) {
            return false;
        }
        $start = $value['start'];
        $end = $value['end'] ?? null;
        if (! is_string($start) || ($end !== null && ! is_string($end))) {
            return false;
        }
        if (self::isDay($start)) {
            return $end === null || (self::isDay($end) && $end >= $start);
        }
        if (self::isInstant($start)) {
            return $end === null || (self::isInstant($end) && new DateTimeImmutable($end) >= new DateTimeImmutable($start));
        }

        return false;
    }

    /** « Répéter tous les N jours, semaines, mois ou ans » (spec 6.7), ou rien. */
    private static function isValidRepeat(mixed $repeat): bool
    {
        if ($repeat === null) {
            return true;
        }

        return is_array($repeat)
            && ! array_is_list($repeat)
            && array_diff(array_keys($repeat), ['unit', 'interval']) === []
            && in_array($repeat['unit'] ?? null, ['day', 'week', 'month', 'year'], true)
            && is_int($repeat['interval'] ?? null)
            && $repeat['interval'] >= 1
            && $repeat['interval'] <= 365;
    }

    private static function isDay(string $value): bool
    {
        if (! preg_match(self::DAY, $value)) {
            return false;
        }
        [$year, $month, $day] = array_map('intval', explode('-', $value));

        return checkdate($month, $day, $year);
    }

    private static function isInstant(string $value): bool
    {
        if (! preg_match(self::INSTANT, $value) || ! self::isDay(substr($value, 0, 10))) {
            return false;
        }

        try {
            new DateTimeImmutable($value);

            return true;
        } catch (\Exception) {
            return false;
        }
    }
}
