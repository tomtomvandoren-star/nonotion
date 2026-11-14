<?php

namespace App\Support\Scheduling;

use RuntimeException;

/** Le créneau n'est plus libre (pris entre-temps, ou plus proposé) : à choisir de nouveau. */
class SlotTaken extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Ce créneau n’est plus disponible. Choisissez-en un autre.');
    }
}
