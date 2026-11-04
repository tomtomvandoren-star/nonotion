<?php

use App\Models\Page;

it('enregistre le document, incrémente la version et extrait le texte pour la recherche', function () {
    $workspace = signIn();
    $page = createPage($workspace, ['title' => 'Notes']);

    $content = [
        ['type' => 'paragraph', 'content' => 'Première ligne'],
        ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Deuxième ', 'styles' => []], ['type' => 'link', 'href' => 'https://example.test', 'content' => [['type' => 'text', 'text' => 'ligne']]]],
            'children' => [['type' => 'paragraph', 'content' => 'Imbriquée']]],
    ];

    $this->putJson("/api/pages/{$page}/content", ['content' => $content, 'version' => 1])
        ->assertOk()
        ->assertJsonPath('data.version', 2);

    $this->getJson("/api/pages/{$page}")
        ->assertJsonPath('data.version', 2)
        ->assertJsonPath('data.content.0.content', 'Première ligne');
    expect(Page::find($page)->search_text)->toBe("Première ligne\nDeuxième ligne\nImbriquée");
});

it('répond 409 si la page a été modifiée ailleurs entre-temps (verrouillage optimiste)', function () {
    $workspace = signIn();
    $page = createPage($workspace);

    // Appareil A et appareil B ont lu la version 1 ; A enregistre en premier.
    $this->putJson("/api/pages/{$page}/content", ['content' => [['type' => 'paragraph', 'content' => 'A']], 'version' => 1])->assertOk();

    $this->putJson("/api/pages/{$page}/content", ['content' => [['type' => 'paragraph', 'content' => 'B']], 'version' => 1])
        ->assertStatus(409)
        ->assertJson(['message' => 'Cette page a été modifiée ailleurs.', 'version' => 2]);

    expect(Page::find($page)->content[0]['content'])->toBe('A');

    // « Écraser » : B renvoie avec la version actuelle.
    $this->putJson("/api/pages/{$page}/content", ['content' => [['type' => 'paragraph', 'content' => 'B']], 'version' => 2])->assertOk();
    expect(Page::find($page)->content[0]['content'])->toBe('B');
});

it('renommer une page ne change pas la version de son contenu', function () {
    $workspace = signIn();
    $page = createPage($workspace);

    $this->patchJson("/api/pages/{$page}", ['title' => 'Nouveau titre'])->assertOk();

    $this->putJson("/api/pages/{$page}/content", ['content' => null, 'version' => 1])->assertOk();
});
