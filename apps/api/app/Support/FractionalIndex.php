<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * Clés d'ordre triables (fractional indexing), portage fidèle de la bibliothèque JavaScript
 * « fractional-indexing » 4.0.0 qu'utilise le front : les deux côtés produisent les mêmes clés.
 * Les clés se comparent octet par octet (strcmp), comme la collation utf8mb4_bin de `position`.
 *
 * Alphabets par défaut de la bibliothèque : chiffres en base 62, tête de la partie entière en
 * base 52 (A-Z pour les longueurs « négatives », a-z pour les positives), d'où « a0 », « Zz »…
 */
class FractionalIndex
{
    private const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    private const INT_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    /** Clé qui se place entre $a et $b (null = début ou fin de liste). */
    public static function between(?string $a, ?string $b): string
    {
        if ($a !== null) {
            self::assertValid($a);
        }
        if ($b !== null) {
            self::assertValid($b);
        }
        if ($a !== null && $b !== null && strcmp($a, $b) > 0) {
            [$a, $b] = [$b, $a];
        }

        if ($a === null) {
            if ($b === null) {
                return self::INT_DIGITS[strlen(self::INT_DIGITS) / 2].self::DIGITS[0];
            }

            $ib = self::integerPart($b);
            $fb = substr($b, strlen($ib));
            if ($ib === self::smallestInteger()) {
                return $ib.self::midpoint('', $fb);
            }
            if (strcmp($ib, $b) < 0) {
                return $ib;
            }

            return self::decrementInteger($ib) ?? throw new InvalidArgumentException('cannot decrement any more');
        }

        if ($b === null) {
            $ia = self::integerPart($a);
            $fa = substr($a, strlen($ia));

            return self::incrementInteger($ia) ?? $ia.self::midpoint($fa, null);
        }

        $ia = self::integerPart($a);
        $fa = substr($a, strlen($ia));
        $ib = self::integerPart($b);
        $fb = substr($b, strlen($ib));
        if ($ia === $ib) {
            return $ia.self::midpoint($fa, $fb);
        }

        $i = self::incrementInteger($ia) ?? throw new InvalidArgumentException('cannot increment any more');

        return strcmp($i, $b) < 0 ? $i : $ia.self::midpoint($fa, null);
    }

    /** Clé valide ? Plus strict que la bibliothèque JS : seuls les caractères de l'alphabet sont admis. */
    public static function isValid(string $key): bool
    {
        if (preg_match('/^[0-9A-Za-z]{2,64}$/', $key) !== 1) {
            return false;
        }

        try {
            self::assertValid($key);

            return true;
        } catch (InvalidArgumentException) {
            return false;
        }
    }

    private static function assertValid(string $key): void
    {
        if ($key === self::smallestInteger()) {
            throw new InvalidArgumentException("invalid order key: {$key}");
        }
        $integer = self::integerPart($key);
        if (str_ends_with(substr($key, strlen($integer)), self::DIGITS[0])) {
            throw new InvalidArgumentException("invalid order key: {$key}");
        }
    }

    private static function smallestInteger(): string
    {
        return self::INT_DIGITS[0].str_repeat(self::DIGITS[0], strlen(self::INT_DIGITS) / 2);
    }

    private static function integerLength(string $head): int
    {
        $i = $head === '' ? false : strpos(self::INT_DIGITS, $head);
        if ($i === false) {
            throw new InvalidArgumentException("invalid order key head: {$head}");
        }
        $half = intdiv(strlen(self::INT_DIGITS), 2);

        return $i < $half ? $half - $i + 1 : $i - $half + 2;
    }

    private static function integerPart(string $key): string
    {
        $length = self::integerLength($key[0] ?? '');
        if ($length > strlen($key)) {
            throw new InvalidArgumentException("invalid order key: {$key}");
        }

        return substr($key, 0, $length);
    }

    private static function digit(string $char): int
    {
        return (int) strpos(self::DIGITS, $char);
    }

    /** $a peut être vide, $b est null ou non vide ; $a < $b ; pas de zéro final. */
    private static function midpoint(string $a, ?string $b): string
    {
        $zero = self::DIGITS[0];
        if ($b !== null && strcmp($a, $b) >= 0) {
            throw new InvalidArgumentException("{$a} >= {$b}");
        }
        if (str_ends_with($a, $zero) || ($b !== null && str_ends_with($b, $zero))) {
            throw new InvalidArgumentException('trailing zero');
        }

        if ($b !== null && $b !== '') {
            // Retire le plus long préfixe commun (en complétant $a par des zéros).
            $n = 0;
            while ($n < strlen($b) && ($a[$n] ?? $zero) === $b[$n]) {
                $n++;
            }
            if ($n > 0) {
                return substr($b, 0, $n).self::midpoint(substr($a, $n), substr($b, $n));
            }
        }

        $digitA = $a !== '' ? self::digit($a[0]) : 0;
        $digitB = $b !== null ? self::digit($b[0]) : strlen(self::DIGITS);
        if ($digitB - $digitA > 1) {
            return self::DIGITS[(int) floor(0.5 * ($digitA + $digitB) + 0.5)];
        }
        if ($b !== null && strlen($b) > 1) {
            return $b[0];
        }

        return self::DIGITS[$digitA].self::midpoint(substr($a, 1), null);
    }

    private static function validateInteger(string $integer): void
    {
        if (strlen($integer) !== self::integerLength($integer[0] ?? '')) {
            throw new InvalidArgumentException("invalid integer part of order key: {$integer}");
        }
    }

    private static function incrementInteger(string $x): ?string
    {
        self::validateInteger($x);
        $head = $x[0];
        $trailing = '';
        for ($i = strlen($x) - 1; $i >= 1; $i--) {
            $d = self::digit($x[$i]) + 1;
            if ($d === strlen(self::DIGITS)) {
                $trailing = self::DIGITS[0].$trailing;
            } else {
                return $head.substr($x, 1, $i - 1).self::DIGITS[$d].$trailing;
            }
        }

        $headIndex = (int) strpos(self::INT_DIGITS, $head);
        if ($headIndex === strlen(self::INT_DIGITS) - 1) {
            return null;
        }
        $h = self::INT_DIGITS[$headIndex + 1];
        $delta = self::integerLength($h) - self::integerLength($head);

        return $h.($delta > 0 ? $trailing.self::DIGITS[0] : ($delta < 0 ? substr($trailing, 1) : $trailing));
    }

    private static function decrementInteger(string $x): ?string
    {
        self::validateInteger($x);
        $head = $x[0];
        $last = self::DIGITS[strlen(self::DIGITS) - 1];
        $trailing = '';
        for ($i = strlen($x) - 1; $i >= 1; $i--) {
            $d = self::digit($x[$i]) - 1;
            if ($d === -1) {
                $trailing = $last.$trailing;
            } else {
                return $head.substr($x, 1, $i - 1).self::DIGITS[$d].$trailing;
            }
        }

        $headIndex = (int) strpos(self::INT_DIGITS, $head);
        if ($headIndex === 0) {
            return null;
        }
        $h = self::INT_DIGITS[$headIndex - 1];
        $delta = self::integerLength($h) - self::integerLength($head);

        return $h.($delta > 0 ? $trailing.$last : ($delta < 0 ? substr($trailing, 1) : $trailing));
    }
}
