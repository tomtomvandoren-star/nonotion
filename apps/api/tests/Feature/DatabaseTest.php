<?php

use App\Models\Database;
use App\Models\Page;
use App\Models\View;
use App\Models\Workspace;

/** Crée une base en ligne dans une nouvelle page et renvoie sa réponse JSON. */
function createDatabase(Workspace $workspace, array $payload = []): array
{
    $page = test()->postJson("/api/workspaces/{$workspace->id}/pages", ['title' => 'Projet'])->json('data.id');

    return test()->postJson("/api/workspaces/{$workspace->id}/databases", ['page_id' => $page, ...$payload])
        ->assertCreated()
        ->json();
}

function addProperty(string $database, array $property): array
{
    return test()->postJson("/api/databases/{$database}/properties", ['property' => $property])
        ->assertCreated()
        ->json('data');
}

const STATUS = [
    'id' => 'st', 'name' => 'Statut', 'type' => 'status', 'options' => [
        ['id' => 'todo', 'name' => 'À faire', 'color' => 'gray', 'group' => 'todo'],
        ['id' => 'doing', 'name' => 'En cours', 'color' => 'blue', 'group' => 'in_progress'],
        ['id' => 'done', 'name' => 'Terminé', 'color' => 'green', 'group' => 'complete'],
    ],
];

it('crée une base avec le Titre, une vue Tableau et trois lignes vides (spec 6.4)', function () {
    $workspace = signIn();
    $response = createDatabase($workspace);
    $database = $response['data'];

    expect($database['schema'])->toBe([['id' => 'title', 'name' => 'Nom', 'type' => 'title']])
        ->and($database['views'])->toHaveCount(1)
        ->and($database['views'][0])->toMatchArray(['name' => 'Tableau', 'type' => 'table'])
        ->and($database['rows'])->toHaveCount(3)
        ->and($database['rows'][0]['properties'])->toBe([]);

    // Les lignes sont des pages, mais pas des pages de l'arbre.
    $tree = $this->getJson("/api/workspaces/{$workspace->id}/pages")->json('data');
    expect(collect($tree)->pluck('id'))->not->toContain($database['rows'][0]['id']);

    // La configuration vide d'une vue est un objet JSON, pas une liste.
    $raw = $this->getJson("/api/databases/{$database['id']}")->getContent();
    expect($raw)->toContain('"config":{}')->toContain('"properties":{}');
});

it('crée une base en pleine page : une sous-page dont elle est le contenu', function () {
    $workspace = signIn();
    $response = createDatabase($workspace, ['full_page' => true, 'title' => 'Lectures']);

    expect($response['page']['title'])->toBe('Lectures')
        ->and($response['page']['content'][0]['type'])->toBe('database')
        ->and($response['page']['content'][0]['props']['databaseId'])->toBe($response['data']['id'])
        ->and($response['data']['page_id'])->toBe($response['page']['id']);
});

it('critère 6.4 : une propriété Date ajoutée à 5 lignes, une date renseignée, relue dans la base', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];
    $this->postJson("/api/databases/{$database['id']}/rows", ['title' => 'Quatre'])->assertCreated();
    $this->postJson("/api/databases/{$database['id']}/rows", ['title' => 'Cinq'])->assertCreated();

    $schema = addProperty($database['id'], ['id' => 'due', 'name' => 'Échéance', 'type' => 'date'])['schema'];
    expect(collect($schema)->pluck('name'))->toContain('Échéance');

    $rows = $this->getJson("/api/databases/{$database['id']}")->json('data.rows');
    expect($rows)->toHaveCount(5);
    $this->patchJson("/api/pages/{$rows[4]['id']}", ['properties' => ['due' => ['start' => '2026-11-20']]])
        ->assertOk()
        ->assertJsonPath('data.properties.due.start', '2026-11-20');

    $rows = $this->getJson("/api/databases/{$database['id']}")->json('data.rows');
    expect($rows[4]['properties'])->toBe(['due' => ['start' => '2026-11-20']])
        ->and($rows[0]['properties'])->toBe([]);
    $this->getJson("/api/pages/{$rows[4]['id']}")->assertJsonPath('data.database_id', $database['id']);
});

