<?php

namespace App\Support;

use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Throwable;

/**
 * Essaie le serveur SMTP sans envoyer d'e-mail : connexion, chiffrement, puis authentification
 * avec MAIL_USERNAME et MAIL_PASSWORD. Pour la vérification de l'hébergement : la raison d'un
 * échec (identifiants refusés, serveur injoignable…) s'y lit, sans jamais le mot de passe.
 */
class MailCheck
{
    /** null si le serveur accepte la connexion et les identifiants ; sinon, ce qui ne va pas. */
    public static function smtp(int $timeout = 10): ?string
    {
        try {
            $transport = Mail::mailer('smtp')->getSymfonyTransport();
            if (! $transport instanceof EsmtpTransport) {
                return null;
            }
            $transport->getStream()->setTimeout($timeout);
            $transport->start();
            $transport->stop();

            return null;
        } catch (Throwable $e) {
            return self::explain($e->getMessage());
        }
    }

    /** Le message du serveur, précédé de ce qu'il veut dire et de quoi changer dans .env. */
    public static function explain(string $message): string
    {
        $message = mb_substr(trim((string) preg_replace('/\s+/', ' ', $message)), 0, 300);
        $hint = match (true) {
            str_contains($message, '535') || stripos($message, 'authenticat') !== false => 'identifiants refusés : MAIL_USERNAME doit être l’adresse complète de la boîte, MAIL_PASSWORD son mot de passe (ou un mot de passe d’application si la double authentification est active)',
            stripos($message, 'could not be established') !== false || stripos($message, 'timed out') !== false || stripos($message, 'timeout') !== false => 'serveur injoignable : vérifier MAIL_HOST et MAIL_PORT (465 avec MAIL_SCHEME=smtps, ou 587 avec MAIL_SCHEME=smtp)',
            stripos($message, 'ssl') !== false || stripos($message, 'tls') !== false || stripos($message, 'certificate') !== false => 'chiffrement refusé : 465 va avec MAIL_SCHEME=smtps, 587 avec MAIL_SCHEME=smtp',
            default => 'refusé par le serveur',
        };

        return "{$hint} ({$message})";
    }
}
