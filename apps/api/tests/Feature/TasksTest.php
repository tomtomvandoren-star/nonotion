<?php

use App\Models\Page;
use App\Models\Workspace;
use App\Support\Databases\Recurrence;

/*
 * La base « Tâches » (spec 6.7) : le modèle, le statut d'office des nouvelles lignes et la récurrence.
 * Les fonctions createDatabase(), addProperty() et la constante STATUS viennent de DatabaseTest.php.
 */

/** Une base de tâches et ses identifiants utiles : Statut, ses options, Échéance. */
function createTasks(Workspace $workspace): array
{
    $database = createDatabase($workspace, ['template' => 'tasks'])['data'];
    $schema = collect($database['schema']);
    $status = $schema->firstWhere('type', 'status');
    $option = fn (string $group) => collect($status['options'])->firstWhere('group', $group)['id'];

    return [
        'database' => $database,
        'status' => $status['id'],
        'todo' => $option('todo'),
        'doing' => $option('in_progress'),
        'done' => $option('complete'),
        'due' => $schema->firstWhere('type', 'date')['id'],
    ];
}

it('critère 6.7 : le Gestionnaire de tâches a ses propriétés et ses quatre vues', function () {
    $workspace = signIn();
    $tasks = createTasks($workspace);
    $database = $tasks['database'];

    expect($database['title'])->toBe('Tâches')
        ->and(collect($database['schema'])->map(fn ($p) => [$p['name'], $p['type']])->all())->toBe([
            ['Nom', 'title'], ['Statut', 'status'], ['Échéance', 'date'], ['Priorité', 'select'], ['Étiquettes', 'multi_select'],
        ])
        ->and(collect($database['schema'])->firstWhere('name', 'Priorité')['options'])->toHaveCount(3)
        ->and(collect($database['views'])->map(fn ($v) => [$v['name'], $v['type']])->all())->toBe([
            ['Tableau', 'table'], ['Aujourd’hui', 'list'], ['Par statut', 'board'], ['Calendrier', 'calendar'],
        ]);

    $today = $database['views'][1]['config'];
    expect($today['filters']['operator'])->toBe('and')
        ->and($today['filters']['rules'])->toBe([
            ['property' => $tasks['due'], 'op' => 'is', 'value' => 'today'],
            ['property' => $tasks['status'], 'op' => 'is_not', 'value' => $tasks['done']],
        ])
        ->and($database['views'][2]['config']['group_by'])->toBe(['property' => $tasks['status']])
        ->and($database['views'][3]['config']['calendar_by'])->toBe($tasks['due']);

    // Trois tâches de départ, « À faire ».
    expect($database['rows'])->toHaveCount(3)
        ->and(collect($database['rows'])->pluck("properties.{$tasks['status']}")->unique()->all())->toBe([$tasks['todo']]);
});

it('refuse un modèle inconnu', function () {
    $workspace = signIn();
    $page = $this->postJson("/api/workspaces/{$workspace->id}/pages", [])->json('data.id');

    $this->postJson("/api/workspaces/{$workspace->id}/databases", ['page_id' => $page, 'template' => 'crm'])
        ->assertUnprocessable();
});

it('une nouvelle ligne est « À faire », sauf si la vue en décide autrement', function () {
    $workspace = signIn();
    $database = createDatabase($workspace)['data'];
    addProperty($database['id'], STATUS);

    $this->postJson("/api/databases/{$database['id']}/rows", [])->assertJsonPath('data.properties.st', 'todo');
    $this->postJson("/api/databases/{$database['id']}/rows", ['properties' => ['st' => 'doing']])
        ->assertJsonPath('data.properties.st', 'doing');
    $this->postJson("/api/databases/{$database['id']}/rows", ['properties' => ['st' => null]])
        ->assertJsonPath('data.properties.st', null);
});

it('critère 6.7 : terminer une tâche récurrente crée la suivante, à faire, à la date suivante', function () {
    $workspace = signIn();
    $tasks = createTasks($workspace);
    $row = $tasks['database']['rows'][0]['id'];
    Page::query()->whereKey($row)->first()->forceFill([
        'icon' => '🧺',
        'content' => [['id' => 'b1', 'type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Lessive']]]],
    ])->save();

    $repeat = ['unit' => 'week', 'interval' => 1];
    $this->patchJson("/api/pages/{$row}", [
        'title' => 'Sortir les poubelles',
        'properties' => [$tasks['due'] => ['start' => '2026-11-05', 'repeat' => $repeat]],
    ])->assertOk()->assertJsonMissingPath('created');

    // Passer « En cours » ne crée rien.
    $this->patchJson("/api/pages/{$row}", ['properties' => [$tasks['status'] => $tasks['doing']]])
        ->assertJsonMissingPath('created');

    $response = $this->patchJson("/api/pages/{$row}", ['properties' => [$tasks['status'] => $tasks['done']]])->assertOk();

    $created = $response->json('created');
    expect($created['title'])->toBe('Sortir les poubelles')
        ->and($created['icon'])->toBe('🧺')
        ->and($created['properties'][$tasks['status']])->toBe($tasks['todo'])
        ->and($created['properties'][$tasks['due']])->toBe(['start' => '2026-11-12', 'repeat' => $repeat])
        ->and($created['position'] > $tasks['database']['rows'][0]['position'])->toBeTrue()
        ->and(Page::query()->find($created['id'])->content[0]['content'][0]['text'])->toBe('Lessive');

    // La tâche terminée garde sa date mais plus sa règle : la recocher ne crée pas de doublon.
    expect($response->json("data.properties.{$tasks['due']}"))->toBe(['start' => '2026-11-05']);
    $this->patchJson("/api/pages/{$row}", ['properties' => [$tasks['status'] => $tasks['todo']]]);
    $this->patchJson("/api/pages/{$row}", ['properties' => [$tasks['status'] => $tasks['done']]])
        ->assertJsonMissingPath('created');

    expect(Page::query()->where('database_id', $tasks['database']['id'])->count())->toBe(4);
});

