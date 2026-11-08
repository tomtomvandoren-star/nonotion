<?php

use App\Support\MailCheck;

/*
 * La vérification de l'hébergement essaie le serveur SMTP (sans envoyer d'e-mail) et dit quoi
 * changer dans .env quand il refuse.
 */

it('un serveur SMTP injoignable est signalé, avec les réglages à vérifier', function () {
    config([
        'mail.default' => 'smtp',
        'mail.mailers.smtp.host' => '127.0.0.1',
        'mail.mailers.smtp.port' => 1,
        'mail.mailers.smtp.scheme' => 'smtp',
        'mail.mailers.smtp.username' => 'admin@example.test',
        'mail.mailers.smtp.password' => 'secret-de-test',
    ]);

    $problem = MailCheck::smtp(timeout: 2);

    expect($problem)->toStartWith('serveur injoignable : vérifier MAIL_HOST et MAIL_PORT')
        ->and($problem)->not->toContain('secret-de-test');
});

it('identifiants refusés : le message dit quoi mettre dans MAIL_USERNAME et MAIL_PASSWORD', function () {
    $explained = MailCheck::explain('Failed to authenticate on SMTP server with username "admin@example.test" using the following authenticators: "LOGIN", "PLAIN". Authenticator "LOGIN" returned "Expected response code "235" but got code "535", with message "535 5.7.0 Invalid login or password"."');

    expect($explained)->toStartWith('identifiants refusés : MAIL_USERNAME doit être l’adresse complète de la boîte')
        ->and($explained)->toContain('535 5.7.0 Invalid login or password');
    expect(MailCheck::explain('Connection to "ssl://mail.example.test:465" timed out.'))->toStartWith('serveur injoignable');
});
