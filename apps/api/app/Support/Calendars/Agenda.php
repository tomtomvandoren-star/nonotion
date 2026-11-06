<?php

namespace App\Support\Calendars;

use App\Models\Database;
use App\Models\View;
use App\Models\Workspace;
use App\Support\Databases\PropertySchema;

/**
 * La page « Agenda » de l'espace de travail (spec 6.15) : ce qu'elle réunit et comment.
 *
 * Réglages (`workspaces.agenda`) : on retient ce qui est masqué plutôt que ce qui est affiché, pour
 * qu'une nouvelle base ou un nouvel agenda apparaisse de lui-même.
 * - `hidden_databases` : les bases dont les éléments propres ne s'affichent pas ;
 * - `hidden_sources` : les agendas (ICS, Google, iCloud) masqués ;
 * - `colors` : la couleur des éléments de chaque base (sans couleur : celle du thème) ;
 * - `default_database_id` : la base des éléments créés depuis l'Agenda.
 */
class Agenda
{
    public const DEFAULTS = [
        'hidden_databases' => [],
        'hidden_sources' => [],
        'colors' => [],
        'default_database_id' => null,
    ];

    /** La Date qui place les éléments d'une base : celle de son premier calendrier, sinon sa première Date. */
    public static function dateProperty(Database $database): ?string
    {
        $dates = collect($database->schema)->where('type', 'date')->pluck('id');
        $calendarBy = View::query()->withoutGlobalScopes()
            ->where('database_id', $database->id)->where('type', 'calendar')
            ->orderBy('position')->get()->pluck('config.calendar_by')->first(fn ($id) => $dates->contains($id));

        return $calendarBy ?? $dates->first();
    }

    /**
     * Les bases de l'espace qui ont une Date (hors corbeille) : ce que l'Agenda peut afficher.
     *
     * @return list<array{id: string, title: string, page_id: string, date_property: string}>
     */
    public static function databases(Workspace $workspace): array
    {
        return Database::query()->where('workspace_id', $workspace->id)
            ->whereHas('page')
            ->orderBy('created_at')->orderBy('id')
            ->get()
            ->map(fn (Database $database) => [
                'id' => $database->id,
                'title' => $database->title,
                'page_id' => $database->page_id,
                'date_property' => self::dateProperty($database),
            ])
            ->filter(fn (array $database) => $database['date_property'] !== null)
            ->values()
            ->all();
    }

    /**
     * Les réglages enregistrés, complétés par défaut, sans ce qui n'existe plus.
     *
     * @param  list<string>  $databaseIds
     * @param  list<string>  $sourceIds
     * @return array{hidden_databases: list<string>, hidden_sources: list<string>, colors: array<string, string>, default_database_id: string|null}
     */
    public static function settings(Workspace $workspace, array $databaseIds, array $sourceIds): array
    {
        $saved = [...self::DEFAULTS, ...($workspace->agenda ?? [])];
        $default = in_array($saved['default_database_id'], $databaseIds, true) ? $saved['default_database_id'] : null;

        return [
            'hidden_databases' => array_values(array_intersect($saved['hidden_databases'], $databaseIds)),
            'hidden_sources' => array_values(array_intersect($saved['hidden_sources'], $sourceIds)),
            'colors' => array_filter(
                (array) $saved['colors'],
                fn ($color, $id) => in_array($id, $databaseIds, true) && in_array($color, PropertySchema::COLORS, true),
                ARRAY_FILTER_USE_BOTH,
            ),
            'default_database_id' => $default,
        ];
    }
}
