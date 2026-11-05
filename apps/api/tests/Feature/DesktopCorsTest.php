<?php

/*
 * L'application pour ordinateur (Tauri 2, phase 8) parle à l'API depuis une autre origine que le
 * site : tauri://localhost (macOS, Linux) ou http://tauri.localhost (Windows).
 */

it('admet les vues web de l’application pour ordinateur', function (string $origin) {
    $this->call('OPTIONS', '/api/auth/login', server: [
        'HTTP_ORIGIN' => $origin,
        'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
        'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'authorization, content-type',
    ])
        ->assertNoContent()
        ->assertHeader('Access-Control-Allow-Origin', $origin)
        ->assertHeader('Access-Control-Max-Age', '3600');

    $this->getJson('/api/health', ['Origin' => $origin])
        ->assertOk()
        ->assertHeader('Access-Control-Allow-Origin', $origin);
})->with(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']);

it('n’admet pas un autre site', function () {
    $this->getJson('/api/health', ['Origin' => 'https://ailleurs.example'])
        ->assertOk()
        ->assertHeaderMissing('Access-Control-Allow-Origin');
});
