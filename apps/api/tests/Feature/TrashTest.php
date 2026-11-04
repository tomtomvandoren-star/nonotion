<?php

use App\Http\Controllers\TrashController;
use App\Models\Page;
use Illuminate\Support\Facades\DB;

it('met une page et ses sous-pages à la corbeille, puis les restaure ensemble', function () {
    $workspace = signIn();
    $parent = createPage($workspace, ['title' => 'Parent']);
    createPage($workspace, ['title' => 'Enfant', 'parent_page_id' => $parent]);

    $this->deleteJson("/api/pages/{$parent}")->assertOk();

    expect(treeOf($workspace))->toBe(['Bienvenue dans Nonotion' => null]);
    // Seule la page « en tête » est listée : l'enfant reviendra avec elle.
    $this->getJson("/api/workspaces/{$workspace->id}/trash")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.title', 'Parent');

    $this->postJson("/api/pages/{$parent}/restore")->assertOk();

    expect(treeOf($workspace))->toBe(['Bienvenue dans Nonotion' => null, 'Enfant' => 'Parent', 'Parent' => null]);
    $this->getJson("/api/workspaces/{$workspace->id}/trash")->assertJsonCount(0, 'data');
});

it('restaure à la racine une sous-page dont la parente est encore à la corbeille', function () {
    $workspace = signIn();
    $parent = createPage($workspace, ['title' => 'Parent']);
    $child = createPage($workspace, ['title' => 'Enfant', 'parent_page_id' => $parent]);

    $this->deleteJson("/api/pages/{$child}")->assertOk();
    $this->travel(5)->seconds();
    $this->deleteJson("/api/pages/{$parent}")->assertOk();

    $this->postJson("/api/pages/{$child}/restore")->assertOk()->assertJsonPath('data.parent_page_id', null);

    expect(treeOf($workspace))->toBe(['Bienvenue dans Nonotion' => null, 'Enfant' => null]);
});

it('supprime définitivement depuis la corbeille, sous-pages comprises', function () {
    $workspace = signIn();
    $parent = createPage($workspace, ['title' => 'Parent']);
    createPage($workspace, ['title' => 'Enfant', 'parent_page_id' => $parent]);

    $this->deleteJson("/api/pages/{$parent}/permanent")->assertStatus(422);
    $this->deleteJson("/api/pages/{$parent}")->assertOk();
    $this->deleteJson("/api/pages/{$parent}/permanent")->assertOk();

    expect(DB::table('pages')->whereIn('title', ['Parent', 'Enfant'])->count())->toBe(0);
});

it('purge la corbeille après 30 jours', function () {
    $workspace = signIn();
    $old = createPage($workspace, ['title' => 'Ancienne']);
    $recent = createPage($workspace, ['title' => 'Récente']);

    $this->deleteJson("/api/pages/{$old}")->assertOk();
    $this->travel(20)->days();
    $this->deleteJson("/api/pages/{$recent}")->assertOk();
    $this->travel(11)->days();

    expect(TrashController::purgeExpired())->toBe(1)
        ->and(Page::withTrashed()->find($old))->toBeNull()
        ->and(Page::withTrashed()->find($recent))->not->toBeNull();
});
