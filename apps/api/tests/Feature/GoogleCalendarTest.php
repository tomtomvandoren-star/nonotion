<?php

use App\Models\CalendarAccount;
use App\Models\CalendarSource;
use App\Models\Page;
use App\Models\Workspace;
use App\Support\Calendars\CalendarSync;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeGoogle;

/*
 * Google Agenda dans les deux sens (spec 6.15), contre un faux Google en mémoire : connexion OAuth,
 * agendas du compte, événements qui arrivent, modifications qui repartent, conflits, déconnexion.
 */

beforeEach(function () {
    Carbon::setTestNow('2026-11-05 10:00:00');
    config([
        'services.google.client_id' => 'client-id',
        'services.google.client_secret' => 'client-secret',
        'nonotion.frontend_url' => 'https://nonotion.example',
    ]);
});

/** Connecte le compte Google par le vrai parcours : l'adresse de Google, puis son retour. */
function connectGoogle(Workspace $workspace): CalendarAccount
{
    $url = test()->postJson("/api/workspaces/{$workspace->id}/calendar-accounts/google")->assertOk()->json('data.url');
    parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
    expect($query['access_type'])->toBe('offline')
        ->and($query['scope'])->toContain('https://www.googleapis.com/auth/calendar.events');

    test()->get('/api/integrations/google/callback?'.http_build_query(['code' => 'code-google', 'state' => $query['state']]))
        ->assertRedirect('https://nonotion.example/agenda?connexion=google');

    return CalendarAccount::query()->where('workspace_id', $workspace->id)->sole();
}

/** Ajoute l'agenda « Moi » dans une nouvelle base au premier niveau ; renvoie la réponse. */
function addGoogleCalendar(Workspace $workspace, CalendarAccount $account): array
{
    return test()->postJson("/api/calendar-accounts/{$account->id}/calendars", [
        'remote_id' => 'moi@gmail.com',
        'name' => 'Moi',
        'color' => 'blue',
        'workspace_id' => $workspace->id,
    ])->assertCreated()->json();
}

function rowTitled(array $response, string $title): array
{
    return collect($response['database']['rows'])->firstWhere('title', $title);
}

it('connecte un compte Google : jetons chiffrés côté serveur, jamais renvoyés au client', function () {
    $google = FakeGoogle::install();
    $workspace = signIn();
    $account = connectGoogle($workspace);

    expect($account->provider)->toBe('google')
        ->and($account->account_email)->toBe('moi@gmail.com')
        ->and($account->credentials()['refresh_token'])->toBe('jeton-durable-secret')
        ->and($account->getRawOriginal('credentials_encrypted'))->not->toContain('jeton-durable-secret');

    $agenda = $this->getJson("/api/workspaces/{$workspace->id}/agenda")->assertOk();
    expect($agenda->json('data.accounts.0'))->toMatchArray(['provider' => 'google', 'account_email' => 'moi@gmail.com', 'status' => 'ok'])
        ->and($agenda->json('data.google_available'))->toBeTrue()
        ->and($agenda->getContent())->not->toContain('jeton');

    // Les agendas du compte, et lesquels on peut modifier.
    $calendars = $this->getJson("/api/calendar-accounts/{$account->id}/calendars")->assertOk()->json('data');
    expect($calendars)->toHaveCount(2)
        ->and($calendars[0])->toMatchArray(['id' => 'moi@gmail.com', 'writable' => true, 'source_id' => null])
        ->and($calendars[1]['writable'])->toBeFalse();
});

