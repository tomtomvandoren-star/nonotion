<?php

use App\Models\CalendarAccount;
use App\Models\Page;
use App\Models\Workspace;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Tests\Support\FakeICloud;

/*
 * iCloud dans les deux sens (spec 6.15), contre un faux serveur CalDAV en mémoire : connexion par
 * mot de passe pour application, agendas, événements (séries comprises), modifications qui repartent.
 */

beforeEach(function () {
    Carbon::setTestNow('2026-11-05 10:00:00');
});

const ICLOUD_EVENT = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Apple//FR\r\nBEGIN:VEVENT\r\nUID:courses@icloud\r\nDTSTAMP:20261101T080000Z\r\nSUMMARY:Courses\r\nDTSTART;VALUE=DATE:20261114\r\nDTEND;VALUE=DATE:20261115\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

const ICLOUD_SERIES = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Apple//FR\r\nBEGIN:VEVENT\r\nUID:piano@icloud\r\nDTSTAMP:20261101T080000Z\r\nSUMMARY:Piano\r\nDTSTART:20261109T170000Z\r\nDTEND:20261109T180000Z\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

function connectICloud(Workspace $workspace, string $password = 'abcd-efgh-ijkl-mnop'): TestResponse
{
    return test()->postJson("/api/workspaces/{$workspace->id}/calendar-accounts/icloud", [
        'username' => 'moi@icloud.com',
        'password' => $password,
    ]);
}

function addICloudCalendar(Workspace $workspace, CalendarAccount $account): array
{
    return test()->postJson("/api/calendar-accounts/{$account->id}/calendars", [
        'remote_id' => FakeICloud::CALENDAR,
        'name' => 'Maison',
        'color' => 'orange',
        'workspace_id' => $workspace->id,
    ])->assertCreated()->json();
}

it('connecte iCloud avec un mot de passe pour application ; un refus le dit clairement', function () {
    FakeICloud::install();
    $workspace = signIn();

    connectICloud($workspace, 'mot-de-passe-du-compte')->assertJsonValidationErrors('password')
        ->assertJsonPath('errors.password.0', fn (string $message) => str_contains($message, 'mot de passe pour application'));

    $account = connectICloud($workspace)->assertCreated()->json('data');
    expect($account)->toMatchArray(['provider' => 'icloud', 'account_email' => 'moi@icloud.com', 'status' => 'ok']);
    $stored = CalendarAccount::query()->sole();
    expect($stored->credentials())->toMatchArray(['home' => FakeICloud::HOME])
        ->and($stored->getRawOriginal('credentials_encrypted'))->not->toContain('abcd-efgh');

    // Les agendas d'événements seulement (pas les Rappels), avec leur couleur.
    $calendars = $this->getJson("/api/calendar-accounts/{$stored->id}/calendars")->assertOk()->json('data');
    expect($calendars)->toBe([[
        'id' => FakeICloud::CALENDAR, 'name' => 'Maison', 'color' => '#FF9500', 'writable' => true, 'source_id' => null,
    ]]);
});

