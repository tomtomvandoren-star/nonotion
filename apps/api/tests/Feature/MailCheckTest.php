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

it('repère un mot de passe mal écrit dans .env, sans jamais le montrer', function () {
    expect(MailCheck::passwordFormat(''))->toBe(['MAIL_PASSWORD est vide'])
        ->and(MailCheck::passwordFormat(' abc '))->toBe(['MAIL_PASSWORD commence ou finit par un espace'])
        ->and(MailCheck::passwordFormat('"abc"'))->toBe(['MAIL_PASSWORD garde ses guillemets dans la valeur lue'])
        ->and(MailCheck::passwordFormat('Ab1', 'MAIL_PASSWORD=Ab1 #x9'))
        ->toBe(['un « # » après un espace coupe MAIL_PASSWORD : l’entourer de guillemets simples'])
        ->and(MailCheck::passwordFormat('Ab', 'MAIL_PASSWORD="Ab${X}"'))
        ->toBe(['MAIL_PASSWORD contient « ${ », remplacé à la lecture : l’entourer de guillemets simples'])
        ->and(MailCheck::passwordFormat('Ab#1$x', "MAIL_PASSWORD='Ab#1\$x'"))->toBe([])
        ->and(MailCheck::passwordFormat('Ab#1', 'MAIL_PASSWORD=Ab#1'))->toBe([]);

    $env = tempnam(sys_get_temp_dir(), 'env');
    file_put_contents($env, "APP_NAME=Nonotion\r\nMAIL_PASSWORD='secret'\r\nMAIL_FROM_ADDRESS=a@b.c\r\n");
    expect(MailCheck::passwordLine($env))->toBe("MAIL_PASSWORD='secret'");
    unlink($env);
});

it('la vérification envoie un e-mail de test et montre le dernier envoi raté du site, adresses masquées', function () {
    config(['mail.default' => 'array', 'mail.from.address' => 'admin@exemple.test']);
    MailCheck::rememberFailure(new RuntimeException('Process failed with exit code 1: refused for jean@exemple.be'));

    expect(MailCheck::maskAddresses('refused for jean@exemple.be'))->toBe('refused for …@exemple.be')
        ->and(MailCheck::explain('Process failed with exit code 1: refused'))->toStartWith('sendmail a refusé l’e-mail');

    $this->artisan('nonotion:hosting-check', ['--skip-network' => true, '--mail-test' => true])
        ->expectsOutputToContain('Dernier envoi raté par le site')
        ->doesntExpectOutputToContain('jean@exemple.be')
        ->expectsOutputToContain('E-mail de test à …@exemple.test')
        ->assertSuccessful();

    $sent = app('mailer')->getSymfonyTransport()->messages();
    expect($sent)->toHaveCount(1)
        ->and($sent->first()->getOriginalMessage()->getSubject())->toBe('Nonotion : e-mail de test');
});
