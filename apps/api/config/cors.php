<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    // Le web de production est sur la même origine que l'API. Les autres : les vues web de
    // l'application pour ordinateur (Tauri 2 : macOS et Linux, puis Windows), toujours admises, et
    // celles de CORS_ALLOWED_ORIGINS (serveur de dev Vite, puis Capacitor en phase 9). Ces origines
    // n'ouvrent rien sans jeton : l'authentification passe par l'en-tête Authorization, pas un cookie.
    'allowed_origins' => array_values(array_unique(array_filter(array_map('trim', [
        'tauri://localhost',
        'http://tauri.localhost',
        'https://tauri.localhost',
        ...explode(',', (string) env('CORS_ALLOWED_ORIGINS', '')),
    ])))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    // Une seule vérification préalable (OPTIONS) par adresse et par heure, pas une par requête :
    // l'hébergement partagé reçoit deux fois moins d'appels de l'application pour ordinateur.
    'max_age' => 3600,

    'supports_credentials' => false,

];
