<?php

namespace Tests\Support;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/**
 * Un faux Google (OAuth et API Calendar v3) en mémoire, pour les tests : il garde ses événements,
 * leurs ETag, et refuse une modification dont l'If-Match n'est plus le bon (412), comme Google.
 */
class FakeGoogle
{
    /** @var array<string, array<string, mixed>> les événements par identifiant */
    public array $events = [];

    /** @var list<array{method: string, url: string, body: array<string, mixed>}> */
    public array $writes = [];

    public bool $refuseRefresh = false;

    public bool $failWrites = false;

    public int $refreshes = 0;

    private int $counter = 0;

    public function __construct(public string $email = 'moi@gmail.com', public string $calendarId = 'moi@gmail.com') {}

    public static function install(): self
    {
        $google = new self;
        Http::fake(fn (Request $request) => $google->handle($request));

        return $google;
    }

    /** Ajoute un événement « chez Google » (journée entière si $start est une date). */
    public function add(string $id, string $title, string $start, ?string $end = null, array $extra = []): void
    {
        $this->events[$id] = [
            'id' => $id,
            'iCalUID' => "{$id}@google.com",
            'status' => 'confirmed',
            'summary' => $title,
            'etag' => '"'.(++$this->counter).'"',
            'updated' => now()->toIso8601String(),
            'htmlLink' => "https://calendar.google.com/event?eid={$id}",
            ...(strlen($start) === 10
                ? ['start' => ['date' => $start], 'end' => ['date' => $end ?? date('Y-m-d', strtotime($start.' +1 day'))]]
                : ['start' => ['dateTime' => $start, 'timeZone' => 'Europe/Brussels'], 'end' => ['dateTime' => $end ?? $start, 'timeZone' => 'Europe/Brussels']]),
            ...$extra,
        ];
    }

    /** Une modification faite dans Google Agenda : nouvel ETag, nouvelle date de modification. */
    public function editRemotely(string $id, array $changes): void
    {
        $this->events[$id] = [...$this->events[$id], ...$changes, 'etag' => '"'.(++$this->counter).'"', 'updated' => now()->toIso8601String()];
    }

    private function handle(Request $request): mixed
    {
        $url = $request->url();
        $method = $request->method();
        $path = (string) parse_url($url, PHP_URL_PATH);

        if (str_starts_with($url, 'https://oauth2.googleapis.com/token')) {
            parse_str($request->body(), $form);
            if ($form['grant_type'] === 'refresh_token') {
                $this->refreshes++;
                if ($this->refuseRefresh) {
                    return Http::response(['error' => 'invalid_grant'], 400);
                }

                return Http::response(['access_token' => 'jeton-acces-'.$this->refreshes, 'expires_in' => 3600]);
            }

            return Http::response(['access_token' => 'jeton-acces', 'refresh_token' => 'jeton-durable-secret', 'expires_in' => 3600]);
        }
        if (str_starts_with($url, 'https://oauth2.googleapis.com/revoke')) {
            $this->writes[] = ['method' => 'REVOKE', 'url' => $url, 'body' => []];

            return Http::response([]);
        }
        if (str_starts_with($url, 'https://openidconnect.googleapis.com/v1/userinfo')) {
            return Http::response(['email' => $this->email]);
        }
        if (str_ends_with($path, '/users/me/calendarList')) {
            return Http::response(['items' => [
                ['id' => $this->calendarId, 'summary' => 'Moi', 'backgroundColor' => '#9fe1e7', 'accessRole' => 'owner'],
                ['id' => 'fr.be#holiday@group.v.calendar.google.com', 'summary' => 'Jours fériés', 'accessRole' => 'reader'],
            ]]);
        }

        $prefix = '/calendar/v3/calendars/'.rawurlencode($this->calendarId).'/events';
        if (! str_starts_with($path, $prefix)) {
            return Http::response(['error' => 'not found'], 404);
        }
        $id = rawurldecode(ltrim(substr($path, strlen($prefix)), '/'));

        if ($method === 'GET' && $id === '') {
            return Http::response(['items' => array_values($this->events)]);
        }
        if ($this->failWrites) {
            return Http::response(['error' => 'backend'], 503);
        }
        $body = json_decode($request->body() ?: '[]', true) ?? [];
        $this->writes[] = ['method' => $method, 'url' => $url, 'body' => $body];

        if ($method === 'POST') {
            $new = 'nouveau'.(++$this->counter);
            $this->events[$new] = [
                'id' => $new, 'iCalUID' => "{$new}@google.com", 'status' => 'confirmed',
                'etag' => '"'.(++$this->counter).'"', 'updated' => now()->toIso8601String(), ...$body,
            ];

            return Http::response($this->events[$new]);
        }
        if (! isset($this->events[$id])) {
            return Http::response(['error' => 'gone'], 410);
        }
        if ($method === 'DELETE') {
            unset($this->events[$id]);

            return Http::response(null, 204);
        }
        if ($method === 'PATCH') {
            $ifMatch = $request->header('If-Match')[0] ?? null;
            if ($ifMatch !== null && $ifMatch !== $this->events[$id]['etag']) {
                return Http::response(['error' => 'conditionNotMet'], 412);
            }
            $this->editRemotely($id, $body);

            return Http::response($this->events[$id]);
        }

        return Http::response(['error' => 'method'], 405);
    }
}
