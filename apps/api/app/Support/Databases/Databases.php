<?php

namespace App\Support\Databases;

use App\Http\Controllers\CalendarSourceController;
use App\Models\CalendarSource;
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
    public static function block(string $databaseId, bool $fullPage = false): array
    {
        return [
            'id' => (string) Str::uuid(),
            'type' => 'database',
            'props' => ['databaseId' => $databaseId, 'fullPage' => $fullPage],
            'children' => [],
        ];
    }

    /**
     * Une nouvelle base : la propriété Titre, une vue Tableau et trois lignes vides (spec 6.4), ou
     * le modèle demandé (« tasks » : le Gestionnaire de tâches, spec 6.7 ; « events » : une base
     * d'événements pour un agenda importé, spec 6.9).
     * En pleine page, elle vit dans une nouvelle sous-page de $host, dont elle est tout le contenu.
     *
     * @return array{0: Database, 1: Page} la base et la page qui la contient
     */
    public static function create(Page $host, bool $fullPage, ?string $title, ?string $template = null): array
    {
        [$schema, $views, $emptyRows] = match ($template) {
            TaskTemplate::NAME => [$schema = TaskTemplate::schema(), TaskTemplate::views($schema), 3],
            // Une base d'événements démarre vide : les événements arrivent avec l'import.
            EventTemplate::NAME => [$schema = EventTemplate::schema(), EventTemplate::views($schema), 0],
            default => [PropertySchema::initial(), [['name' => 'Tableau', 'type' => 'table', 'config' => []]], 3],
        };
        $title ??= $template === TaskTemplate::NAME ? 'Tâches' : null;

        return DB::transaction(function () use ($host, $fullPage, $title, $schema, $views, $emptyRows) {
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
                'schema' => $schema,
            ]);

            $position = null;
            foreach ($views as $view) {
                $position = FractionalIndex::between($position, null);
                View::create([...$view, 'workspace_id' => $host->workspace_id, 'database_id' => $database->id, 'position' => $position]);
            }

            $position = null;
            for ($i = 0; $i < $emptyRows; $i++) {
                $position = FractionalIndex::between($position, null);
                self::createRow($database, ['position' => $position]);
            }

            if ($fullPage) {
                $container->forceFill(['content' => [self::block($database->id, fullPage: true)]])->save();
            }

            return [$database, $container];
        });
    }

    /**
     * Une nouvelle ligne. Un Statut non précisé prend sa première option « À faire » : une tâche
     * qu'on vient d'ajouter est à faire, pas « sans statut ».
     *
     * @param  array{title?: string|null, properties?: array<string, mixed>, position?: string|null}  $attributes
     */
    public static function createRow(Database $database, array $attributes): Page
    {
        $row = new Page([
            'workspace_id' => $database->workspace_id,
            'parent_page_id' => $database->page_id,
            'title' => $attributes['title'] ?? '',
            'position' => $attributes['position'] ?? self::positionAtEnd($database),
        ]);
        $properties = [...self::defaultValues($database), ...($attributes['properties'] ?? [])];
        $row->forceFill(['database_id' => $database->id, 'properties' => $properties])->save();

        return $row;
    }

    /** @return array<string, mixed> */
    private static function defaultValues(Database $database): array
    {
        $values = [];
        foreach ($database->schema ?? [] as $property) {
            if ($property['type'] === 'status') {
                $todo = collect($property['options'])->firstWhere('group', 'todo');
                if ($todo !== null) {
                    $values[$property['id']] = $todo['id'];
                }
            }
        }

        return $values;
    }

    /**
     * Ajoute une propriété au schéma ; les vues qui listent leurs colonnes l'affichent aussi.
     *
     * @param  array<string, mixed>  $property
     */
    public static function appendProperty(Database $database, array $property): void
    {
        $database->update(['schema' => [...$database->schema, $property]]);
        foreach (View::query()->where('database_id', $database->id)->get() as $view) {
            if (isset($view->config['visible_properties'])) {
                $config = $view->config;
                $config['visible_properties'][] = $property['id'];
                $view->update(['config' => $config]);
            }
        }
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
            'sources' => CalendarSource::query()->where('database_id', $database->id)->orderBy('created_at')->get()
                ->map(fn (CalendarSource $source) => CalendarSourceController::present($source))->all(),
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
            // Un événement importé d'un agenda (spec 6.9) : titre et date en lecture seule.
            'calendar_source_id' => $row->calendar_source_id,
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
