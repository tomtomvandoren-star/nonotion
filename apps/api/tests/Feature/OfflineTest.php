<?php

use App\Models\Page;
use App\Models\Workspace;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

/*
 * Travail hors ligne des applications natives (spec 6.16) : identifiants choisis par l'appareil
 * pour les créations (sans doublon quand un envoi est répété), et copie incrémentale de l'espace.
 */

const OFFLINE_PAGE_ID = '01m7e0aaaaaaaaaaaaaaaaaaaa';
const OFFLINE_ROW_ID = '01m7e0bbbbbbbbbbbbbbbbbbbb';
const OFFLINE_VIEW_ID = '01m7e0cccccccccccccccccccc';

/** Une page avec une base de tâches ; renvoie la base. */
function offlineTasks(Workspace $workspace): array
{
    $page = test()->postJson("/api/workspaces/{$workspace->id}/pages", ['title' => 'Projet'])->json('data.id');

    return test()->postJson("/api/workspaces/{$workspace->id}/databases", ['page_id' => $page, 'template' => 'tasks'])->json('data');
}

it('une page créée hors ligne garde son identifiant, et le même envoi répété ne crée pas de doublon', function () {
    $workspace = signIn();
    $payload = ['id' => OFFLINE_PAGE_ID, 'title' => 'Écrite dans le train'];

    $this->postJson("/api/workspaces/{$workspace->id}/pages", $payload)
        ->assertCreated()
        ->assertJsonPath('data.id', OFFLINE_PAGE_ID);
    $this->postJson("/api/workspaces/{$workspace->id}/pages", $payload)
        ->assertOk()
        ->assertJsonPath('data.id', OFFLINE_PAGE_ID);

    expect(Page::query()->where('title', 'Écrite dans le train')->count())->toBe(1);
});

it('une ligne et une vue créées hors ligne aussi ; une copie de vue aussi', function () {
    $workspace = signIn();
    $database = offlineTasks($workspace);

    foreach ([201, 200] as $status) {
        $this->postJson("/api/databases/{$database['id']}/rows", ['id' => OFFLINE_ROW_ID, 'title' => 'Acheter du pain'])
            ->assertStatus($status)
            ->assertJsonPath('data.id', OFFLINE_ROW_ID);
        $this->postJson("/api/databases/{$database['id']}/views", ['id' => OFFLINE_VIEW_ID, 'name' => 'Semaine', 'type' => 'table'])
            ->assertStatus($status)
            ->assertJsonPath('data.id', OFFLINE_VIEW_ID);
    }
    $copy = '01m7e0dddddddddddddddddddd';
    $this->postJson('/api/views/'.OFFLINE_VIEW_ID.'/duplicate', ['id' => $copy])->assertCreated()->assertJsonPath('data.id', $copy);
    $this->postJson('/api/views/'.OFFLINE_VIEW_ID.'/duplicate', ['id' => $copy])->assertOk();

    $detail = $this->getJson("/api/databases/{$database['id']}")->json('data');
    expect(collect($detail['rows'])->where('title', 'Acheter du pain'))->toHaveCount(1)
        ->and(collect($detail['views'])->pluck('id')->filter(fn ($id) => in_array($id, [OFFLINE_VIEW_ID, $copy], true)))->toHaveCount(2);
});

it('refuse un identifiant mal formé, ou déjà pris dans l’espace d’un autre', function () {
    $alice = signIn('Alice');
    $this->postJson("/api/workspaces/{$alice->id}/pages", ['id' => OFFLINE_PAGE_ID])->assertCreated();

    $this->postJson("/api/workspaces/{$alice->id}/pages", ['id' => 'pas-un-ulid'])->assertUnprocessable();

    $bob = createAccount('Bob');
    Sanctum::actingAs($bob);
    $this->postJson('/api/workspaces/'.workspaceOf($bob)->id.'/pages', ['id' => OFFLINE_PAGE_ID, 'title' => 'Intrus'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.id.0', 'Cet identifiant est déjà utilisé.');
    expect(Page::query()->withoutGlobalScopes()->find(OFFLINE_PAGE_ID)->title)->toBe('');
});

it('la copie de l’espace : tout la première fois, puis seulement ce qui a changé', function () {
    Carbon::setTestNow('2026-11-14 09:00:00');
    $workspace = signIn();
    $database = offlineTasks($workspace);
    $gone = $this->postJson("/api/workspaces/{$workspace->id}/pages", ['title' => 'À jeter'])->json('data.id');

    Carbon::setTestNow('2026-11-14 10:00:00');
    $first = $this->getJson("/api/workspaces/{$workspace->id}/offline")->assertOk()->json('data');
    $pageCount = Page::query()->where('workspace_id', $workspace->id)->count();
    expect($first['pages'])->toHaveCount($pageCount)
        ->and($first['databases'])->toHaveCount(1)
        ->and($first['page_ids'])->toHaveCount($pageCount)
        ->and($first['pages'][0])->toHaveKeys(['id', 'content', 'version'])
        // L'Agenda et la corbeille viennent avec : ils s'ouvrent aussi hors ligne.
        ->and($first['agenda']['databases'])->toHaveCount(1)
        ->and($first['trash'])->toBe([]);

    // Une heure plus tard : une page modifiée, une ligne ajoutée, une page à la corbeille.
    Carbon::setTestNow('2026-11-14 11:00:00');
    $note = collect($first['pages'])->where('database_id', null)
        ->firstWhere(fn (array $page) => ! in_array($page['id'], [$database['page_id'], $gone], true))['id'];
    $this->patchJson("/api/pages/{$note}", ['title' => 'Renommée'])->assertOk();
    $this->postJson("/api/databases/{$database['id']}/rows", ['title' => 'Nouvelle tâche'])->assertCreated();
    $this->deleteJson("/api/pages/{$gone}")->assertOk();

    Carbon::setTestNow('2026-11-14 11:30:00');
    $next = $this->getJson("/api/workspaces/{$workspace->id}/offline?since=".urlencode($first['server_time']))
        ->assertOk()->json('data');
    $titles = collect($next['pages'])->pluck('title');
    expect($titles)->toContain('Renommée')->toContain('Nouvelle tâche')
        ->and(count($next['pages']))->toBeLessThan($pageCount)
        ->and($next['databases'])->toHaveCount(1)
        ->and($next['page_ids'])->not->toContain($gone)
        ->and(collect($next['trash'])->pluck('id'))->toContain($gone);

    // Rien n'a bougé depuis : rien à renvoyer, sauf les listes.
    Carbon::setTestNow('2026-11-14 12:00:00');
    $quiet = $this->getJson("/api/workspaces/{$workspace->id}/offline?since=".urlencode($next['server_time']))->json('data');
    expect($quiet['pages'])->toBe([])->and($quiet['databases'])->toBe([]);
});

it('la copie ne contient jamais l’espace d’un autre', function () {
    $alice = signIn('Alice');
    offlineTasks($alice);
    Sanctum::actingAs(createAccount('Bob'));

    $this->getJson("/api/workspaces/{$alice->id}/offline")->assertNotFound();
});
