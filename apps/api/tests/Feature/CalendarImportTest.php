<?php

use App\Models\CalendarSource;
use App\Models\Page;
use App\Models\Workspace;
use App\Support\Calendars\CalendarImporter;
use App\Support\Calendars\SafeFetcher;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/*
 * Import d'agendas par lien ICS (spec 6.9), avec fixtures/sample.ics : un cours hebdomadaire (une
 * exclusion EXDATE, une occurrence déplacée), des journées entières, des fuseaux de New York et au
 * nom Windows, un événement annulé, un sans titre et un trop ancien.
 */

const ICS_URL = 'https://agenda.example.com/secret-token/basic.ics';

beforeEach(function () {
    Carbon::setTestNow('2026-11-05 10:00:00');
    // Le DNS de l'agenda d'exemple : une adresse publique.
    app()->instance(SafeFetcher::class, new SafeFetcher(fn (string $host) => ['93.184.216.34']));
});

function sampleIcs(): string
{
    return file_get_contents(base_path('../../fixtures/sample.ics'));
}

/** Une page qui contient une base « Agenda » ; renvoie l'identifiant de la base. */
function agendaDatabase(Workspace $workspace): array
{
    $page = test()->postJson("/api/workspaces/{$workspace->id}/pages", ['title' => 'Agenda'])->json('data.id');

    return test()->postJson("/api/workspaces/{$workspace->id}/databases", ['page_id' => $page])->json('data');
}

function importSample(array $database, array $extra = []): array
{
    return test()->postJson('/api/calendar-sources', [
        'url' => ICS_URL,
        'name' => 'École',
        'color' => 'green',
        'mode' => 'subscription',
        'database_id' => $database['id'],
        'time_zone' => 'Europe/Brussels',
        ...$extra,
    ])->assertCreated()->json();
}

/** Les événements importés : titre => valeur de la Date. */
function importedDates(array $response): array
{
    $date = $response['data']['property_map']['date'];

    return collect($response['database']['rows'])
        ->whereNotNull('calendar_source_id')
        ->mapWithKeys(fn ($row) => [$row['title'].' '.substr($row['properties'][$date]['start'], 0, 10) => $row['properties'][$date]])
        ->all();
}

it('prévisualise un agenda : nombre, période, prochains événements, avertissements', function () {
    Http::fake(['agenda.example.com/*' => Http::response(sampleIcs(), 200, ['Content-Type' => 'text/calendar'])]);
    $workspace = signIn();

    $preview = $this->postJson('/api/calendar-sources/preview', [
        'workspace_id' => $workspace->id,
        'url' => 'webcal://agenda.example.com/secret-token/basic.ics',
        'time_zone' => 'Europe/Brussels',
    ])->assertOk()->json('data');

    // 19 cours (20 moins l'exclusion), la fête, les vacances, New York, l'équipe, le webinaire et
    // le sans-titre ; ni l'annulé, ni l'ancien (hors de la fenêtre d'un mois en arrière).
    expect($preview['total'])->toBe(25)
        ->and($preview['name'])->toBe("Agenda d'exemple")
        ->and($preview['events'][0]['title'])->toBe('Appel avec New York')
        ->and($preview['warnings'])->toBe(['Un événement n’a pas de titre.'])
        ->and($preview['duplicate'])->toBeNull();
    Http::assertSent(fn ($request) => str_starts_with($request->url(), 'https://agenda.example.com/'));
});

