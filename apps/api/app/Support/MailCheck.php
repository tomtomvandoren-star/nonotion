<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
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
    /** Le dernier envoi raté par le site (pas par la console), pour la vérification de l'hébergement. */
    private const LAST_FAILURE = 'mail:last_failure';

    /** Retient l'erreur d'un envoi raté par le site : la vérification de l'hébergement la montrera. */
    public static function rememberFailure(Throwable $e): void
    {
        Cache::put(self::LAST_FAILURE, [
            'at' => now()->toIso8601String(),
            'message' => mb_substr($e->getMessage(), 0, 500),
        ], now()->addDays(7));
    }

    /** @return array{at: string, message: string}|null */
    public static function lastFailure(): ?array
    {
        $failure = Cache::get(self::LAST_FAILURE);

        return is_array($failure) ? $failure : null;
    }

    /** Envoie un e-mail de test : null s'il est parti, sinon ce qui ne va pas. */
    public static function send(string $to): ?string
    {
        try {
            Mail::raw(
                'Ceci est un e-mail de test de Nonotion, envoyé par la vérification de l’hébergement. Il peut être supprimé.',
                fn ($message) => $message->to($to)->subject('Nonotion : e-mail de test'),
            );

            return null;
        } catch (Throwable $e) {
            return self::explain($e->getMessage());
        }
    }

    /** « jean@exemple.be » devient « …@exemple.be » : la vérification n'affiche aucune adresse. */
    public static function maskAddresses(string $text): string
    {
        return (string) preg_replace('/[^\s<>"\'(),;:]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/', '…@$1', $text);
    }

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

    /**
     * Ce qui cloche dans la façon dont MAIL_PASSWORD est écrit dans .env, sans jamais le montrer :
     * vide, espaces autour, guillemets gardés, « # » ou « ${ » qui changent la valeur lue.
     *
     * @param  string|null  $line  la ligne « MAIL_PASSWORD=… » du fichier .env, telle qu'écrite
     * @return list<string>
     */
    public static function passwordFormat(?string $password, ?string $line = null): array
    {
        $problems = [];
        if ($password === null || $password === '') {
            $problems[] = 'MAIL_PASSWORD est vide';
        } elseif ($password !== trim($password)) {
            $problems[] = 'MAIL_PASSWORD commence ou finit par un espace';
        } elseif (preg_match('/^([\'"]).*\1$/s', $password)) {
            $problems[] = 'MAIL_PASSWORD garde ses guillemets dans la valeur lue';
        }

        $raw = $line === null ? null : trim((string) preg_replace('/^\s*(export\s+)?MAIL_PASSWORD\s*=/', '', $line));
        if ($raw !== null && $raw !== '') {
            $quote = $raw[0];
            if ($quote !== '"' && $quote !== "'" && preg_match('/\s#/', $raw)) {
                $problems[] = 'un « # » après un espace coupe MAIL_PASSWORD : l’entourer de guillemets simples';
            } elseif ($quote !== "'" && str_contains($raw, '${')) {
                $problems[] = 'MAIL_PASSWORD contient « ${ », remplacé à la lecture : l’entourer de guillemets simples';
            } elseif ($quote !== '"' && $quote !== "'" && preg_match('/\s/', $raw)) {
                $problems[] = 'MAIL_PASSWORD contient un espace : l’entourer de guillemets simples';
            }
        }

        return $problems;
    }

    /** La ligne MAIL_PASSWORD du fichier .env (pour passwordFormat), ou null. */
    public static function passwordLine(string $envFile): ?string
    {
        $lines = is_readable($envFile) ? (file($envFile, FILE_IGNORE_NEW_LINES) ?: []) : [];
        foreach ($lines as $line) {
            if (preg_match('/^\s*(export\s+)?MAIL_PASSWORD\s*=/', $line)) {
                return rtrim($line, "\r");
            }
        }

        return null;
    }

    /** Le message du serveur, précédé de ce qu'il veut dire et de quoi changer dans .env. */
    public static function explain(string $message): string
    {
        $message = mb_substr(trim((string) preg_replace('/\s+/', ' ', $message)), 0, 300);
        $hint = match (true) {
            stripos($message, 'exit code') !== false || stripos($message, 'process') !== false => 'sendmail a refusé l’e-mail : la réponse de la commande suit',
            str_contains($message, '535') || stripos($message, 'authenticat') !== false => 'identifiants refusés : MAIL_USERNAME doit être l’adresse complète de la boîte, MAIL_PASSWORD son mot de passe (ou un mot de passe d’application si la double authentification est active)',
            stripos($message, 'could not be established') !== false || stripos($message, 'timed out') !== false || stripos($message, 'timeout') !== false => 'serveur injoignable : vérifier MAIL_HOST et MAIL_PORT (465 avec MAIL_SCHEME=smtps, ou 587 avec MAIL_SCHEME=smtp)',
            stripos($message, 'ssl') !== false || stripos($message, 'tls') !== false || stripos($message, 'certificate') !== false => 'chiffrement refusé : 465 va avec MAIL_SCHEME=smtps, 587 avec MAIL_SCHEME=smtp',
            default => 'refusé par le serveur',
        };

        return "{$hint} ({$message})";
    }
}
