<?php

namespace App\Support\Databases;

use App\Models\Database;
use App\Models\Page;
use App\Models\View;
use App\Support\FractionalIndex;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Création, lecture et règles communes des bases de données (spec 6.4).
 * Une ligne est une page : database_id la rattache à sa base, parent_page_id à la page qui contient
 * la base (elle part ainsi à la corbeille et en revient avec elle).
 */
class Databases
{
    /** Le bloc de l'éditeur qui affiche une base dans le document d'une page. */
    public static function block(string $databaseId): array
    {
        return ['id' => (string) Str::uuid(), 'type' => 'database', 'props' => ['databaseId' => $databaseId], 'children' => []];
    }

    /**
     * Une nouvelle base : la propriété Titre, une vue Tableau et trois lignes vides (spec 6.4).
     * En pleine page, elle vit dans une nouvelle sous-page de $host, dont elle est tout le contenu.
     *
     * @return array{0: Database, 1: Page} la base et la page qui la contient
     */
    public static function create(Page $host, bool $fullPage, ?string $title): array
    {
        return DB::transaction(function () use ($host, $fullPage, $title) {
            $container = $host;
            if ($fullPage) {
                $container = Page::create([
                    'workspace_id' => $host->workspace_id,
                    'parent_page_id' => $host->id,
                    'title' => $title ?? '',
                    'position' => Page::positionAtEnd($host->workspace_id, $host->id),
                ]);
            }

            $database = Database::create([
                'workspace_id' => $host->workspace_id,
                'page_id' => $container->id,
                'title' => $title ?? '',
                'schema' => PropertySchema::initial(),
            ]);

            View::create([
                'workspace_id' => $host->workspace_id,
                'database_id' => $database->id,
                'name' => 'Tableau',
                'type' => 'table',
                'position' => FractionalIndex::between(null, null),
                'config' => [],
            ]);

            $position = null;
            for ($i = 0; $i < 3; $i++) {
                $position = FractionalIndex::between($position, null);
                self::createRow($database, ['position' => $position]);
            }

            if ($fullPage) {
                $container->forceFill(['content' => [self::block($database->id)]])->save();
            }

            return [$database, $container];
        });
    }

    /**
     * @param  array{title?: string|null, properties?: array<string, mixed>, position?: string}  $attributes
     */
    public static function createRow(Database $database, array $attributes): Page
    {
        $row = new Page([
            'workspace_id' => $database->workspace_id,
            'parent_page_id' => $database->page_id,
            'title' => $attributes['title'] ?? '',
            'position' => $attributes['position'] ?? self::positionAtEnd($database),
        ]);
        $row->forceFill(['database_id' => $database->id, 'properties' => $attributes['properties'] ?? []])->save();

        return $row;
    }

    public static function positionAtEnd(Database $database): string
    {
        $last = DB::table('pages')
            ->where('database_id', $database->id)
            ->whereNull('deleted_at')
            ->orderByDesc('position')
            ->value('position');

        return FractionalIndex::between($last, null);
    }

    /**
     * Vérifie des valeurs de propriétés contre le schéma de la base (spec 4.3, « règle d'or »).
     *
     * @param  array<array-key, mixed>  $values
     * @return array<string, mixed>
     */
    public static function validateValues(Database $database, array $values): array
    {
        $clean = [];
        foreach ($values as $id => $value) {
            $id = (string) $id;
            $property = $database->property($id);
            $field = "properties.{$id}";
            if ($property === null || $property['type'] === 'title') {
                throw ValidationException::withMessages([$field => 'Cette propriété n’existe pas dans la base.']);
            }
            if (! PropertyValue::isValid($property, $value)) {
                throw ValidationException::withMessages([$field => "La valeur de « {$property['name']} » est invalide."]);
            }
            $clean[$id] = $value;
        }

        return $clean;
    }

    /** @return array<string, mixed> */
    public static function detail(Database $database): array
    {
        return [
            'id' => $database->id,
            'workspace_id' => $database->workspace_id,
            'page_id' => $database->page_id,
            'title' => $database->title,
            'schema' => $database->schema,
            'views' => $database->views()->get()->map(fn (View $view) => self::view($view))->all(),
            'rows' => $database->rows()->get()->map(fn (Page $row) => self::row($row))->all(),
        ];
    }

    /** @return array<string, mixed> */
    public static function view(View $view): array
    {
        return [
            'id' => $view->id,
            'database_id' => $view->database_id,
            'name' => $view->name,
            'type' => $view->type,
            'position' => $view->position,
            'config' => ViewConfigRules::present($view->config),
        ];
    }

    /** @return array<string, mixed> */
    public static function row(Page $row): array
    {
        return [
            'id' => $row->id,
            'title' => $row->title,
            'icon' => $row->icon,
            'properties' => (object) ($row->properties ?? []),
            'position' => $row->position,
            'created_at' => $row->created_at?->toIso8601String(),
            'updated_at' => $row->updated_at?->toIso8601String(),
        ];
    }

    /**
     * Retire une propriété de la configuration des vues (filtres, tris, regroupement, colonnes).
     *
     * @param  array<string, mixed>  $config
     * @return array<string, mixed>
     */
    public static function configWithout(array $config, string $propertyId): array
    {
        if (isset($config['filters']['rules'])) {
            $config['filters']['rules'] = array_values(array_filter(
                $config['filters']['rules'],
                fn (array $rule) => $rule['property'] !== $propertyId,
            ));
        }
        if (isset($config['sorts'])) {
            $config['sorts'] = array_values(array_filter($config['sorts'], fn (array $sort) => $sort['property'] !== $propertyId));
        }
        if (($config['group_by']['property'] ?? null) === $propertyId) {
            $config['group_by'] = null;
        }
        if (isset($config['visible_properties'])) {
            $config['visible_properties'] = array_values(array_diff($config['visible_properties'], [$propertyId]));
        }
        unset($config['property_widths'][$propertyId]);
        if (($config['calendar_by'] ?? null) === $propertyId) {
            $config['calendar_by'] = null;
        }

        return $config;
    }
}