it('refuse un retour de Google sans state valide, et un compte d’un autre', function () {
    FakeGoogle::install();
    $workspace = signIn();
    $this->get('/api/integrations/google/callback?code=x&state=faux')
        ->assertRedirect('https://nonotion.example/agenda?connexion=annulee');
    $this->get('/api/integrations/google/callback?error=access_denied&state=faux')
        ->assertRedirect('https://nonotion.example/agenda?connexion=annulee');
    expect(CalendarAccount::query()->count())->toBe(0);

    $account = connectGoogle($workspace);
    signIn('Bruno');
    $this->getJson("/api/calendar-accounts/{$account->id}/calendars")->assertNotFound();
    $this->deleteJson("/api/calendar-accounts/{$account->id}")->assertNotFound();
    expect($this->getJson('/api/workspaces/'.workspaceOf(auth()->user())->id.'/agenda')->json('data.accounts'))->toBe([]);
});

it('sans identifiants OAuth sur le serveur, Google n’est pas proposé', function () {
    config(['services.google.client_id' => null]);
    $workspace = signIn();
    expect($this->getJson("/api/workspaces/{$workspace->id}/agenda")->json('data.google_available'))->toBeFalse();
    $this->postJson("/api/workspaces/{$workspace->id}/calendar-accounts/google")->assertStatus(422);
});

it('ajoute un agenda Google : ses événements arrivent, une occurrence annulée non', function () {
    $google = FakeGoogle::install();
    $workspace = signIn();
    $google->add('vacances', 'Vacances', '2026-12-21', '2026-12-26');
    $google->add('dentiste', 'Dentiste', '2026-11-12T14:30:00+01:00', '2026-11-12T15:00:00+01:00', ['location' => 'Liège', 'description' => '<p>Rappel</p><p>Carte</p>']);
    $google->add('yoga_20261110T180000Z', 'Yoga', '2026-11-10T19:00:00+01:00', '2026-11-10T20:00:00+01:00', [
        'recurringEventId' => 'yoga', 'originalStartTime' => ['dateTime' => '2026-11-10T19:00:00+01:00'],
    ]);
    $google->add('annule', 'Annulé', '2026-11-20', null, ['status' => 'cancelled']);
    $account = connectGoogle($workspace);

    $response = addGoogleCalendar($workspace, $account);
    expect($response['imported'])->toBe(3)
        ->and($response['data'])->toMatchArray(['kind' => 'google', 'writable' => true, 'url_host' => 'Google · moi@gmail.com'])
        ->and($response['page']['parent_page_id'])->toBeNull();
    $date = $response['data']['property_map']['date'];
    $location = $response['data']['property_map']['location'];
    $dentist = rowTitled($response, 'Dentiste');
    expect($dentist['properties'][$date])->toBe(['start' => '2026-11-12T13:30:00Z', 'end' => '2026-11-12T14:00:00Z', 'time_zone' => 'Europe/Brussels'])
        ->and($dentist['properties'][$location])->toBe('Liège')
        ->and(rowTitled($response, 'Vacances')['properties'][$date])->toBe(['start' => '2026-12-21', 'end' => '2026-12-25'])
        ->and(Page::query()->find($dentist['id'])->search_text)->toContain('Rappel');

    // Le même agenda deux fois : refusé.
    $this->postJson("/api/calendar-accounts/{$account->id}/calendars", [
        'remote_id' => 'moi@gmail.com', 'name' => 'Encore', 'color' => 'red', 'workspace_id' => $workspace->id,
    ])->assertStatus(409);
});

