<?php

return [

    /*
    | Inscriptions. Usage personnel d'abord (spec 2) : le premier compte peut toujours être créé,
    | les suivants seulement si REGISTRATION_OPEN=true.
    */
    'registration_open' => (bool) env('REGISTRATION_OPEN', false),

    /*
    | Adresse du front, pour les liens envoyés par e-mail (réinitialisation du mot de passe).
    */
    'frontend_url' => rtrim((string) env('FRONTEND_URL', env('APP_URL', 'http://localhost')), '/'),

    /*
    | Corbeille : les pages supprimées sont purgées définitivement après ce nombre de jours (spec 6.13).
    */
    'trash_retention_days' => 30,

    /*
    | Déclenchement du planificateur par le Planificateur de tâches du Manager Infomaniak.
    | Sur l'hébergement mutualisé, il n'appelle qu'une URL (au plus toutes les 15 minutes) :
    | GET /api/cron, protégée par une authentification HTTP Basic.
    | Sans mot de passe, l'URL est désactivée (404).
    */
    'cron' => [
        'user' => env('CRON_USER', 'nonotion-cron'),
        'password' => env('CRON_PASSWORD'),
    ],

    /*
    | Import d'agendas par lien ICS (spec 6.9).
    | allow_private_hosts : adresses locales autorisées malgré la protection SSRF (« 127.0.0.1:8765 »),
    | pour les tests de bout en bout seulement ; jamais prises en compte en production.
    */
    'ics' => [
        'timeout' => 10,
        'max_bytes' => 10 * 1024 * 1024,
        'max_redirects' => 3,
        'window_past_days' => 31,
        'window_future_days' => 366,
        'batch_size' => 200,
        'sync_every_minutes' => 30,
        'allow_private_hosts' => array_filter(explode(',', (string) env('ICS_ALLOW_PRIVATE_HOSTS', ''))),
    ],

    /*
    | Agendas des comptes connectés (spec 6.15). Google : identifiants OAuth dans config/services.php.
    | iCloud (CalDAV) : seuls les serveurs d'Apple sont joints (allowed_hosts) ; caldav_url ne change
    | que pour les tests.
    | sync_every_minutes : le webcron synchronise au plus à ce rythme ; l'ouverture de l'Agenda, plus souvent.
    */
    'accounts' => [
        'sync_every_minutes' => 15,
        'sync_on_open_minutes' => 2,
    ],
    'icloud' => [
        'caldav_url' => env('ICLOUD_CALDAV_URL', 'https://caldav.icloud.com'),
        'allowed_hosts' => '/^([a-z0-9-]+\.)?icloud\.com$/i',
    ],

];
