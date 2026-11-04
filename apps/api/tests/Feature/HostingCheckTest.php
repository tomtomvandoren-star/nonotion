<?php

it('valide l’environnement local sans tester le réseau', function () {
    $this->artisan('nonotion:hosting-check', ['--skip-network' => true])
        ->expectsOutputToContain('Collation utf8mb4_bin')
        ->expectsOutputToContain('Index FULLTEXT sur pages')
        ->assertSuccessful();
});