it('une modification dans Nonotion part chez Google (If-Match) ; une modification chez Google revient sans doublon', function () {
    $google = FakeGoogle::install();
    $workspace = signIn();
    $google->add('dentiste', 'Dentiste', '2026-11-12T14:30:00+01:00', '2026-11-12T15:00:00+01:00');
    $response = addGoogleCalendar($workspace, connectGoogle($workspace));
    $date = $response['data']['property_map']['date'];
    $row = rowTitled($response, 'Dentiste');
    $etag = $google->events['dentiste']['etag'];

    // Plus en lecture seule : titre et date se modifient, et partent chez Google.
    $this->patchJson("/api/pages/{$row['id']}", [
        'title' => 'Dentiste (déplacé)',
        'properties' => [$date => ['start' => '2026-11-13T09:00:00Z', 'end' => '2026-11-13T09:30:00Z', 'time_zone' => 'Europe/Brussels']],
    ])->assertOk();
    expect($google->events['dentiste']['summary'])->toBe('Dentiste (déplacé)')
        ->and($google->events['dentiste']['start'])->toBe(['dateTime' => '2026-11-13T09:00:00Z', 'timeZone' => 'Europe/Brussels']);
    $patch = collect($google->writes)->firstWhere('method', 'PATCH');
    expect($patch)->not->toBeNull();
    Http::assertSent(fn ($request) => $request->method() === 'PATCH' && $request->header('If-Match')[0] === $etag);
    $saved = Page::query()->find($row['id']);
    expect($saved->remote_etag)->toBe($google->events['dentiste']['etag'])
        ->and($saved->synced_at->eq($saved->updated_at))->toBeTrue();

    // Modifié dans Google Agenda : la resynchronisation met la ligne à jour, sans doublon.
    Carbon::setTestNow('2026-11-05 11:00:00');
    $google->editRemotely('dentiste', ['summary' => 'Dentiste à 9 h']);
    $synced = $this->postJson("/api/calendar-sources/{$response['data']['id']}/sync")->assertOk()->json();
    expect(collect($synced['database']['rows'])->where('title', 'Dentiste à 9 h'))->toHaveCount(1)
        ->and($synced['database']['rows'])->toHaveCount(1);

    // Supprimé dans Google Agenda : la ligne s'en va.
    unset($google->events['dentiste']);
    $synced = $this->postJson("/api/calendar-sources/{$response['data']['id']}/sync")->json();
    expect($synced['database']['rows'])->toBe([]);
});

it('créer, mettre à la corbeille ou restaurer une ligne le fait aussi chez Google', function () {
    $google = FakeGoogle::install();
    $workspace = signIn();
    $response = addGoogleCalendar($workspace, connectGoogle($workspace));
    $database = $response['database'];
    $date = $response['data']['property_map']['date'];

    $row = $this->postJson("/api/databases/{$database['id']}/rows", [
        'title' => 'Réunion',
        'properties' => [$date => ['start' => '2026-11-18']],
    ])->assertCreated()->json('data');
    $created = Page::query()->find($row['id']);
    expect($created->calendar_source_id)->toBe($response['data']['id'])
        ->and($created->remote_href)->not->toBeNull()
        ->and($google->events[$created->remote_href]['summary'])->toBe('Réunion')
        ->and($google->events[$created->remote_href]['end'])->toBe(['date' => '2026-11-19']);

    $remoteId = $created->remote_href;
    $this->deleteJson("/api/pages/{$row['id']}")->assertOk();
    expect($google->events)->not->toHaveKey($remoteId);

    $this->postJson("/api/pages/{$row['id']}/restore")->assertOk();
    $restored = Page::query()->find($row['id']);
    expect($restored->remote_href)->not->toBeNull()->not->toBe($remoteId)
        ->and($google->events[$restored->remote_href]['summary'])->toBe('Réunion');
});

