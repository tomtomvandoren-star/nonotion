<?php

use App\Models\Upload;
use App\Models\Workspace;
use App\Support\BlockText;
use App\Support\Calendars\SafeFetcher;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

/*
 * Les blocs du groupe « Média » : fichiers envoyés dans une page (image, vidéo, audio, fichier),
 * et aperçu d'un lien web, lu par le serveur avec la protection SSRF des agendas (spec 6.9).
 */

beforeEach(function () {
    Storage::fake('uploads', ['url' => config('app.url').'/uploads']);
    // Le DNS des sites d'exemple : une adresse publique.
    app()->instance(SafeFetcher::class, new SafeFetcher(fn (string $host) => ['93.184.216.34']));
});

/** Une page du workspace ; renvoie son identifiant. */
function mediaPage(Workspace $workspace): string
{
    return test()->postJson("/api/workspaces/{$workspace->id}/pages", ['title' => 'Voyage'])->json('data.id');
}

function upload(string $pageId, UploadedFile $file)
{
    return test()->post("/api/pages/{$pageId}/files", ['file' => $file], ['Accept' => 'application/json']);
}

it('range un fichier envoyé dans uploads/, à une adresse propre au fichier, sous un nom lisible', function () {
    $workspace = signIn();
    $page = mediaPage($workspace);

    $response = upload($page, UploadedFile::fake()->image('Coucher de soleil à Nice.png', 40, 30))
        ->assertCreated()
        ->assertJsonPath('name', 'Coucher de soleil à Nice.png')
        ->assertJsonPath('mime', 'image/png');

    $upload = Upload::query()->sole();
    expect($upload->workspace_id)->toBe($workspace->id)
        ->and($upload->page_id)->toBe($page)
        ->and($upload->path)->toMatch("#^{$workspace->id}/[0-9a-z]{26}/Coucher-de-soleil-a-Nice\\.png$#")
        ->and($response->json('url'))->toBe(config('app.url').'/uploads/'.$upload->path);
    Storage::disk('uploads')->assertExists($upload->path);

    // Deux fichiers du même nom ne s'écrasent pas.
    upload($page, UploadedFile::fake()->image('Coucher de soleil à Nice.png'))->assertCreated();
    expect(Upload::query()->pluck('path')->unique())->toHaveCount(2);
});

it('ne garde jamais une extension que le serveur web pourrait exécuter ou afficher comme une page', function () {
    expect(Upload::safeName('shell.php'))->toBe('shell')
        ->and(Upload::safeName('photo.php.jpg'))->toBe('photo-php.jpg')
        ->and(Upload::safeName('page.HTML'))->toBe('page')
        ->and(Upload::safeName('.htaccess'))->toBe('fichier')
        ->and(Upload::safeName('Compte rendu (final).PDF'))->toBe('Compte-rendu-final.pdf')
        ->and(Upload::safeName('…'))->toBe('fichier');

    $page = mediaPage(signIn());
    $response = upload($page, UploadedFile::fake()->createWithContent('outil.php', '<?php echo "x";'))
        ->assertCreated()
        ->assertJsonPath('name', 'outil.php');
    expect($response->json('url'))->toEndWith('/outil');
});

it('refuse un fichier trop lourd', function () {
    config(['nonotion.uploads.max_mb' => 1]);
    $page = mediaPage(signIn());

    upload($page, UploadedFile::fake()->create('film.mp4', 2048, 'video/mp4'))
        ->assertUnprocessable()
        ->assertJsonPath('errors.file.0', 'Ce fichier dépasse 1 Mo.');
    expect(Upload::query()->count())->toBe(0);
});

it('n’envoie rien dans la page d’un autre utilisateur', function () {
    $alicePage = mediaPage(signIn('Alice'));
    Sanctum::actingAs(createAccount('Bob'));

    upload($alicePage, UploadedFile::fake()->image('intrus.png'))->assertNotFound();
    expect(Upload::query()->withoutGlobalScopes()->count())->toBe(0);
    expect(Storage::disk('uploads')->allFiles())->toBe([]);
});

it('demande d’être connecté pour envoyer un fichier ou lire un aperçu', function () {
    $page = mediaPage(signIn());
    app('auth')->forgetGuards();

    $this->withHeader('Authorization', '')->post("/api/pages/{$page}/files", [
        'file' => UploadedFile::fake()->image('x.png'),
    ], ['Accept' => 'application/json'])->assertUnauthorized();
    $this->postJson('/api/link-preview', ['url' => 'https://exemple.com'])->assertUnauthorized();
});

