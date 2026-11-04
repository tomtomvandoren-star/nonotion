<?php

namespace App\Rules;

use App\Support\FractionalIndex;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/** Une clé d'ordre valide (fractional indexing), telle que la produit le front. */
class FractionalKey implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! FractionalIndex::isValid($value)) {
            $fail('La position est invalide.');
        }
    }
}