it('critère 6.9 : les événements arrivent au bon jour, à la bonne heure, avec leur fuseau', function () {
    Http::fake(['agenda.example.com/*' => Http::response(sampleIcs())]);
    $workspace = signIn();
    $response = importSample(agendaDatabase($workspace));
    $dates = importedDates($response);

    expect($response['imported'])->toBe(25)
        // New York 9 h = 14 h UTC, avec son fuseau d'origine.
        ->and($dates['Appel avec New York 2026-11-12'])->toBe([
            'start' => '2026-11-12T14:00:00Z', 'end' => '2026-11-12T14:30:00Z', 'time_zone' => 'America/New_York',
        ])
        // « W. Europe Standard Time » est un nom Windows : traduit en nom IANA.
        ->and($dates['Réunion d’équipe 2026-11-20'] ?? $dates["Réunion d'équipe 2026-11-20"])->toMatchArray([
            'start' => '2026-11-20T09:00:00Z', 'time_zone' => 'Europe/Berlin',
        ])
        // Journée entière : le bon jour, sans heure ; une plage garde son dernier jour inclus.
        ->and($dates['Fête de quartier 2026-11-14'])->toBe(['start' => '2026-11-14'])
        ->and($dates["Vacances d'hiver 2026-12-21"])->toBe(['start' => '2026-12-21', 'end' => '2027-01-03'])
        ->and(collect($dates)->keys()->filter(fn ($key) => str_contains($key, 'annulé') || str_contains($key, 'ancien')))->toBeEmpty();

    // Le lien est un secret : chiffré en base, jamais renvoyé ; seul son domaine s'affiche.
    $stored = DB::table('calendar_sources')->first();
    expect($stored->url_encrypted)->not->toContain('secret-token')
        ->and($response['data']['url_host'])->toBe('agenda.example.com')
        ->and(json_encode($response))->not->toContain('secret-token');
});

it('critère 6.9 : un cours hebdomadaire revient chaque semaine, sans l’exclusion, avec l’occurrence déplacée', function () {
    Http::fake(['agenda.example.com/*' => Http::response(sampleIcs())]);
    $dates = importedDates(importSample(agendaDatabase(signIn())));

    expect($dates['Cours de piano 2026-11-03']['start'])->toBe('2026-11-03T17:00:00Z')
        ->and($dates)->not->toHaveKey('Cours de piano 2026-11-10')
        ->and($dates['Cours de piano (décalé) 2026-11-17']['start'])->toBe('2026-11-17T18:00:00Z')
        ->and($dates['Cours de piano 2026-11-24']['start'])->toBe('2026-11-24T17:00:00Z')
        // Avant le passage à l'heure d'hiver : 18 h à Bruxelles = 16 h UTC.
        ->and($dates['Cours de piano 2026-10-20']['start'])->toBe('2026-10-20T16:00:00Z')
        ->and(collect($dates)->keys()->filter(fn ($key) => str_starts_with($key, 'Cours de piano')))->toHaveCount(19);
});

it('la description devient le corps de la page ; le lieu et le lien remplissent leurs propriétés', function () {
    Http::fake(['agenda.example.com/*' => Http::response(sampleIcs())]);
    $response = importSample(agendaDatabase(signIn()));
    $map = $response['data']['property_map'];
    $row = collect($response['database']['rows'])->firstWhere('title', 'Webinaire');

    expect($row['properties'][$map['location']])->toBe('En ligne')
        ->and($row['properties'][$map['url']])->toBe('https://example.com/webinaire')
        ->and(collect(Page::query()->find($row['id'])->content)->pluck('content')->all())
        ->toBe(['Ordre du jour :', '1. Accueil', '2. Démonstration']);
});

it('critère 6.9 : refuse les adresses locales et privées, même après une redirection', function (string $url, ?string $redirect, array $ips) {
    app()->instance(SafeFetcher::class, new SafeFetcher(fn (string $host) => $ips));
    Http::fake([
        'redirige.example.com/*' => Http::response('', 302, ['Location' => $redirect ?? '']),
        '*' => Http::response(sampleIcs()),
    ]);
    $workspace = signIn();

    $this->postJson('/api/calendar-sources/preview', ['workspace_id' => $workspace->id, 'url' => $url])
        ->assertUnprocessable()
        ->assertJsonPath('errors.url.0', 'Cette adresse n’est pas autorisée : elle mène à un réseau privé ou local.');
})->with([
    'boucle locale' => ['http://127.0.0.1/agenda.ics', null, []],
    'réseau privé' => ['http://192.168.1.20/agenda.ics', null, []],
    'IPv6 locale' => ['http://[::1]/agenda.ics', null, []],
    'nom qui résout vers une adresse privée' => ['https://intranet.example.com/agenda.ics', null, ['10.0.0.5']],
    'redirection vers les métadonnées du serveur' => ['https://redirige.example.com/a.ics', 'http://169.254.169.254/latest', ['93.184.216.34']],
]);