it('les événements iCloud arrivent, les séries développées ; une modification repart avec If-Match', function () {
    $icloud = FakeICloud::install();
    $workspace = signIn();
    $single = $icloud->put('courses.ics', ICLOUD_EVENT);
    $series = $icloud->put('piano.ics', ICLOUD_SERIES);
    connectICloud($workspace)->assertCreated();
    $response = addICloudCalendar($workspace, CalendarAccount::query()->sole());

    // Courses et trois leçons de piano.
    expect($response['imported'])->toBe(4)
        ->and($response['data'])->toMatchArray(['kind' => 'icloud', 'writable' => true]);
    $date = $response['data']['property_map']['date'];
    $courses = rowTitled($response, 'Courses');

    // Un événement simple : la ressource entière est réécrite, avec l'ETag lu.
    $etag = $icloud->resources[$single]['etag'];
    $this->patchJson("/api/pages/{$courses['id']}", ['title' => 'Courses du samedi', 'properties' => [$date => ['start' => '2026-11-15']]])->assertOk();
    $put = collect($icloud->writes)->last();
    expect($put['method'])->toBe('PUT')->and($put['url'])->toBe($single)->and($put['if_match'])->toBe($etag)
        ->and($icloud->resources[$single]['ics'])->toContain('SUMMARY:Courses du samedi')
        ->and($icloud->resources[$single]['ics'])->toContain('DTSTART;VALUE=DATE:20261115');
    expect(Page::query()->find($courses['id'])->remote_etag)->toBe($icloud->resources[$single]['etag']);

    // Une leçon de la série : seule cette occurrence change (une exception RECURRENCE-ID).
    $second = collect($response['database']['rows'])->where('title', 'Piano')
        ->first(fn ($row) => str_starts_with($row['properties'][$date]['start'], '2026-11-16'));
    $this->patchJson("/api/pages/{$second['id']}", ['title' => 'Piano (récital)'])->assertOk();
    expect($icloud->resources[$series]['ics'])->toContain('RECURRENCE-ID:20261116T170000Z')
        ->and($icloud->resources[$series]['ics'])->toContain('SUMMARY:Piano (récital)')
        ->and($icloud->resources[$series]['ics'])->toContain('RRULE:FREQ=WEEKLY;COUNT=3');

    // Resynchroniser : les quatre lignes, sans doublon, avec l'exception.
    $synced = $this->postJson("/api/calendar-sources/{$response['data']['id']}/sync")->assertOk()->json();
    expect($synced['database']['rows'])->toHaveCount(4)
        ->and(collect($synced['database']['rows'])->pluck('title')->sort()->values()->all())
        ->toBe(['Courses du samedi', 'Piano', 'Piano', 'Piano (récital)']);
});

it('supprimer une leçon l’exclut de la série ; supprimer un événement simple le supprime', function () {
    $icloud = FakeICloud::install();
    $workspace = signIn();
    $single = $icloud->put('courses.ics', ICLOUD_EVENT);
    $series = $icloud->put('piano.ics', ICLOUD_SERIES);
    connectICloud($workspace)->assertCreated();
    $response = addICloudCalendar($workspace, CalendarAccount::query()->sole());
    $date = $response['data']['property_map']['date'];

    $last = collect($response['database']['rows'])->where('title', 'Piano')
        ->first(fn ($row) => str_starts_with($row['properties'][$date]['start'], '2026-11-23'));
    $this->deleteJson("/api/pages/{$last['id']}")->assertOk();
    expect($icloud->resources[$series]['ics'])->toContain('EXDATE:20261123T170000Z');

    $this->deleteJson('/api/pages/'.rowTitled($response, 'Courses')['id'])->assertOk();
    expect($icloud->resources)->not->toHaveKey($single);

    $synced = $this->postJson("/api/calendar-sources/{$response['data']['id']}/sync")->json();
    expect(collect($synced['database']['rows'])->pluck('title')->all())->toBe(['Piano', 'Piano']);
});

it('un élément créé dans la base de l’agenda iCloud y est créé', function () {
    $icloud = FakeICloud::install();
    $workspace = signIn();
    connectICloud($workspace)->assertCreated();
    $response = addICloudCalendar($workspace, CalendarAccount::query()->sole());
    $date = $response['data']['property_map']['date'];

    $row = $this->postJson("/api/databases/{$response['database']['id']}/rows", [
        'title' => 'Anniversaire',
        'properties' => [$date => ['start' => '2026-11-28T18:00:00Z', 'end' => '2026-11-28T21:00:00Z']],
    ])->assertCreated()->json('data');
    $page = Page::query()->find($row['id']);
    expect($page->remote_href)->toStartWith(FakeICloud::CALENDAR)
        ->and($icloud->resources[$page->remote_href]['ics'])->toContain('SUMMARY:Anniversaire')
        ->and($icloud->resources[$page->remote_href]['ics'])->toContain('DTSTART:20261128T180000Z')
        ->and(collect($icloud->writes)->last()['method'])->toBe('PUT');
});
