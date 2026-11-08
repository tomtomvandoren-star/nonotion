<?php

use App\Support\PhpMailTransport;
use Symfony\Component\Mailer\Exception\TransportException;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

/*
 * Envoi par mail() de PHP, quand le site ne peut pas lancer sendmail (proc_open désactivé sur
 * l'hébergement mutualisé) : le message préparé par Symfony est remis à mail() en morceaux.
 */

function capturingTransport(array &$calls, bool $accept = true): PhpMailTransport
{
    return new PhpMailTransport(function (string $to, string $subject, string $body, string $headers, string $params) use (&$calls, $accept) {
        $calls[] = compact('to', 'subject', 'body', 'headers', 'params');

        return $accept;
    });
}

it('remet à mail() le destinataire, le sujet, les en-têtes sans To ni Bcc, et l’expéditeur -f', function () {
    $calls = [];
    capturingTransport($calls)->send((new Email)
        ->from(new Address('admin@exemple.test', 'Nonotion'))
        ->to('gaby@exemple.test')
        ->bcc('cache@exemple.test')
        ->subject('Réinitialiser votre mot de passe Nonotion')
        ->text("Bonjour Gaby,\nVoici votre lien."));

    expect($calls)->toHaveCount(1);
    ['to' => $to, 'subject' => $subject, 'body' => $body, 'headers' => $headers, 'params' => $params] = $calls[0];
    expect($to)->toBe('gaby@exemple.test')
        ->and(iconv_mime_decode($subject, 0, 'UTF-8'))->toBe('Réinitialiser votre mot de passe Nonotion')
        ->and($subject)->not->toContain("\n")
        ->and($headers)->toContain('From: Nonotion <admin@exemple.test>')
        ->and($headers)->toContain('MIME-Version: 1.0')
        ->and($headers)->not->toMatch('/^(To|Subject|Bcc):/mi')
        ->and($body)->toContain('Voici votre lien.')
        ->and($params)->toBe('-fadmin@exemple.test');
});

it('un refus de mail() devient une erreur d’envoi (le site répond alors 503)', function () {
    $calls = [];
    capturingTransport($calls, accept: false)->send((new Email)
        ->from('admin@exemple.test')->to('gaby@exemple.test')->subject('Test')->text('x'));
})->throws(TransportException::class, 'mail() a refusé l’e-mail');