it('refuse ce qui n’est pas un agenda, et un lien qui n’est pas une adresse web', function () {
    Http::fake(['*' => Http::response('<html>Bonjour</html>')]);
    $workspace = signIn();

    $this->postJson('/api/calendar-sources/preview', ['workspace_id' => $workspace->id, 'url' => 'https://example.com/page'])
        ->assertJsonPath('errors.url.0', 'Ce lien ne renvoie pas un agenda au format iCalendar (.ics).');
    $this->postJson('/api/calendar-sources/preview', ['workspace_id' => $workspace->id, 'url' => 'file:///etc/passwd'])
        ->assertJsonPath('errors.url.0', 'Ce lien n’est pas une adresse web (https://… ou webcal://…).');
});

it('critère 6.9 : modifier l’événement dans la source puis resynchroniser met la ligne à jour, sans doublon', function () {
    $changed = str_replace(
        ['SUMMARY:Webinaire', "BEGIN:VEVENT\nUID:fete@nonotion.test"],
        ['SUMMARY:Webinaire (nouvelle salle)', "BEGIN:VEVENT\nUID:fete-supprimee@nonotion.test\nSTATUS:CANCELLED"],
        sampleIcs(),
    );
    Http::fakeSequence('agenda.example.com/*')->push(sampleIcs())->push($changed);
    $response = importSample(agendaDatabase(signIn()));
    $source = $response['data']['id'];
    $webinaire = collect($response['database']['rows'])->firstWhere('title', 'Webinaire');

    // Une étiquette ajoutée par l'utilisateur reste après la resynchronisation.
    $this->postJson("/api/databases/{$response['database']['id']}/properties", ['property' => ['id' => 'note', 'name' => 'Note', 'type' => 'text']]);
    $this->patchJson("/api/pages/{$webinaire['id']}", ['properties' => ['note' => 'Préparer des questions']])->assertOk();

    $synced = $this->postJson("/api/calendar-sources/{$source}/sync")->assertOk()->json();

    $rows = collect($synced['database']['rows'])->whereNotNull('calendar_source_id');
    $updated = $rows->firstWhere('id', $webinaire['id']);
    expect($updated['title'])->toBe('Webinaire (nouvelle salle)')
        ->and($updated['properties']['note'])->toBe('Préparer des questions')
        ->and($rows->where('title', 'Webinaire (nouvelle salle)'))->toHaveCount(1)
        ->and($rows->where('title', 'Fête de quartier'))->toHaveCount(0)
        ->and($synced['result'])->toMatchArray(['updated' => 1, 'deleted' => 1, 'created' => 0])
        ->and($synced['data']['events_count'])->toBe(24);
});

it('rien ne change si le serveur répond 304 ; une erreur est notée avec un message clair', function () {
    Http::fakeSequence('agenda.example.com/*')
        ->push(sampleIcs(), 200, ['ETag' => '"v1"'])
        ->push('', 304)
        ->push('', 403);
    $source = importSample(agendaDatabase(signIn()))['data']['id'];

    // Le planificateur relit avec If-None-Match : 304, rien à faire.
    Carbon::setTestNow('2026-11-05 11:00:00');
    CalendarImporter::syncDue();
    Http::assertSent(fn ($request) => $request->header('If-None-Match') === ['"v1"']);
    expect(CalendarSource::query()->find($source))
        ->status->toBe('ok')
        ->last_sync_at->toEqual(now());

    $this->postJson("/api/calendar-sources/{$source}/sync")
        ->assertUnprocessable()
        ->assertJsonPath('message', 'Le lien n’est plus valide ou a été révoqué.')
        ->assertJsonPath('data.status', 'error');
    $failed = CalendarSource::query()->find($source);
    expect($failed->failure_count)->toBe(1)
        ->and($failed->next_sync_at->greaterThan(now()->addMinutes(29)))->toBeTrue()
        ->and($failed->error_message)->not->toContain('secret-token');
});

