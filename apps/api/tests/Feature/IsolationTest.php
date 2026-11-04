<?php

use App\Models\Page;
use App\Models\Workspace;

/*
| Isolation des données (spec 1.3.9 et 8) : un utilisateur ne peut jamais lire ni modifier
| les données d'un autre. Les pages d'autrui n'existent pas pour lui (404).
*/

beforeEach(function () {
    $alice = createAccount('Alice');
    $this->aliceWorkspace = workspaceOf($alice);
    $this->alicePage = Page::query()->withoutGlobalScopes()->where('workspace_id', $this->aliceWorkspace->id)->value('id');
    $this->aliceTrashed = Page::create([
        'workspace_id' => $this->aliceWorkspace->id, 'title' => 'Secret', 'position' => 'a5',
    ]);
    $this->aliceTrashed->delete();

    // Bob est connecté pour toute la suite.
    $this->bobWorkspace = signIn('Bob');
    $this->bobPage = Page::query()->where('workspace_id', $this->bobWorkspace->id)->value('id');
});

it('ne laisse pas lire les pages ni la corbeille d’un autre workspace', function () {
    $this->getJson("/api/workspaces/{$this->aliceWorkspace->id}/pages")->assertNotFound();
    $this->getJson("/api/workspaces/{$this->aliceWorkspace->id}/trash")->assertNotFound();
    $this->getJson("/api/pages/{$this->alicePage}")->assertNotFound();
});

it('ne laisse pas modifier, déplacer, dupliquer ni supprimer la page d’un autre', function () {
    $this->patchJson("/api/pages/{$this->alicePage}", ['title' => 'Piraté'])->assertNotFound();
    $this->putJson("/api/pages/{$this->alicePage}/content", ['content' => [], 'version' => 1])->assertNotFound();
    $this->postJson("/api/pages/{$this->alicePage}/move", ['parent_page_id' => null, 'position' => 'a0'])->assertNotFound();
    $this->postJson("/api/pages/{$this->alicePage}/duplicate")->assertNotFound();
    $this->deleteJson("/api/pages/{$this->alicePage}")->assertNotFound();
    $this->postJson("/api/pages/{$this->aliceTrashed->id}/restore")->assertNotFound();
    $this->deleteJson("/api/pages/{$this->aliceTrashed->id}/permanent")->assertNotFound();

    $page = Page::query()->withoutGlobalScopes()->find($this->alicePage);
    expect($page->title)->toBe('Bienvenue dans Nonotion')
        ->and($page->deleted_at)->toBeNull()
        ->and(Page::query()->withoutGlobalScopes()->withTrashed()->find($this->aliceTrashed->id)->trashed())->toBeTrue();
});

it('ne laisse pas créer de page chez un autre, ni rattacher une page à la sienne', function () {
    $this->postJson("/api/workspaces/{$this->aliceWorkspace->id}/pages", ['title' => 'Intrus'])->assertNotFound();

    // Bob ne peut pas créer chez lui une page dont la parente appartient à Alice…
    $this->postJson("/api/workspaces/{$this->bobWorkspace->id}/pages", ['parent_page_id' => $this->alicePage])
        ->assertUnprocessable()
        ->assertJsonPath('errors.parent_page_id.0', 'La page parente est introuvable.');

    // … ni déplacer sa page sous celle d'Alice.
    $this->postJson("/api/pages/{$this->bobPage}/move", ['parent_page_id' => $this->alicePage, 'position' => 'a0'])
        ->assertUnprocessable();

    expect(Page::query()->withoutGlobalScopes()->where('workspace_id', $this->aliceWorkspace->id)->withTrashed()->count())->toBe(2);
});

it('ne montre à chacun que ses propres workspaces', function () {
    $this->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonCount(1, 'workspaces')
        ->assertJsonPath('workspaces.0.id', $this->bobWorkspace->id);

    expect(Workspace::query()->pluck('id')->all())->toBe([$this->bobWorkspace->id]);
});
