<?php

use App\Support\FractionalIndex;

// Valeurs de référence produites par la bibliothèque JavaScript « fractional-indexing » 4.0.0
// (celle du front) : le serveur doit générer exactement les mêmes clés.
dataset('reference', [
    [null, null, 'a0'],
    ['a0', null, 'a1'],
    [null, 'a0', 'Zz'],
    ['a0', 'a1', 'a0V'],
    ['a0', 'a0V', 'a0G'],
    ['a0V', 'a1', 'a0l'],
    ['Zz', 'a0', 'ZzV'],
    ['a1', 'a0', 'a0V'],
    ['az', null, 'b00'],
    ['z'.str_repeat('z', 26), null, 'z'.str_repeat('z', 26).'V'],
    [null, 'A'.str_repeat('0', 25).'1', 'A'.str_repeat('0', 26)],
    ['a0', 'a01', 'a00V'],
    ['b00', 'b01', 'b00V'],
    ['a9', 'aA', 'a9V'],
    ['aZ', 'aa', 'aZV'],
    [null, 'Zz', 'Zy'],
    ['Yzz', 'Z0', 'YzzV'],
    ['a0', 'a04', 'a02'],
    ['a0', 'a00V', 'a00G'],
]);

it('produit les mêmes clés que la bibliothèque du front', function (?string $a, ?string $b, string $expected) {
    expect(FractionalIndex::between($a, $b))->toBe($expected);
})->with('reference');

it('ajoute en fin de liste comme le front', function () {
    $keys = [];
    $key = null;
    for ($i = 0; $i < 70; $i++) {
        $key = FractionalIndex::between($key, null);
        if ($i % 9 === 0 || $i > 60) {
            $keys[] = $key;
        }
    }

    expect($keys)->toBe(['a0', 'a9', 'aI', 'aR', 'aa', 'aj', 'as', 'az', 'b00', 'b01', 'b02', 'b03', 'b04', 'b05', 'b06', 'b07']);
});

it('garde toujours une clé strictement entre ses voisines', function () {
    $low = 'a0';
    $high = 'a1';
    for ($i = 0; $i < 200; $i++) {
        $middle = FractionalIndex::between($low, $high);
        expect(strcmp($low, $middle))->toBeLessThan(0)
            ->and(strcmp($middle, $high))->toBeLessThan(0);
        $i % 2 === 0 ? $high = $middle : $low = $middle;
    }
});

it('reconnaît les clés invalides', function (string $key) {
    expect(FractionalIndex::isValid($key))->toBeFalse();
})->with(['', 'a', 'a00', 'A'.str_repeat('0', 26), '!0', 'b0', 'a0 ', str_repeat('a', 65)]);

it('accepte les clés produites', function (string $key) {
    expect(FractionalIndex::isValid($key))->toBeTrue();
})->with(['a0', 'Zz', 'a0V', 'b00', 'ZzV']);