it('le même lien ajouté deux fois : on propose l’agenda existant', function () {
    Http::fake(['agenda.example.com/*' => Http::response(sampleIcs())]);
    $workspace = signIn();
    $database = agendaDatabase($workspace);
    $first = importSample($database);

    $this->postJson('/api/calendar-sources/preview', ['workspace_id' => $workspace->id, 'url' => ICS_URL])
        ->assertJsonPath('data.duplicate.id', $first['data']['id']);
    $this->postJson('/api/calendar-sources', [
        'url' => ICS_URL, 'name' => 'Encore', 'color' => 'blue', 'mode' => 'subscription', 'database_id' => $database['id'],
    ])->assertConflict()->assertJsonPath('existing.name', 'École');
});

it('un événement importé garde son titre et sa date ; les autres propriétés se modifient', function () {
    Http::fake(['agenda.example.com/*' => Http::response(sampleIcs())]);
    $response = importSample(agendaDatabase(signIn()));
    $row = collect($response['database']['rows'])->firstWhere('title', 'Webinaire');
    $date = $response['data']['property_map']['date'];

    $this->patchJson("/api/pages/{$row['id']}", ['title' => 'Autre'])->assertUnprocessable()->assertJsonValidationErrors('title');
    $this->patchJson("/api/pages/{$row['id']}", ['properties' => [$date => ['start' => '2026-12-01']]])
        ->assertJsonValidationErrors('properties');
    $this->patchJson("/api/pages/{$row['id']}", ['title' => 'Webinaire', 'icon' => '🎥'])->assertOk();
});

it('critère 6.9 : supprimer l’agenda met ses événements à la corbeille', function () {
    Http::fake(['agenda.example.com/*' => Http::response(sampleIcs())]);
    $response = importSample(agendaDatabase(signIn()));

    $this->deleteJson("/api/calendar-sources/{$response['data']['id']}")
        ->assertOk()
        ->assertJsonPath('data.moved_to_trash', 25);

    expect(CalendarSource::query()->count())->toBe(0)
        ->and(Page::query()->where('database_id', $response['database']['id'])->count())->toBe(3)
        ->and(Page::onlyTrashed()->where('database_id', $response['database']['id'])->count())->toBe(25);
});

it('importe dans une nouvelle base d’événements, créée sous la page', function () {
    Http::fake(['agenda.example.com/*' => Http::response(sampleIcs())]);
    $workspace = signIn();
    $page = $this->postJson("/api/workspaces/{$workspace->id}/pages", ['title' => 'Maison'])->json('data.id');

    $response = $this->postJson('/api/calendar-sources', [
        'url' => ICS_URL, 'name' => 'Agenda familial', 'color' => 'purple', 'mode' => 'one_shot', 'page_id' => $page,
    ])->assertCreated()->json();

    expect($response['page']['parent_page_id'])->toBe($page)
        ->and($response['database']['title'])->toBe('Agenda familial')
        ->and(collect($response['database']['views'])->pluck('type')->all())->toBe(['calendar', 'table'])
        ->and($response['database']['rows'])->toHaveCount(25)
        ->and($response['data']['mode'])->toBe('one_shot');
});

it('isole les agendas d’un autre utilisateur (404)', function () {
    Http::fake(['agenda.example.com/*' => Http::response(sampleIcs())]);
    $source = importSample(agendaDatabase(signIn()))['data']['id'];

    signIn();
    $this->postJson("/api/calendar-sources/{$source}/sync")->assertNotFound();
    $this->patchJson("/api/calendar-sources/{$source}", ['name' => 'À moi'])->assertNotFound();
    $this->deleteJson("/api/calendar-sources/{$source}")->assertNotFound();
});
