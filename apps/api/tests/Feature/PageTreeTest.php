<?php

use App\Models\Page;
use App\Models\Workspace;
use App\Support\FractionalIndex;

/** Crée une page par l'API et renvoie son identifiant. */
function createPage(Workspace $workspace, array $attributes = []): string
{
    return test()->postJson("/api/workspaces/{$workspace->id}/pages", $attributes)->assertCreated()->json('data.id');
}

/** La structure de l'arbre renvoyé à la barre latérale : titre => titre du parent, trié par titre. */
function treeOf(Workspace $workspace): array
{
    $pages = collect(test()->getJson("/api/workspaces/{$workspace->id}/pages")->assertOk()->json('data'));
    $titles = $pages->pluck('title', 'id');

    return $pages->mapWithKeys(fn (array $page) => [$page['title'] => $titles[$page['parent_page_id']] ?? null])
        ->sortKeys()
        ->all();
}

/** Les titres des sous-pages de $parentTitle (null = racine), dans l'ordre d'affichage. */
function childrenOf(Workspace $workspace, ?string $parentTitle = null): array
{
    $pages = collect(test()->getJson("/api/workspaces/{$workspace->id}/pages")->assertOk()->json('data'));
    $parentIds = $parentTitle === null ? [null] : $pages->where('title', $parentTitle)->pluck('id')->all();

    return $pages->filter(fn (array $page) => in_array($page['parent_page_id'], $parentIds, true))
        ->pluck('title')
        ->values()
        ->all();
}

it('crée trois niveaux de pages et les retrouve à l’identique', function () {
    $workspace = signIn();
    $level1 = createPage($workspace, ['title' => 'Niveau 1']);
    $level2 = createPage($workspace, ['title' => 'Niveau 2', 'parent_page_id' => $level1]);
    createPage($workspace, ['title' => 'Niveau 3', 'parent_page_id' => $level2]);

    expect(treeOf($workspace))->toBe([
        'Bienvenue dans Nonotion' => null,
        'Niveau 1' => null,
        'Niveau 2' => 'Niveau 1',
        'Niveau 3' => 'Niveau 2',
    ]);
});

it('ajoute les nouvelles pages à la fin de leur liste', function () {
    $workspace = signIn();
    createPage($workspace, ['title' => 'B']);
    createPage($workspace, ['title' => 'C']);

    expect(childrenOf($workspace))->toBe(['Bienvenue dans Nonotion', 'B', 'C']);
});

it('réordonne une page en une seule requête et garde l’ordre après rechargement', function () {
    $workspace = signIn();
    $a = createPage($workspace, ['title' => 'A']);
    $b = createPage($workspace, ['title' => 'B']);
    $welcome = Page::query()->where('title', 'Bienvenue dans Nonotion')->value('position');

    // B passe entre « Bienvenue » et A.
    $position = FractionalIndex::between($welcome, Page::find($a)->position);
    $this->postJson("/api/pages/{$b}/move", ['parent_page_id' => null, 'position' => $position])->assertOk();

    expect(childrenOf($workspace))->toBe(['Bienvenue dans Nonotion', 'B', 'A']);
});

it('déplace une page sous une autre', function () {
    $workspace = signIn();
    $a = createPage($workspace, ['title' => 'A']);
    $b = createPage($workspace, ['title' => 'B']);

    $this->postJson("/api/pages/{$b}/move", ['parent_page_id' => $a, 'position' => 'a0'])->assertOk();

    expect(treeOf($workspace)['B'])->toBe('A');
});

it('interdit de créer une boucle', function () {
    $workspace = signIn();
    $parent = createPage($workspace, ['title' => 'Parent']);
    $child = createPage($workspace, ['title' => 'Enfant', 'parent_page_id' => $parent]);
    $grandChild = createPage($workspace, ['title' => 'Petit-enfant', 'parent_page_id' => $child]);

    foreach ([$parent, $child, $grandChild] as $target) {
        $this->postJson("/api/pages/{$parent}/move", ['parent_page_id' => $target, 'position' => 'a0'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.parent_page_id.0', 'Impossible de déplacer une page dans elle-même ou dans l’une de ses sous-pages.');
    }

    expect(treeOf($workspace)['Parent'])->toBeNull();
});

it('refuse une position invalide', function () {
    $workspace = signIn();
    $page = createPage($workspace, ['title' => 'A']);

    $this->postJson("/api/pages/{$page}/move", ['parent_page_id' => null, 'position' => 'a00'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.position.0', 'La position est invalide.');
});

it('renomme une page, change son icône, sa couverture et la met en favori', function () {
    $workspace = signIn();
    $page = createPage($workspace);

    $this->patchJson("/api/pages/{$page}", [
        'title' => 'Projet',
        'icon' => '🚀',
        'cover_url' => 'preset:sauge',
        'is_favorite' => true,
    ])->assertOk()->assertJsonPath('data.title', 'Projet');

    $this->getJson("/api/pages/{$page}")
        ->assertJsonPath('data.icon', '🚀')
        ->assertJsonPath('data.cover_url', 'preset:sauge')
        ->assertJsonPath('data.is_favorite', true);

    $this->patchJson("/api/pages/{$page}", ['cover_url' => 'javascript:alert(1)'])->assertUnprocessable();
});

it('duplique une page avec ses sous-pages, juste après l’original', function () {
    $workspace = signIn();
    $page = createPage($workspace, ['title' => 'Original']);
    createPage($workspace, ['title' => 'Sous-page', 'parent_page_id' => $page]);
    createPage($workspace, ['title' => 'Suivante']);

    $this->postJson("/api/pages/{$page}/duplicate")->assertCreated()->assertJsonPath('data.title', 'Original (copie)');

    expect(childrenOf($workspace))->toBe(['Bienvenue dans Nonotion', 'Original', 'Original (copie)', 'Suivante'])
        ->and(childrenOf($workspace, 'Original'))->toBe(['Sous-page'])
        ->and(childrenOf($workspace, 'Original (copie)'))->toBe(['Sous-page']);
});
