<?php

namespace App\Support\Calendars\Connectors;

use App\Models\CalendarAccount;
use App\Models\CalendarSource;
use App\Support\Calendars\FetchFailed;
use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Google Agenda (API Calendar v3), pour un compte connecté par OAuth (spec 6.15). Les séries sont
 * développées par Google (singleEvents) : une ligne par occurrence, et modifier une occurrence
 * n'en fait qu'une exception, comme dans Google Agenda.
 */
class GoogleConnector implements CalendarConnector
{
    public const API = 'https://www.googleapis.com/calendar/v3';

    /** Les événements d'un agenda, par pages de 250. */
    private const PAGE_SIZE = 250;

    /** Au-delà, l'agenda est trop gros pour une synchronisation sur un hébergement partagé. */
    private const MAX_PAGES = 20;

    public function calendars(CalendarAccount $account): array
    {
        $calendars = [];
        $pageToken = null;
        do {
            $page = $this->json($this->send(fn () => $this->client($account)->get(self::API.'/users/me/calendarList', array_filter([
                'minAccessRole' => 'reader',
                'pageToken' => $pageToken,
            ]))));
            foreach ($page['items'] ?? [] as $item) {
                $calendars[] = [
                    'id' => (string) $item['id'],
                    'name' => (string) ($item['summaryOverride'] ?? $item['summary'] ?? $item['id']),
                    'color' => $item['backgroundColor'] ?? null,
                    'writable' => in_array($item['accessRole'] ?? '', ['owner', 'writer'], true),
                ];
            }
            $pageToken = $page['nextPageToken'] ?? null;
        } while ($pageToken !== null);

        return $calendars;
    }

    public function events(CalendarSource $source, DateTimeInterface $from, DateTimeInterface $to): array
    {
        $events = [];
        $pageToken = null;
        $pages = 0;
        do {
            $page = $this->json($this->send(fn () => $this->client($source->account)->get($this->eventsUrl($source), array_filter([
                'singleEvents' => 'true',
                'timeMin' => $from->format(DateTimeInterface::RFC3339),
                'timeMax' => $to->format(DateTimeInterface::RFC3339),
                'maxResults' => self::PAGE_SIZE,
                'pageToken' => $pageToken,
            ]))));
            foreach ($page['items'] ?? [] as $item) {
                $event = self::fromGoogle($item);
                if ($event !== null) {
                    $events[] = $event;
                }
            }
            $pageToken = $page['nextPageToken'] ?? null;
        } while ($pageToken !== null && ++$pages < self::MAX_PAGES);

        return $events;
    }

    public function push(CalendarSource $source, array $event): array
    {
        $client = $this->client($source->account);
        $body = self::toGoogle($event);
        if (! empty($event['remote_href'])) {
            $url = $this->eventsUrl($source).'/'.rawurlencode($event['remote_href']);
            if (! empty($event['remote_etag'])) {
                $client = $client->withHeaders(['If-Match' => $event['remote_etag']]);
            }
            $response = $this->send(fn () => $client->patch($url, $body));
            if ($response->status() === 412) {
                throw new RemoteChanged('Modifié dans Google Agenda depuis la dernière synchronisation.');
            }
            // Disparu chez Google entre-temps : on le recrée.
            if (in_array($response->status(), [404, 410], true)) {
                $response = $this->send(fn () => $this->client($source->account)->post($this->eventsUrl($source), $body));
            }
        } else {
            $response = $this->send(fn () => $client->post($this->eventsUrl($source), $body));
        }
        $item = $this->json($response);

        return [
            'remote_href' => (string) $item['id'],
            'remote_etag' => $item['etag'] ?? null,
            'remote_updated_at' => $item['updated'] ?? null,
            'uid' => (string) ($item['iCalUID'] ?? $item['id']),
            'recurrence_id' => self::recurrenceId($item),
        ];
    }

    public function delete(CalendarSource $source, array $event): void
    {
        if (empty($event['remote_href'])) {
            return;
        }
        $response = $this->send(fn () => $this->client($source->account)
            ->delete($this->eventsUrl($source).'/'.rawurlencode($event['remote_href'])));
        if (! $response->successful() && ! in_array($response->status(), [404, 410], true)) {
            throw new FetchFailed("Google Agenda a refusé la suppression (HTTP {$response->status()}).");
        }
    }

