<?php

use App\Models\Workspace;
use App\Support\Calendars\SafeFetcher;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

/*
 * La page « Agenda » de l'espace de travail (spec 6.15) : les bases qu'elle peut réunir, les agendas,
 * et ses réglages (ce qui est masqué, les couleurs, la base des nouveaux éléments).
 */

beforeEach(function () {
    Carbon::setTestNow('2026-11-05 10:00:00');
    app()->instance(SafeFetcher::class, new SafeFetcher(fn (string $host) => ['93.184.216.34']));
});

/** Une page « $title » qui contient une base (Gestionnaire de tâches si $tasks). */
function agendaBase(Workspace $workspace, string $title, bool $tasks = false): array
{
    $page = test()->postJson("/api/workspaces/{$workspace->id}/pages", ['title' => $title])->json('data.id');

    return test()->postJson("/api/workspaces/{$workspace->id}/databases", [
        'page_id' => $page,
        ...($tasks ? ['template' => 'tasks'] : []),
    ])->json('data');
}

it('liste les bases qui ont une Date, avec la Date de leur calendrier, et les agendas importés', function () {
    $workspace = signIn();
    $tasks = agendaBase($workspace, 'Travail', tasks: true);
    agendaBase($workspace, 'Sans date');
    $due = collect($tasks['schema'])->firstWhere('name', 'Échéance')['id'];

    $agenda = $this->getJson("/api/workspaces/{$workspace->id}/agenda")->assertOk()->json('data');

    expect($agenda['databases'])->toHaveCount(1)
        ->and($agenda['databases'][0])->toMatchArray(['id' => $tasks['id'], 'date_property' => $due, 'imported_only' => false])
        ->and($agenda['settings'])->toBe([
            'hidden_databases' => [],
            'hidden_sources' => [],
            'colors' => [],
            'default_database_id' => null,
        ])
        ->and($agenda['sources'])->toBe([]);
});

it('garde ce qui est masqué, les couleurs et la base des nouveaux éléments ; oublie ce qui n’existe plus', function () {
    $workspace = signIn();
    $tasks = agendaBase($workspace, 'Travail', tasks: true);
    $other = agendaBase($workspace, 'Perso', tasks: true);

    $this->patchJson("/api/workspaces/{$workspace->id}/agenda", [
        'hidden_databases' => [$other['id'], 'inconnue'],
        'colors' => [$tasks['id'] => 'purple'],
        'default_database_id' => $tasks['id'],
    ])->assertOk()
        ->assertJsonPath('data.settings.hidden_databases', [$other['id']])
        ->assertJsonPath('data.settings.colors', [$tasks['id'] => 'purple'])
        ->assertJsonPath('data.settings.default_database_id', $tasks['id']);

    // Un réglage partiel ne touche pas aux autres.
    $this->patchJson("/api/workspaces/{$workspace->id}/agenda", ['hidden_databases' => []])
        ->assertJsonPath('data.settings.colors', [$tasks['id'] => 'purple']);

    // La base des nouveaux éléments part à la corbeille : elle n'est plus proposée.
    $this->deleteJson("/api/pages/{$tasks['page_id']}")->assertOk();
    $agenda = $this->getJson("/api/workspaces/{$workspace->id}/agenda")->json('data');
    expect(array_column($agenda['databases'], 'id'))->toBe([$other['id']])
        ->and($agenda['settings']['default_database_id'])->toBeNull()
        ->and($agenda['settings']['colors'])->toBe([]);
});

it('refuse une couleur inconnue, et l’Agenda d’un autre', function () {
    $workspace = signIn();
    $this->patchJson("/api/workspaces/{$workspace->id}/agenda", ['colors' => ['x' => 'fluo']])
        ->assertJsonValidationErrors('colors.x');

    // L'espace d'un autre n'existe pas pour lui (isolation, spec 8).
    signIn('Bruno');
    $this->getJson("/api/workspaces/{$workspace->id}/agenda")->assertNotFound();
    $this->patchJson("/api/workspaces/{$workspace->id}/agenda", ['hidden_sources' => []])->assertNotFound();
});

it('un agenda importé depuis l’Agenda peut créer sa base au premier niveau de l’espace', function () {
    Http::fake(['agenda.example.com/*' => Http::response(file_get_contents(base_path('../../fixtures/sample.ics')))]);
    $workspace = signIn();

    $response = $this->postJson('/api/calendar-sources', [
        'url' => 'https://agenda.example.com/secret-token/basic.ics',
        'name' => 'École',
        'color' => 'green',
        'mode' => 'subscription',
        'workspace_id' => $workspace->id,
        'time_zone' => 'Europe/Brussels',
    ])->assertCreated()->json();

    expect($response['page']['parent_page_id'])->toBeNull()
        ->and($response['page']['title'])->toBe('École')
        ->and($response['imported'])->toBe(25);
    $agenda = $this->getJson("/api/workspaces/{$workspace->id}/agenda")->json('data');
    // La base créée pour l'import ne contient que ses événements : « Mes agendas » la montre par son agenda.
    $base = collect($agenda['databases'])->firstWhere('id', $response['database']['id']);
    expect($agenda['sources'][0]['name'])->toBe('École')
        ->and($base['imported_only'])->toBeTrue();
    // L'UID de chaque événement : l'Agenda ne montre qu'une fois un événement présent dans deux agendas.
    expect(collect($response['database']['rows'])->pluck('ics_uid')->filter())->not->toBeEmpty();

    // Pas dans l'espace d'un autre.
    signIn('Bruno');
    $this->postJson('/api/calendar-sources', [
        'url' => 'https://agenda.example.com/autre.ics',
        'name' => 'Intrus',
        'color' => 'green',
        'mode' => 'subscription',
        'workspace_id' => $workspace->id,
    ])->assertNotFound();
});
