<?php

namespace App\Support\Databases;

use Illuminate\Support\Str;

/**
 * Une base d'événements, créée pour recevoir un agenda importé (spec 6.9) : Nom, Date, Lieu, Lien,
 * avec une vue Calendrier d'abord. Elle démarre vide : les événements arrivent avec l'import.
 */
class EventTemplate
{
    public const NAME = 'events';

    /** @return list<array<string, mixed>> */
    public static function schema(): array
    {
        return [
            ['id' => PropertySchema::TITLE_ID, 'name' => 'Nom', 'type' => 'title'],
            ['id' => self::id(), 'name' => 'Date', 'type' => 'date'],
            ['id' => self::id(), 'name' => 'Lieu', 'type' => 'text'],
            ['id' => self::id(), 'name' => 'Lien', 'type' => 'text'],
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $schema
     * @return list<array{name: string, type: string, config: array<string, mixed>}>
     */
    public static function views(array $schema): array
    {
        $date = collect($schema)->firstWhere('type', 'date');

        return [
            ['name' => 'Calendrier', 'type' => 'calendar', 'config' => ['calendar_by' => $date['id']]],
            ['name' => 'Tableau', 'type' => 'table', 'config' => []],
        ];
    }

    private static function id(): string
    {
        return Str::lower(Str::random(8));
    }
}
