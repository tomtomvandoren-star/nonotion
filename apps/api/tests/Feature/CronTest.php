<?php

use App\Support\Heartbeat;

beforeEach(function () {
    config(['nonotion.cron.user' => 'nonotion-cron', 'nonotion.cron.password' => 'secret-de-test']);
});

it('lance le planificateur avec les bons identifiants', function () {
    $this->withBasicAuth('nonotion-cron', 'secret-de-test')
        ->getJson('/api/cron')
        ->assertOk()
        ->assertJson(['status' => 'ok']);

    expect(Heartbeat::lastSeen(Heartbeat::CRON))->not->toBeNull();
    expect($this->getJson('/api/health')->json('cron_last_run_at'))->not->toBeNull();
});

it('refuse un appel sans identifiants et demande une authentification', function () {
    $this->getJson('/api/cron')
        ->assertUnauthorized()
        ->assertHeader('WWW-Authenticate', 'Basic realm="Nonotion cron"');

    expect(Heartbeat::lastSeen(Heartbeat::CRON))->toBeNull();
});

it('refuse un mauvais mot de passe', function () {
    $this->withBasicAuth('nonotion-cron', 'mauvais')->getJson('/api/cron')->assertUnauthorized();
    $this->withBasicAuth('autre', 'secret-de-test')->getJson('/api/cron')->assertUnauthorized();

    expect(Heartbeat::lastSeen(Heartbeat::CRON))->toBeNull();
});

it('est désactivée tant qu’aucun mot de passe n’est configuré', function () {
    config(['nonotion.cron.password' => null]);

    $this->withBasicAuth('nonotion-cron', '')->getJson('/api/cron')->assertNotFound();
});
