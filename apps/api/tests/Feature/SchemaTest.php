<?php

use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Crée un utilisateur et son workspace, renvoie l'id du workspace. */
function makeWorkspace(): string
{
    $userId = (string) Str::ulid();
    DB::table('users')->insert([
        'id' => $userId, 'name' => 'Test', 'email' => $userId.'@example.test', 'password' => 'x',
    ]);

    $workspaceId = (string) Str::ulid();
    DB::table('workspaces')->insert(['id' => $workspaceId, 'name' => 'Perso', 'owner_id' => $userId]);

    return $workspaceId;
}

function insertPage(string $workspaceId, array $attributes = []): string
{
    $id = (string) Str::ulid();
    DB::table('pages')->insert([
        'id' => $id, 'workspace_id' => $workspaceId, 'position' => 'a0', ...$attributes,
    ]);

    return $id;
}

it('trie les positions en ordre binaire, comme le fractional indexing l’exige', function () {
    $workspaceId = makeWorkspace();
    foreach (['a0', 'Zz', 'a', 'B'] as $position) {
        insertPage($workspaceId, ['position' => $position]);
    }

    $order = DB::table('pages')->where('workspace_id', $workspaceId)->orderBy('position')->pluck('position');

    // Une collation insensible à la casse donnerait a, a0, B, Zz.
    expect($order->all())->toBe(['B', 'Zz', 'a', 'a0']);
});

it('refuse deux fois le même événement ICS d’un même agenda', function () {
    $workspaceId = makeWorkspace();
    $pageId = insertPage($workspaceId);

    $databaseId = (string) Str::ulid();
    DB::table('databases')->insert([
        'id' => $databaseId, 'workspace_id' => $workspaceId, 'page_id' => $pageId, 'schema' => '[]',
    ]);

    $sourceId = (string) Str::ulid();
    DB::table('calendar_sources')->insert([
        'id' => $sourceId, 'workspace_id' => $workspaceId, 'database_id' => $databaseId,
        'name' => 'Cours', 'url_encrypted' => 'x', 'url_host' => 'example.test',
        'url_hash' => str_repeat('0', 64), 'mode' => 'subscription',
    ]);

    $event = ['database_id' => $databaseId, 'calendar_source_id' => $sourceId, 'ics_uid' => 'uid-1'];
    insertPage($workspaceId, $event);

    // Sans RECURRENCE-ID, la valeur par défaut '' (et non NULL) rend la clé unique effective.
    expect(fn () => insertPage($workspaceId, $event))->toThrow(UniqueConstraintViolationException::class);

    // Une autre occurrence du même événement récurrent reste acceptée.
    insertPage($workspaceId, [...$event, 'ics_recurrence_id' => '20261109T080000Z']);
    expect(DB::table('pages')->where('ics_uid', 'uid-1')->count())->toBe(2);
});

it('laisse créer autant de pages ordinaires que voulu', function () {
    $workspaceId = makeWorkspace();
    insertPage($workspaceId);
    insertPage($workspaceId);

    expect(DB::table('pages')->where('workspace_id', $workspaceId)->count())->toBe(2);
});

it('a un index FULLTEXT sur le titre et le texte des pages', function () {
    $columns = collect(DB::select("SHOW INDEX FROM pages WHERE Index_type = 'FULLTEXT'"))
        ->pluck('Column_name')
        ->sort()
        ->values()
        ->all();

    expect($columns)->toBe(['search_text', 'title']);
});
