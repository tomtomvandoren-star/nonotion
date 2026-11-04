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

it('extrait le texte d’un document de l’éditeur de blocs (titres, to-do, code, encadré)', function () {
    $workspace = signIn();
    $page = createPage($workspace);

    // Forme exacte de ce qu'envoie BlockNote (identifiants, propriétés par défaut, styles).
    $text = fn (string $value, array $styles = []) => ['type' => 'text', 'text' => $value, 'styles' => $styles];
    $block = fn (string $type, array $content, array $props = [], array $children = []) => [
        'id' => fake()->uuid(), 'type' => $type, 'props' => $props, 'content' => $content, 'children' => $children,
    ];
    $content = [
        $block('heading', [$text('Plan')], ['level' => 1, 'textColor' => 'default']),
        $block('checkListItem', [$text('Réviser', ['bold' => true])], ['checked' => true], [
            $block('checkListItem', [$text('Chapitre 2')], ['checked' => false]),
        ]),
        $block('divider', []),
        $block('codeBlock', [$text("const x = 1\nconst y = 2")], ['language' => 'text']),
        $block('callout', [$text('Penser au '), $text('café', ['italic' => true])], ['emoji' => '💡']),
    ];
    $content[2]['content'] = null;

    $this->putJson("/api/pages/{$page}/content", ['content' => $content, 'version' => 1])->assertOk();

    expect(Page::find($page)->search_text)
        ->toBe("Plan\nRéviser\nChapitre 2\nconst x = 1\nconst y = 2\nPenser au café");
});

it('refuse un document dont un bloc n’a pas de type', function () {
    $workspace = signIn();
    $page = createPage($workspace);

    $this->putJson("/api/pages/{$page}/content", [
        'content' => [['type' => 'paragraph', 'content' => 'ok'], ['content' => 'sans type']],
        'version' => 1,
    ])
        ->assertUnprocessable()
        ->assertJsonPath('errors', fn (array $errors) => array_key_exists('content.1.type', $errors));

    expect(Page::find($page)->version)->toBe(1);
});
