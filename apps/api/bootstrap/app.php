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

        // Le document d'une page est enregistré tel quel : les espaces en bord de texte
        // et les textes vides font partie du contenu (« Deuxième » + « ligne »).
        $isPageContent = fn (Request $request) => $request->is('api/pages/*/content');
        $middleware->trimStrings(except: [$isPageContent]);
        $middleware->convertEmptyStringsToNull(except: [$isPageContent]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
