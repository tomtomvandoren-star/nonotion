<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        // Pas de routes « web » : le front est une SPA servie en fichiers statiques (voir public/.htaccess).
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // L'API répond 401 en JSON ; la page de connexion appartient au front.
        $middleware->redirectGuestsTo('/login');

        // Le document d'une page et les valeurs des bases sont enregistrés tels quels : les espaces
        // en bord de texte et les textes vides en font partie (« Deuxième » + « ligne », une cellule
        // vidée vaut « » et non null).
        $isRawData = fn (Request $request) => $request->is('api/pages/*/content')
            || $request->is('api/databases/*')
            || $request->is('api/views/*')
            || ($request->is('api/pages/*') && $request->has('properties'));
        $middleware->trimStrings(except: [$isRawData]);
        $middleware->convertEmptyStringsToNull(except: [$isRawData]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