it('refuse côté API les valeurs invalides, avec les mêmes exemples que le front', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];
    $fixture = json_decode(file_get_contents(base_path('../../packages/shared/fixtures/property-values.json')), true);
    foreach ($fixture['properties'] as $property) {
        addProperty($database['id'], $property);
    }

    foreach ($fixture['cases'] as $case) {
        $id = $fixture['properties'][$case['property']]['id'];
        $response = $this->postJson("/api/databases/{$database['id']}/rows", ['properties' => [$id => $case['value']]]);
        expect($response->status())->toBe($case['valid'] ? 201 : 422, $case['property'].' = '.json_encode($case['value']));
    }
});

it('refuse une propriété inconnue, et le Titre parmi les valeurs', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];
    $row = $database['rows'][0]['id'];

    $this->patchJson("/api/pages/{$row}", ['properties' => ['nope' => 'x']])
        ->assertUnprocessable()
        ->assertJsonPath('errors', fn (array $errors) => isset($errors['properties.nope']));
    $this->patchJson("/api/pages/{$row}", ['properties' => ['title' => 'x']])->assertUnprocessable();

    // Une page ordinaire n'a pas de propriétés.
    $page = $this->postJson("/api/workspaces/{$workspace->id}/pages", [])->json('data.id');
    $this->patchJson("/api/pages/{$page}", ['properties' => []])->assertUnprocessable();
});

it('garde un texte vide et les espaces d’une valeur', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];
    addProperty($database['id'], ['id' => 'notes', 'name' => 'Notes', 'type' => 'text']);

    $this->patchJson("/api/pages/{$database['rows'][0]['id']}", ['properties' => ['notes' => '']])->assertOk();
    $this->patchJson("/api/pages/{$database['rows'][1]['id']}", ['properties' => ['notes' => ' a b ']])->assertOk();

    $rows = $this->getJson("/api/databases/{$database['id']}")->json('data.rows');
    expect($rows[0]['properties']['notes'])->toBe('')->and($rows[1]['properties']['notes'])->toBe(' a b ');
});

it('une nouvelle ligne reçoit les valeurs héritées de la vue (spec 6.6)', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];
    addProperty($database['id'], STATUS);

    $this->postJson("/api/databases/{$database['id']}/rows", ['title' => 'Tâche', 'properties' => ['st' => 'doing']])
        ->assertCreated()
        ->assertJsonPath('data.properties.st', 'doing')
        ->assertJsonPath('data.title', 'Tâche');
});

it('changer de type convertit les valeurs qui ont un sens', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];
    [$a, $b, $c] = array_column($database['rows'], 'id');
    addProperty($database['id'], ['id' => 'p', 'name' => 'Valeur', 'type' => 'text']);
    $this->patchJson("/api/pages/{$a}", ['properties' => ['p' => '12,5']]);
    $this->patchJson("/api/pages/{$b}", ['properties' => ['p' => 'Urgent']]);

    // Texte → nombre : « 12,5 » devient 12.5, « Urgent » devient vide.
    $this->patchJson("/api/databases/{$database['id']}/properties/p", ['property' => ['name' => 'Valeur', 'type' => 'number']])->assertOk();
    $rows = collect($this->getJson("/api/databases/{$database['id']}")->json('data.rows'))->keyBy('id');
    expect($rows[$a]['properties']['p'])->toBe(12.5)->and($rows[$b]['properties']['p'])->toBeNull();

    // Texte → sélection : les textes deviennent des options.
    $this->patchJson("/api/databases/{$database['id']}/properties/p", ['property' => ['name' => 'Valeur', 'type' => 'text']]);
    $this->patchJson("/api/pages/{$c}", ['properties' => ['p' => 'Urgent']]);
    $schema = $this->patchJson("/api/databases/{$database['id']}/properties/p", ['property' => ['name' => 'Valeur', 'type' => 'select', 'options' => []]])
        ->assertOk()
        ->json('data.schema');
    $option = collect($schema)->firstWhere('id', 'p')['options'];
    expect(collect($option)->pluck('name')->all())->toContain('Urgent', '12.5');
    $rows = collect($this->getJson("/api/databases/{$database['id']}")->json('data.rows'))->keyBy('id');
    expect($rows[$c]['properties']['p'])->toBe(collect($option)->firstWhere('name', 'Urgent')['id']);

    // Sélection → sélection multiple : l'option reste.
    $this->patchJson("/api/databases/{$database['id']}/properties/p", ['property' => ['name' => 'Valeur', 'type' => 'multi_select', 'options' => $option]]);
    $rows = collect($this->getJson("/api/databases/{$database['id']}")->json('data.rows'))->keyBy('id');
    expect($rows[$c]['properties']['p'])->toBe([collect($option)->firstWhere('name', 'Urgent')['id']]);
});

