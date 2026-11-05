<?php

use App\Models\CalendarSource;
use App\Models\Page;

/*
 * Afficher une base dans Google Agenda ou le Calendrier Apple : un lien d'abonnement (ICS) secret.
 * createTasks() vient de TasksTest.php.
 */

/** Le flux de la base, tel que Google ou Apple le lisent (sans être connecté). */
function feedOf(string $url): string
{
    app('auth')->forgetGuards();

    return test()->get(parse_url($url, PHP_URL_PATH))->assertOk()
        ->assertHeader('Content-Type', 'text/calendar; charset=utf-8')
        ->getContent();
}

it('publie les éléments datés de la base : journées, heures, répétitions, tâches faites', function () {
    $workspace = signIn();
    $tasks = createTasks($workspace);
    [$first, $second, $third] = $tasks['database']['rows'];
    $this->patchJson("/api/pages/{$first['id']}", ['title' => 'Marché', 'properties' => [
        $tasks['due'] => ['start' => '2026-11-14', 'repeat' => ['unit' => 'week', 'interval' => 1, 'count' => 4]],
    ]]);
    $this->patchJson("/api/pages/{$second['id']}", ['title' => 'Dentiste', 'properties' => [
        $tasks['due'] => ['start' => '2026-11-12T13:30:00Z'],
        $tasks['status'] => $tasks['done'],
    ]]);
    $this->patchJson("/api/pages/{$third['id']}", ['title' => 'Sans date']);

    $url = $this->postJson("/api/databases/{$tasks['database']['id']}/feed")->assertOk()->json('data.feed_url');
    expect($url)->toMatch('#/api/feeds/[A-Za-z0-9]{40}\.ics$#');
    $this->getJson("/api/databases/{$tasks['database']['id']}")->assertJsonPath('data.feed_url', $url);

    $ics = feedOf($url);
    expect($ics)
        ->toContain('X-WR-CALNAME:Tâches')
        ->toContain('SUMMARY:Marché')
        ->toContain('DTSTART;VALUE=DATE:20261114')
        ->toContain('DTEND;VALUE=DATE:20261115')
        ->toContain('RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=4')
        ->toContain('SUMMARY:✓ Dentiste')
        ->toContain('DTSTART:20261112T133000Z')
        ->toContain('DTEND:20261112T140000Z')
        ->not->toContain('Sans date');
});

it('le lien se révoque, et la base d’un autre ne se publie pas', function () {
    $workspace = signIn();
    $tasks = createTasks($workspace);
    $url = $this->postJson("/api/databases/{$tasks['database']['id']}/feed")->json('data.feed_url');
    // Demander le lien deux fois donne le même.
    expect($this->postJson("/api/databases/{$tasks['database']['id']}/feed")->json('data.feed_url'))->toBe($url);

    $this->deleteJson("/api/databases/{$tasks['database']['id']}/feed")->assertJsonPath('data.feed_url', null);
    $this->get(parse_url($url, PHP_URL_PATH))->assertNotFound();

    signIn('Bruno');
    $this->postJson("/api/databases/{$tasks['database']['id']}/feed")->assertNotFound();
});

it('n’y met pas les événements importés d’un autre agenda', function () {
    $workspace = signIn();
    $tasks = createTasks($workspace);
    $row = $tasks['database']['rows'][0];
    $this->patchJson("/api/pages/{$row['id']}", ['title' => 'Importé', 'properties' => [$tasks['due'] => ['start' => '2026-11-14']]]);
    $source = new CalendarSource([
        'workspace_id' => $workspace->id, 'database_id' => $tasks['database']['id'], 'name' => 'École',
        'color' => 'blue', 'mode' => 'subscription', 'property_map' => ['date' => $tasks['due']],
    ]);
    $source->setUrl('https://agenda.example.com/a.ics');
    $source->forceFill(['status' => 'ok'])->save();
    Page::query()->whereKey($row['id'])->update(['calendar_source_id' => $source->id, 'ics_uid' => 'x']);

    $url = $this->postJson("/api/databases/{$tasks['database']['id']}/feed")->json('data.feed_url');
    expect(feedOf($url))->not->toContain('Importé');
});
