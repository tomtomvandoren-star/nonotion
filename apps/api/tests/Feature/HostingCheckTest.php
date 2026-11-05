<?php

it('valide l’environnement local sans tester le réseau', function () {
    $this->artisan('nonotion:hosting-check', ['--skip-network' => true])
        ->expectsOutputToContain('Collation utf8mb4_bin')
        ->expectsOutputToContain('Index FULLTEXT sur pages')
        ->assertSuccessful();
});

it('signale une adresse d’expédition qui n’est pas une adresse complète', function () {
    config(['mail.default' => 'smtp', 'mail.mailers.smtp.username' => 'admin@example.test', 'mail.from.address' => 'example.test']);

    $this->artisan('nonotion:hosting-check', ['--skip-network' => true])
        ->expectsOutputToContain('n’est pas une adresse complète')
        ->assertFailed();
});