    /**
     * Un événement de Google, dans notre forme ; null pour une occurrence annulée.
     *
     * @param  array<string, mixed>  $item
     * @return array<string, mixed>|null
     */
    public static function fromGoogle(array $item): ?array
    {
        if (($item['status'] ?? '') === 'cancelled' || ! isset($item['start'])) {
            return null;
        }
        $utc = new DateTimeZone('UTC');
        if (isset($item['start']['date'])) {
            // Journée entière : la fin de Google est exclusive (le lendemain du dernier jour).
            $start = (string) $item['start']['date'];
            $last = isset($item['end']['date'])
                ? (new DateTimeImmutable($item['end']['date']))->modify('-1 day')->format('Y-m-d')
                : null;
            $end = $last !== null && $last > $start ? $last : null;
            $zone = null;
        } else {
            $startAt = (new DateTimeImmutable($item['start']['dateTime']))->setTimezone($utc);
            $endAt = isset($item['end']['dateTime']) ? (new DateTimeImmutable($item['end']['dateTime']))->setTimezone($utc) : null;
            $start = $startAt->format('Y-m-d\TH:i:s\Z');
            $end = $endAt !== null && $endAt > $startAt ? $endAt->format('Y-m-d\TH:i:s\Z') : null;
            $zone = $item['start']['timeZone'] ?? null;
            $zone = is_string($zone) && in_array($zone, DateTimeZone::listIdentifiers(), true) ? $zone : null;
        }

        return [
            'uid' => mb_substr((string) ($item['iCalUID'] ?? $item['id']), 0, 255),
            'recurrence_id' => self::recurrenceId($item),
            'title' => mb_substr(trim((string) ($item['summary'] ?? '')), 0, 255),
            'start' => $start,
            'end' => $end,
            'time_zone' => $zone,
            'location' => mb_substr(trim((string) ($item['location'] ?? '')), 0, 1000),
            'description' => mb_substr(self::plainText((string) ($item['description'] ?? '')), 0, 20_000),
            'url' => (string) ($item['htmlLink'] ?? ''),
            'remote_href' => (string) $item['id'],
            'remote_etag' => $item['etag'] ?? null,
            'remote_updated_at' => $item['updated'] ?? null,
        ];
    }

    /**
     * Notre événement, pour l'API de Google.
     *
     * @param  array<string, mixed>  $event
     * @return array<string, mixed>
     */
    public static function toGoogle(array $event): array
    {
        $start = (string) $event['start'];
        if (strlen($start) === 10) {
            $last = $event['end'] ?? null ?: $start;
            $when = [
                'start' => ['date' => $start],
                'end' => ['date' => (new DateTimeImmutable($last))->modify('+1 day')->format('Y-m-d')],
            ];
        } else {
            $zone = $event['time_zone'] ?? null ?: 'UTC';
            $end = $event['end'] ?? null ?: (new DateTimeImmutable($start))->modify('+30 minutes')->format('Y-m-d\TH:i:s\Z');
            $when = [
                'start' => ['dateTime' => $start, 'timeZone' => $zone],
                'end' => ['dateTime' => $end, 'timeZone' => $zone],
            ];
        }

        return [
            'summary' => (string) $event['title'],
            'location' => (string) ($event['location'] ?? ''),
            'description' => (string) ($event['description'] ?? ''),
            ...$when,
        ];
    }

    /** « » pour un événement unique ; le début d'origine de l'occurrence pour une série. */
    private static function recurrenceId(array $item): string
    {
        $original = $item['originalStartTime'] ?? null;
        if (! is_array($original)) {
            return '';
        }
        if (isset($original['date'])) {
            return str_replace('-', '', (string) $original['date']);
        }

        return (new DateTimeImmutable($original['dateTime']))->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z');
    }

    /** Google peut mettre un peu de HTML dans une description : on en garde le texte. */
    private static function plainText(string $html): string
    {
        $text = preg_replace('#<br\s*/?>|</p>|</div>|</li>#i', "\n", $html) ?? $html;

        return trim(html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5));
    }

    private function eventsUrl(CalendarSource $source): string
    {
        return self::API.'/calendars/'.rawurlencode((string) $source->remote_id).'/events';
    }

    private function client(?CalendarAccount $account): PendingRequest
    {
        if ($account === null) {
            throw new FetchFailed('Le compte de cet agenda n’est plus connecté.');
        }

        return Http::withToken(GoogleOAuth::accessToken($account))->acceptJson()->timeout(20);
    }

    /** @param  callable(): Response  $request */
    private function send(callable $request): Response
    {
        try {
            return $request();
        } catch (ConnectionException) {
            throw new FetchFailed('Google Agenda ne répond pas. Réessayez dans un instant.');
        }
    }

    /** @return array<string, mixed> */
    private function json(Response $response): array
    {
        if ($response->status() === 401 || $response->status() === 403) {
            throw new FetchFailed('Google refuse l’accès à cet agenda : reconnectez le compte.');
        }
        if (in_array($response->status(), [404, 410], true)) {
            throw new FetchFailed('Cet agenda n’existe plus dans Google Agenda.');
        }
        if (! $response->successful()) {
            throw new FetchFailed("Google Agenda a refusé la demande (HTTP {$response->status()}).");
        }

        return $response->json() ?? [];
    }
}