it('supprimer une option vide la valeur des lignes qui l’avaient', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];
    addProperty($database['id'], STATUS);
    $row = $database['rows'][0]['id'];
    $this->patchJson("/api/pages/{$row}", ['properties' => ['st' => 'done']])->assertOk();

    $options = array_slice(STATUS['options'], 0, 2);
    $this->patchJson("/api/databases/{$database['id']}/properties/st", ['property' => [...STATUS, 'options' => $options]])->assertOk();

    expect($this->getJson("/api/databases/{$database['id']}")->json('data.rows.0.properties.st'))->toBeNull();
});

it('supprimer une propriété retire ses valeurs et ses traces dans les vues', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];
    addProperty($database['id'], STATUS);
    $view = $database['views'][0]['id'];
    $this->patchJson("/api/pages/{$database['rows'][0]['id']}", ['properties' => ['st' => 'todo']]);
    $this->patchJson("/api/views/{$view}", ['config' => [
        'filters' => ['operator' => 'and', 'rules' => [['property' => 'st', 'op' => 'is', 'value' => 'todo']]],
        'sorts' => [['property' => 'st', 'direction' => 'asc'], ['property' => 'title', 'direction' => 'desc']],
        'group_by' => ['property' => 'st'],
        'visible_properties' => ['title', 'st'],
        'property_widths' => ['st' => 200],
    ]])->assertOk();

    $this->deleteJson("/api/databases/{$database['id']}/properties/st")->assertOk();
    $this->deleteJson("/api/databases/{$database['id']}/properties/title")->assertUnprocessable();

    $detail = $this->getJson("/api/databases/{$database['id']}")->json('data');
    expect($detail['rows'][0]['properties'])->toBe([])
        ->and($detail['views'][0]['config'])->toEqual([
            'filters' => ['operator' => 'and', 'rules' => []],
            'sorts' => [['property' => 'title', 'direction' => 'desc']],
            'group_by' => null,
            'visible_properties' => ['title'],
            'property_widths' => [],
        ]);
});

it('une propriété ajoutée apparaît dans les vues qui listent leurs colonnes', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];
    $view = $database['views'][0]['id'];
    $this->patchJson("/api/views/{$view}", ['config' => ['visible_properties' => ['title']]])->assertOk();

    addProperty($database['id'], ['id' => 'notes', 'name' => 'Notes', 'type' => 'text']);

    expect($this->getJson("/api/databases/{$database['id']}")->json('data.views.0.config.visible_properties'))
        ->toBe(['title', 'notes']);
});