it('une tâche terminée sans répétition ne crée rien', function () {
    $workspace = signIn();
    $tasks = createTasks($workspace);
    $row = $tasks['database']['rows'][0]['id'];

    $this->patchJson("/api/pages/{$row}", ['properties' => [
        $tasks['due'] => ['start' => '2026-11-05'],
        $tasks['status'] => $tasks['done'],
    ]])->assertOk()->assertJsonMissingPath('created');
});

it('refuse une règle de répétition invalide', function () {
    $workspace = signIn();
    $tasks = createTasks($workspace);
    $row = $tasks['database']['rows'][0]['id'];

    $this->patchJson("/api/pages/{$row}", ['properties' => [
        $tasks['due'] => ['start' => '2026-11-05', 'repeat' => ['unit' => 'week', 'interval' => 0]],
    ]])->assertUnprocessable();
});

it('calcule la date suivante : jours, semaines, mois (fin de mois), ans, plages et heures', function (array $value, array $expected) {
    expect(Recurrence::nextValue($value))->toBe($expected);
})->with([
    'tous les 3 jours' => [
        ['start' => '2026-12-30', 'repeat' => ['unit' => 'day', 'interval' => 3]],
        ['start' => '2027-01-02', 'repeat' => ['unit' => 'day', 'interval' => 3]],
    ],
    'toutes les 2 semaines, avec une fin' => [
        ['start' => '2026-11-05', 'end' => '2026-11-06', 'repeat' => ['unit' => 'week', 'interval' => 2]],
        ['start' => '2026-11-19', 'end' => '2026-11-20', 'repeat' => ['unit' => 'week', 'interval' => 2]],
    ],
    'tous les mois, le 31 janvier' => [
        ['start' => '2027-01-31', 'repeat' => ['unit' => 'month', 'interval' => 1]],
        ['start' => '2027-02-28', 'repeat' => ['unit' => 'month', 'interval' => 1]],
    ],
    'tous les 14 mois' => [
        ['start' => '2026-11-15', 'repeat' => ['unit' => 'month', 'interval' => 14]],
        ['start' => '2028-01-15', 'repeat' => ['unit' => 'month', 'interval' => 14]],
    ],
    'tous les ans, le 29 février' => [
        ['start' => '2028-02-29', 'repeat' => ['unit' => 'year', 'interval' => 1]],
        ['start' => '2029-02-28', 'repeat' => ['unit' => 'year', 'interval' => 1]],
    ],
    'une heure UTC' => [
        ['start' => '2026-11-05T08:30:00.000Z', 'repeat' => ['unit' => 'day', 'interval' => 1]],
        ['start' => '2026-11-06T08:30:00.000Z', 'repeat' => ['unit' => 'day', 'interval' => 1]],
    ],
    'une heure de Bruxelles, par-dessus le passage à l’heure d’été' => [
        ['start' => '2027-03-22T08:00:00.000Z', 'time_zone' => 'Europe/Brussels', 'repeat' => ['unit' => 'week', 'interval' => 1]],
        ['start' => '2027-03-29T07:00:00.000Z', 'time_zone' => 'Europe/Brussels', 'repeat' => ['unit' => 'week', 'interval' => 1]],
    ],
    'une heure avec décalage' => [
        ['start' => '2026-11-05T09:30:00+01:00', 'repeat' => ['unit' => 'month', 'interval' => 1]],
        ['start' => '2026-12-05T09:30:00+01:00', 'repeat' => ['unit' => 'month', 'interval' => 1]],
    ],
]);

it('critère 6.11 : une carte glissée change de colonne et de place', function () {
    $workspace = signIn();
    $tasks = createTasks($workspace);
    [$first, , $third] = $tasks['database']['rows'];

    // « En cours », et avant la première carte.
    $position = 'Zz';
    $this->patchJson("/api/pages/{$third['id']}", [
        'properties' => [$tasks['status'] => $tasks['doing']],
        'position' => $position,
    ])->assertOk();

    $rows = collect($this->getJson("/api/databases/{$tasks['database']['id']}")->json('data.rows'))->sortBy('position')->values();
    expect($rows[0]['id'])->toBe($third['id'])
        ->and($rows[0]['properties'][$tasks['status']])->toBe($tasks['doing'])
        ->and($first['position'] > $position)->toBeTrue();
});

it('refuse une place invalide, et une place pour une page qui n’est pas une ligne', function () {
    $workspace = signIn();
    $tasks = createTasks($workspace);
    $row = $tasks['database']['rows'][0]['id'];

    $this->patchJson("/api/pages/{$row}", ['position' => 'pas une clé'])->assertUnprocessable();
    $this->patchJson("/api/pages/{$tasks['database']['page_id']}", ['position' => 'a5'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('position');
});
