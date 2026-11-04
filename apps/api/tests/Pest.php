<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
| Les tests de fonctionnalité tournent sur MariaDB (base nonotion_test, voir phpunit.xml),
| comme en production : collations, index FULLTEXT et contraintes uniques en dépendent.
*/
pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');
