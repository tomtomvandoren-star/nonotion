<?php

namespace App\Support\Databases;

use Illuminate\Support\Str;

/**
 * Le « Gestionnaire de tâches » (spec 6.7) : une base prête à l'emploi, avec ses propriétés et ses
 * vues. La relation « Projet » viendra avec les relations (phase avancée).
 */
class TaskTemplate
{
    public const NAME = 'tasks';

    /** @return list<array<string, mixed>> */
    public static function schema(): array
    {
        return [
            ['id' => PropertySchema::TITLE_ID, 'name' => 'Nom', 'type' => 'title'],
            ['id' => self::id(), 'name' => 'Statut', 'type' => 'status', 'options' => [
                ['id' => self::id(), 'name' => 'À faire', 'color' => 'gray', 'group' => 'todo'],
                ['id' => self::id(), 'name' => 'En cours', 'color' => 'blue', 'group' => 'in_progress'],
                ['id' => self::id(), 'name' => 'Terminé', 'color' => 'green', 'group' => 'complete'],
            ]],
            ['id' => self::id(), 'name' => 'Échéance', 'type' => 'date'],
            ['id' => self::id(), 'name' => 'Priorité', 'type' => 'select', 'options' => [
                ['id' => self::id(), 'name' => 'Haute', 'color' => 'red'],
                ['id' => self::id(), 'name' => 'Moyenne', 'color' => 'yellow'],
                ['id' => self::id(), 'name' => 'Basse', 'color' => 'green'],
            ]],
            ['id' => self::id(), 'name' => 'Étiquettes', 'type' => 'multi_select', 'options' => []],
        ];
    }

    /**
     * Les vues fournies d'office : Tableau (tout), Aujourd'hui (Échéance = aujourd'hui et Statut
     * différent de Terminé), Par statut (Board) et Calendrier (par Échéance).
     *
     * @param  list<array<string, mixed>>  $schema
     * @return list<array{name: string, type: string, config: array<string, mixed>}>
     */
    public static function views(array $schema): array
    {
        $status = self::property($schema, 'status');
        $due = self::property($schema, 'date');
        $done = collect($status['options'])->firstWhere('group', 'complete');

        return [
            ['name' => 'Tableau', 'type' => 'table', 'config' => []],
            ['name' => 'Aujourd’hui', 'type' => 'list', 'config' => [
                'filters' => ['operator' => 'and', 'rules' => [
                    ['property' => $due['id'], 'op' => 'is', 'value' => 'today'],
                    ['property' => $status['id'], 'op' => 'is_not', 'value' => $done['id']],
                ]],
            ]],
            ['name' => 'Par statut', 'type' => 'board', 'config' => ['group_by' => ['property' => $status['id']]]],
            ['name' => 'Calendrier', 'type' => 'calendar', 'config' => ['calendar_by' => $due['id']]],
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $schema
     * @return array<string, mixed>
     */
    private static function property(array $schema, string $type): array
    {
        return collect($schema)->firstWhere('type', $type);
    }

    private static function id(): string
    {
        return Str::lower(Str::random(8));
    }
}
