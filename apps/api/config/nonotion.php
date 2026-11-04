<?php

return [

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