it('aperçu d’un lien : titre, description, image et icône lus dans les balises Open Graph', function () {
    signIn();
    Http::fake(['blog.example.com/*' => Http::response(<<<'HTML'
        <!doctype html><html><head>
        <meta charset="utf-8">
        <title>Titre de secours</title>
        <meta property="og:title" content="Les 10 plus beaux sentiers des Alpes">
        <meta property="og:description" content="Randonnées &amp; refuges, de juin à septembre.">
        <meta property="og:image" content="/images/couverture.jpg">
        <meta property="og:site_name" content="Carnets de montagne">
        <link rel="icon" href="https://cdn.example.com/favicon.png">
        </head><body>…</body></html>
        HTML, 200, ['Content-Type' => 'text/html; charset=utf-8'])]);

    $this->postJson('/api/link-preview', ['url' => 'blog.example.com/sentiers'])
        ->assertOk()
        ->assertExactJson(['data' => [
            'url' => 'https://blog.example.com/sentiers',
            'title' => 'Les 10 plus beaux sentiers des Alpes',
            'description' => 'Randonnées & refuges, de juin à septembre.',
            'image' => 'https://blog.example.com/images/couverture.jpg',
            'icon' => 'https://cdn.example.com/favicon.png',
            'site_name' => 'Carnets de montagne',
        ]]);

    // Gardé un jour : la même adresse n'est pas relue.
    $this->postJson('/api/link-preview', ['url' => 'https://blog.example.com/sentiers'])->assertOk();
    Http::assertSentCount(1);
});

it('sans balises Open Graph, le titre de la page ; une page en ISO-8859-1 est lue correctement', function () {
    signIn();
    $html = mb_convert_encoding('<html><head><meta charset="iso-8859-1"><title>Météo à Liège</title>'
        .'<meta name="description" content="Prévisions"></head></html>', 'ISO-8859-1', 'UTF-8');
    Http::fake(['meteo.example.be/*' => Http::response($html, 200, ['Content-Type' => 'text/html'])]);

    $this->postJson('/api/link-preview', ['url' => 'https://www.meteo.example.be/liege'])
        ->assertOk()
        ->assertJsonPath('data.title', 'Météo à Liège')
        ->assertJsonPath('data.description', 'Prévisions')
        ->assertJsonPath('data.image', null)
        ->assertJsonPath('data.icon', 'https://www.meteo.example.be/favicon.ico')
        ->assertJsonPath('data.site_name', 'meteo.example.be');
});

it('un lien vers un fichier (PDF…) donne un aperçu sans titre', function () {
    signIn();
    Http::fake(['docs.example.com/*' => Http::response('%PDF-1.7', 200, ['Content-Type' => 'application/pdf'])]);

    $this->postJson('/api/link-preview', ['url' => 'https://docs.example.com/guide.pdf'])
        ->assertOk()
        ->assertJsonPath('data.title', null)
        ->assertJsonPath('data.site_name', 'docs.example.com');
});

it('YouTube répond par oEmbed (sa page demande d’accepter des cookies)', function () {
    signIn();
    Http::fake(['www.youtube.com/oembed*' => Http::response([
        'title' => 'Comment tailler un rosier',
        'author_name' => 'Jardin facile',
        'provider_name' => 'YouTube',
        'thumbnail_url' => 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
    ])]);

    $this->postJson('/api/link-preview', ['url' => 'https://www.youtube.com/watch?v=abc123'])
        ->assertOk()
        ->assertJsonPath('data.title', 'Comment tailler un rosier')
        ->assertJsonPath('data.description', 'Jardin facile')
        ->assertJsonPath('data.image', 'https://i.ytimg.com/vi/abc123/hqdefault.jpg')
        ->assertJsonPath('data.site_name', 'YouTube');
    Http::assertSent(fn ($request) => str_starts_with($request->url(), 'https://www.youtube.com/oembed?format=json&url='));
});

it('refuse un lien vers une adresse privée ou locale, et ce qui n’est pas une adresse web', function () {
    signIn();
    app()->instance(SafeFetcher::class, new SafeFetcher(fn (string $host) => ['10.0.0.5']));
    Http::fake();

    $this->postJson('/api/link-preview', ['url' => 'https://intranet.example.com'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.url.0', 'Cette adresse n’est pas autorisée : elle mène à un réseau privé ou local.');
    $this->postJson('/api/link-preview', ['url' => 'http://127.0.0.1:8000/api/health'])->assertUnprocessable();
    $this->postJson('/api/link-preview', ['url' => 'javascript:alert(1)'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.url.0', 'Ce lien n’est pas une adresse web (https://…).');
    Http::assertNothingSent();
});

it('la recherche trouve le nom et la légende d’un fichier, le titre d’un aperçu de lien', function () {
    $text = BlockText::extract([
        ['type' => 'image', 'props' => ['url' => 'https://x/a.png', 'name' => 'plage.png', 'caption' => 'Coucher de soleil'], 'children' => []],
        ['type' => 'bookmark', 'props' => ['url' => 'https://x', 'title' => 'Sentiers des Alpes', 'description' => ''], 'children' => []],
        ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Fin']], 'children' => []],
    ]);

    expect($text)->toBe("plage.png\nCoucher de soleil\nSentiers des Alpes\nFin");
});