it('refuse une définition de propriété invalide', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];
    $id = $database['id'];

    foreach ([
        ['id' => 'x', 'name' => '', 'type' => 'text'],
        ['id' => 'x y', 'name' => 'X', 'type' => 'text'],
        ['id' => 'x', 'name' => 'X', 'type' => 'formula'],
        ['id' => 'x', 'name' => 'X', 'type' => 'title'],
        ['id' => 'title', 'name' => 'Doublon', 'type' => 'text'],
        ['id' => 'x', 'name' => 'X', 'type' => 'select', 'options' => [['id' => 'a', 'name' => 'A', 'color' => 'fuchsia']]],
        ['id' => 'x', 'name' => 'X', 'type' => 'status', 'options' => [['id' => 'a', 'name' => 'A', 'color' => 'gray']]],
    ] as $property) {
        $this->postJson("/api/databases/{$id}/properties", ['property' => $property])->assertUnprocessable();
    }
    $this->patchJson("/api/databases/{$id}/properties/title", ['property' => ['name' => 'Tâche', 'type' => 'text']])->assertUnprocessable();
    $this->patchJson("/api/databases/{$id}/properties/title", ['property' => ['name' => 'Tâche', 'type' => 'title']])
        ->assertOk()
        ->assertJsonPath('data.schema.0.name', 'Tâche');
});

it('critère 6.5 : trois vues de types différents sur les mêmes données', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];

    $this->postJson("/api/databases/{$database['id']}/views", ['name' => 'Liste', 'type' => 'list'])->assertCreated();
    $this->postJson("/api/databases/{$database['id']}/views", ['name' => 'Galerie', 'type' => 'gallery', 'config' => ['card_size' => 'large']])
        ->assertCreated()
        ->assertJsonPath('data.config.card_size', 'large');

    $views = $this->getJson("/api/databases/{$database['id']}")->json('data.views');
    expect(array_column($views, 'type'))->toBe(['table', 'list', 'gallery']);
    // Les lignes ne sont stockées qu'une fois : les vues n'en sont que des configurations (P6).
    expect(Page::query()->where('database_id', $database['id'])->count())->toBe(3);
});

it('valide la configuration d’une vue et ne garde que les clés connues', function () {
    $workspace = signIn();
    $view = createDatabase($workspace)['data']['views'][0]['id'];

    $this->patchJson("/api/views/{$view}", ['config' => ['sorts' => [['property' => 'title', 'direction' => 'up']]]])->assertUnprocessable();
    $this->patchJson("/api/views/{$view}", ['config' => ['filters' => ['operator' => 'xor', 'rules' => []]]])->assertUnprocessable();
    $this->patchJson("/api/views/{$view}", ['config' => ['filters' => ['operator' => 'and', 'rules' => [['property' => 'title', 'op' => 'matches']]]]])->assertUnprocessable();
    $this->patchJson("/api/views/{$view}", ['config' => ['property_widths' => ['title' => 20]]])->assertUnprocessable();

    $this->patchJson("/api/views/{$view}", ['config' => ['open_pages_in' => 'center_modal', 'pirate' => true]])
        ->assertOk()
        ->assertJsonPath('data.config', ['open_pages_in' => 'center_modal']);
});

it('renomme, duplique et supprime une vue, mais garde toujours la dernière', function () {
    $workspace = signIn();
    $view = createDatabase($workspace)['data']['views'][0]['id'];

    $this->patchJson("/api/views/{$view}", ['name' => 'Tout'])->assertOk()->assertJsonPath('data.name', 'Tout');
    $copy = $this->postJson("/api/views/{$view}/duplicate")->assertCreated()->assertJsonPath('data.name', 'Tout (copie)')->json('data.id');

    $this->deleteJson("/api/views/{$copy}")->assertOk();
    $this->deleteJson("/api/views/{$view}")->assertUnprocessable()->assertJsonPath('message', 'Une base garde au moins une vue.');
});

