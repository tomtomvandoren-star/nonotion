<?php

use App\Models\Page;
use App\Models\Workspace;
use App\Support\BlockText;
use Laravel\Sanctum\Sanctum;

/*
 * Recherche (spec 6.12). Ces tests écrivent pour de vrai (DatabaseTruncation, voir Pest.php) :
 * l'index FULLTEXT de MariaDB ne voit pas les lignes d'une transaction non validée.
 */

/** Une page avec un texte, comme si l'éditeur l'avait enregistrée. */
function pageWithText(Workspace $workspace, string $title, string $text, ?string $parent = null): Page
{
    $content = [['type' => 'paragraph', 'content' => $text]];
    $page = Page::create([
        'workspace_id' => $workspace->id,
        'parent_page_id' => $parent,
        'title' => $title,
        'content' => $content,
        'position' => 'a'.uniqid(),
    ]);
    $page->forceFill(['search_text' => BlockText::extract($content)])->save();

    return $page;
}

function search(Workspace $workspace, string $q): array
{
    return test()->getJson("/api/workspaces/{$workspace->id}/search?q=".urlencode($q))->assertOk()->json('data');
}

it('critère 6.12 : trouve une page par un mot de son contenu, avec un extrait autour du mot', function () {
    $workspace = signIn();
    $parent = pageWithText($workspace, 'Voyages', '');
    pageWithText($workspace, 'Lisbonne', 'Réserver le tramway 28 et goûter les pastéis de nata près du fleuve.', $parent->id);
    pageWithText($workspace, 'Courses', 'Pain, lait, œufs.');

    $results = search($workspace, 'pastéis');

    // Sans l'accent aussi, avec le même extrait.
    expect(search($workspace, 'pasteis')[0]['excerpt'] ?? null)->toContain('pastéis de nata')
        ->and($results)->toHaveCount(1)
        ->and($results[0]['title'])->toBe('Lisbonne')
        ->and($results[0]['context'])->toBe('Voyages')
        ->and($results[0]['excerpt'])->toContain('pastéis de nata');
});

it('trouve le début d’un mot, et plusieurs mots ensemble', function () {
    $workspace = signIn();
    pageWithText($workspace, 'Réunion projet', 'Ordre du jour : budget et calendrier.');
    pageWithText($workspace, 'Projet maison', 'Peinture du salon.');

    expect(collect(search($workspace, 'proj'))->pluck('title')->sort()->values()->all())->toBe(['Projet maison', 'Réunion projet'])
        ->and(collect(search($workspace, 'projet budget'))->pluck('title')->all())->toBe(['Réunion projet']);
});

it('les titres qui commencent par la recherche passent en premier', function () {
    $workspace = signIn();
    pageWithText($workspace, 'Notes diverses', 'Une idée de recette.');
    pageWithText($workspace, 'Recettes', 'Tarte aux pommes.');

    expect(collect(search($workspace, 'recette'))->pluck('title')->all())->toBe(['Recettes', 'Notes diverses']);
});

it('une recherche courte (moins de 3 lettres) cherche dans les titres', function () {
    $workspace = signIn();
    pageWithText($workspace, 'TV et films', 'À voir ce week-end.');
    pageWithText($workspace, 'Courses', 'Acheter une tv ?');

    expect(collect(search($workspace, 'tv'))->pluck('title')->all())->toBe(['TV et films']);
});

it('trouve les lignes des bases, avec le nom de leur base', function () {
    $workspace = signIn();
    $host = $this->postJson("/api/workspaces/{$workspace->id}/pages", ['title' => 'Maison'])->json('data.id');
    $database = $this->postJson("/api/workspaces/{$workspace->id}/databases", ['page_id' => $host, 'template' => 'tasks'])->json('data');
    $this->patchJson("/api/pages/{$database['rows'][0]['id']}", ['title' => 'Arroser les plantes'])->assertOk();

    expect(search($workspace, 'arroser'))->sequence(fn ($result) => $result
        ->title->toBe('Arroser les plantes')
        ->context->toBe('Tâches')
        ->database_id->toBe($database['id']));
});

it('ignore la corbeille et les pages des autres', function () {
    $alice = createAccount('Alice');
    $bruno = createAccount('Bruno');
    pageWithText(workspaceOf($alice), 'Jardin', 'Planter des tomates.')->delete();
    pageWithText(workspaceOf($bruno), 'Potager', 'Planter des tomates cerises.');

    Sanctum::actingAs($alice);
    expect(search(workspaceOf($alice), 'tomates'))->toBe([]);
    $this->getJson('/api/workspaces/'.workspaceOf($bruno)->id.'/search?q=tomates')->assertNotFound();
});

it('les caractères spéciaux ne cassent pas la recherche', function () {
    $workspace = signIn();
    pageWithText($workspace, '100 % bio', 'Légumes de saison.');

    expect(collect(search($workspace, '100 %'))->pluck('title')->all())->toBe(['100 % bio'])
        ->and(search($workspace, '+-*"<>()~'))->toBe([]);
});
