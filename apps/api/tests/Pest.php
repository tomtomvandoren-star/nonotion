<?php

use App\Models\User;
use App\Models\Workspace;
use App\Support\Onboarding;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/*
| Les tests de fonctionnalité tournent sur MariaDB (base nonotion_test, voir phpunit.xml),
| comme en production : collations, index FULLTEXT et contraintes uniques en dépendent.
*/
pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

/** Crée un compte (avec son workspace et sa page de bienvenue). */
function createAccount(string $name = 'Alice'): User
{
    return Onboarding::createAccount($name, strtolower($name).'-'.uniqid().'@example.test', 'mot-de-passe-solide');
}

function workspaceOf(User $user): Workspace
{
    return Workspace::query()->withoutGlobalScopes()->where('owner_id', $user->id)->firstOrFail();
}

/**
 * Connecte un nouvel utilisateur pour la suite du test et renvoie son workspace.
 */
function signIn(string $name = 'Alice'): Workspace
{
    $user = createAccount($name);
    Sanctum::actingAs($user);

    return workspaceOf($user);
}