it('isole les bases, leurs vues et leurs lignes d’un autre utilisateur (404)', function () {
    $alice = signIn('Alice');
    $database = createDatabase($alice)['data'];
    $row = $database['rows'][0]['id'];
    $view = $database['views'][0]['id'];
    $alicePage = $database['page_id'];

    $bob = signIn('Bob');
    $this->getJson("/api/databases/{$database['id']}")->assertNotFound();
    $this->patchJson("/api/databases/{$database['id']}", ['title' => 'Piratée'])->assertNotFound();
    $this->postJson("/api/databases/{$database['id']}/rows", [])->assertNotFound();
    $this->postJson("/api/databases/{$database['id']}/properties", ['property' => ['id' => 'x', 'name' => 'X', 'type' => 'text']])->assertNotFound();
    $this->patchJson("/api/databases/{$database['id']}/properties/title", ['property' => ['name' => 'X', 'type' => 'title']])->assertNotFound();
    $this->deleteJson("/api/databases/{$database['id']}/properties/title")->assertNotFound();
    $this->postJson("/api/databases/{$database['id']}/views", ['name' => 'X', 'type' => 'table'])->assertNotFound();
    $this->patchJson("/api/views/{$view}", ['name' => 'X'])->assertNotFound();
    $this->postJson("/api/views/{$view}/duplicate")->assertNotFound();
    $this->deleteJson("/api/views/{$view}")->assertNotFound();
    $this->patchJson("/api/pages/{$row}", ['properties' => []])->assertNotFound();
    // Ni dans une page d'Alice depuis le workspace de Bob.
    $this->postJson("/api/workspaces/{$bob->id}/databases", ['page_id' => $alicePage])->assertUnprocessable();

    expect(Database::withoutGlobalScopes()->find($database['id'])->title)->toBe('')
        ->and(View::withoutGlobalScopes()->count())->toBe(1);
});

it('dupliquer une page copie ses bases, et la copie ne touche pas l’original', function () {
    $workspace = signIn();
    $database = createDatabase($workspace, ['full_page' => true])['data'];
    addProperty($database['id'], ['id' => 'notes', 'name' => 'Notes', 'type' => 'text']);
    $this->patchJson("/api/pages/{$database['rows'][0]['id']}", ['title' => 'Original', 'properties' => ['notes' => 'x']]);

    $copy = $this->postJson("/api/pages/{$database['page_id']}/duplicate")->assertCreated()->json('data');
    $copiedId = $copy['content'][0]['props']['databaseId'];
    expect($copiedId)->not->toBe($database['id']);

    $copied = $this->getJson("/api/databases/{$copiedId}")->json('data');
    expect($copied['page_id'])->toBe($copy['id'])
        ->and($copied['rows'])->toHaveCount(3)
        ->and($copied['rows'][0])->toMatchArray(['title' => 'Original', 'properties' => ['notes' => 'x']])
        ->and($copied['schema'])->toBe($this->getJson("/api/databases/{$database['id']}")->json('data.schema'));

    $this->patchJson("/api/pages/{$copied['rows'][0]['id']}", ['title' => 'Copie']);
    expect($this->getJson("/api/databases/{$database['id']}")->json('data.rows.0.title'))->toBe('Original');
});

it('les lignes partent à la corbeille avec leur page et en reviennent avec elle', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];

    $this->deleteJson("/api/pages/{$database['page_id']}")->assertOk();
    expect(Page::onlyTrashed()->where('database_id', $database['id'])->count())->toBe(3);
    // Une seule entrée dans la corbeille : la page.
    expect($this->getJson("/api/workspaces/{$workspace->id}/trash")->json('data'))->toHaveCount(1);

    $this->postJson("/api/pages/{$database['page_id']}/restore")->assertOk();
    expect($this->getJson("/api/databases/{$database['id']}")->json('data.rows'))->toHaveCount(3);
});

it('une ligne supprimée seule va à la corbeille et revient dans sa base', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];
    $row = $database['rows'][1]['id'];
    $this->patchJson("/api/pages/{$row}", ['title' => 'À retrouver']);

    $this->deleteJson("/api/pages/{$row}")->assertOk();
    expect($this->getJson("/api/databases/{$database['id']}")->json('data.rows'))->toHaveCount(2);
    expect($this->getJson("/api/workspaces/{$workspace->id}/trash")->json('data.0.title'))->toBe('À retrouver');

    $this->postJson("/api/pages/{$row}/restore")->assertOk();
    $rows = $this->getJson("/api/databases/{$database['id']}")->json('data.rows');
    expect($rows)->toHaveCount(3)->and($rows[1]['id'])->toBe($row);
});
