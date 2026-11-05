<?php

namespace App\Support\Calendars;

use RuntimeException;

/**
 * Un agenda qu'on n'a pas pu lire (lien refusé, serveur muet, fichier invalide…), avec un message
 * clair pour l'utilisateur, qui ne contient jamais le lien (c'est un secret).
 */
class FetchFailed extends RuntimeException {}
