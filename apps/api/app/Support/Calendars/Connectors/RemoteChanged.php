<?php

namespace App\Support\Calendars\Connectors;

use RuntimeException;

/** L'événement a changé chez le fournisseur depuis la dernière synchronisation (If-Match refusé). */
class RemoteChanged extends RuntimeException {}
