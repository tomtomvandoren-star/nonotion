<?php

use App\Support\Heartbeat;
use Illuminate\Support\Facades\DB;

it('écrit puis relit une ligne en base et répond ok', function () {
    $this->getJson('/api/health')
        ->assertOk()
        ->assertJson(['status' => 'ok', 'database' => 'ok', 'cron_last_run_at' => null])
        ->assertJsonStructure(['checked_at']);

    expect(DB::table('health_checks')->where('name', Heartbeat::WEB)->exists())->toBeTrue();
});

it('indique le dernier passage du planificateur', function () {
    $this->artisan('schedule:run')->assertSuccessful();

    $cron = $this->getJson('/api/health')->assertOk()->json('cron_last_run_at');

    expect($cron)->not->toBeNull();
});

it('répond 503 sans détail technique quand la base est injoignable', function () {
    $port = config('database.connections.mariadb.port');
    config(['database.connections.mariadb.port' => 1]);
    DB::purge('mariadb');

    try {
        $this->getJson('/api/health')
            ->assertStatus(503)
            ->assertExactJson(['status' => 'error', 'database' => 'unreachable']);
    } finally {
        config(['database.connections.mariadb.port' => $port]);
        DB::purge('mariadb');
    }
});