it('modifié des deux côtés : la version la plus récente gagne, l’autre reste sur la page', function () {
    $google = FakeGoogle::install();
    $workspace = signIn();
    $google->add('dentiste', 'Dentiste', '2026-11-12');
    $response = addGoogleCalendar($workspace, connectGoogle($workspace));
    $row = rowTitled($response, 'Dentiste');

    // Google ne répond pas : la modification reste dans Nonotion, « à envoyer ».
    $google->failWrites = true;
    Carbon::setTestNow('2026-11-05 10:05:00');
    $this->patchJson("/api/pages/{$row['id']}", ['title' => 'Dentiste (Nonotion)'])->assertOk();
    expect($google->events['dentiste']['summary'])->toBe('Dentiste');

    // Puis modifié dans Google, plus tard : la version de Google gagne ; celle de Nonotion est gardée.
    $google->failWrites = false;
    Carbon::setTestNow('2026-11-05 10:10:00');
    $google->editRemotely('dentiste', ['summary' => 'Dentiste (Google)']);
    app(CalendarSync::class)->sync(CalendarSource::query()->sole());
    $page = Page::query()->find($row['id']);
    expect($page->title)->toBe('Dentiste (Google)')
        ->and($page->sync_conflict)->toMatchArray(['lost' => 'local', 'title' => 'Dentiste (Nonotion)']);

    // Dans l'autre sens : modifié dans Google, puis plus tard dans Nonotion (envoi en échec) : Nonotion gagne.
    $google->editRemotely('dentiste', ['summary' => 'Dentiste (Google 2)']);
    $google->failWrites = true;
    Carbon::setTestNow('2026-11-05 10:20:00');
    $this->patchJson("/api/pages/{$row['id']}", ['title' => 'Dentiste (Nonotion 2)'])->assertOk();
    $google->failWrites = false;
    app(CalendarSync::class)->sync(CalendarSource::query()->sole());
    expect(Page::query()->find($row['id'])->title)->toBe('Dentiste (Nonotion 2)')
        ->and($google->events['dentiste']['summary'])->toBe('Dentiste (Nonotion 2)')
        ->and(Page::query()->find($row['id'])->sync_conflict)->toMatchArray(['lost' => 'remote', 'title' => 'Dentiste (Google 2)']);

    // La page montre la version écartée, jusqu'à ce qu'on l'ignore.
    $this->getJson("/api/pages/{$row['id']}")->assertJsonPath('data.sync_conflict.title', 'Dentiste (Google 2)');
    $this->patchJson("/api/pages/{$row['id']}", ['sync_conflict' => ['x' => 1]])->assertJsonValidationErrors('sync_conflict');
    $this->patchJson("/api/pages/{$row['id']}", ['sync_conflict' => null])->assertOk();
    $this->getJson("/api/pages/{$row['id']}")->assertJsonPath('data.sync_conflict', null);
});

it('rafraîchit un jeton expiré ; un jeton révoqué demande de reconnecter le compte', function () {
    $google = FakeGoogle::install();
    $workspace = signIn();
    $response = addGoogleCalendar($workspace, connectGoogle($workspace));

    Carbon::setTestNow('2026-11-05 12:00:00');
    $this->postJson("/api/calendar-sources/{$response['data']['id']}/sync")->assertOk();
    expect($google->refreshes)->toBe(1);

    Carbon::setTestNow('2026-11-05 14:00:00');
    $google->refuseRefresh = true;
    $this->postJson("/api/calendar-sources/{$response['data']['id']}/sync")->assertStatus(422)
        ->assertJsonPath('message', 'Google refuse l’accès à ce compte (jeton révoqué ou expiré) : reconnectez-le.');
    expect($this->getJson("/api/workspaces/{$workspace->id}/agenda")->json('data.accounts.0.status'))->toBe('error');
});

it('déconnecter : jeton révoqué, agendas retirés, événements à la corbeille, rien d’effacé chez Google', function () {
    $google = FakeGoogle::install();
    $workspace = signIn();
    $google->add('dentiste', 'Dentiste', '2026-11-12');
    $account = connectGoogle($workspace);
    addGoogleCalendar($workspace, $account);

    $this->deleteJson("/api/calendar-accounts/{$account->id}")->assertOk()->assertJsonPath('data.moved_to_trash', 1);
    expect(collect($google->writes)->pluck('method')->all())->toContain('REVOKE')
        ->and($google->events)->toHaveKey('dentiste')
        ->and(CalendarAccount::query()->count())->toBe(0)
        ->and(Page::onlyTrashed()->where('title', 'Dentiste')->count())->toBe(1);
});
