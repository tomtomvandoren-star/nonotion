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

];
