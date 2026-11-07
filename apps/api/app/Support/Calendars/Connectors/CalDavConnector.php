<?php

namespace App\Support\Calendars\Connectors;

use App\Models\CalendarAccount;
use App\Models\CalendarSource;
use App\Support\Calendars\FetchFailed;
use App\Support\Calendars\IcsParser;
use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use DOMDocument;
use DOMElement;
use DOMXPath;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Component\VEvent;
use Sabre\VObject\Property\ICalendar\DateTime as DateTimeProperty;
use Sabre\VObject\Reader;

/**
 * iCloud (CalDAV, RFC 4791), pour un compte connecté avec l'identifiant Apple et un mot de passe
 * pour application (spec 6.15) : Apple n'a pas d'OAuth pour l'agenda. Une ressource CalDAV est un
 * fichier iCalendar (un événement, ou une série et ses exceptions) ; ses occurrences sont développées
 * comme celles d'un ICS (IcsParser). Seuls les serveurs d'Apple sont joints.
 */
class CalDavConnector implements CalendarConnector
{
    private const NS = [
        'd' => 'DAV:',
        'c' => 'urn:ietf:params:xml:ns:caldav',
        'a' => 'http://apple.com/ns/ical/',
    ];

    /**
     * Trouve l'espace d'agendas du compte (principal, puis « calendar-home-set ») ; renvoie les
     * identifiants à garder. Un refus dit clairement qu'il faut un mot de passe pour application.
     *
     * @return array{username: string, password: string, home: string}
     */
    public function connect(string $username, string $password): array
    {
        $base = rtrim((string) config('nonotion.icloud.caldav_url'), '/').'/';
        $principal = $this->propfind($username, $password, $base, 0, '<d:current-user-principal/>');
        $principalHref = $this->first($principal, '//d:current-user-principal/d:href');
        if ($principalHref === null) {
            throw new FetchFailed('iCloud n’a pas trouvé l’agenda de ce compte.');
        }
        $home = $this->propfind($username, $password, $this->absolute($base, $principalHref), 0, '<c:calendar-home-set/>');
        $homeHref = $this->first($home, '//c:calendar-home-set/d:href');
        if ($homeHref === null) {
            throw new FetchFailed('iCloud n’a pas trouvé l’agenda de ce compte.');
        }

        return ['username' => $username, 'password' => $password, 'home' => $this->absolute($base, $homeHref)];
    }

    public function calendars(CalendarAccount $account): array
    {
        $credentials = $account->credentials();
        $xpath = $this->propfind(
            $credentials['username'],
            $credentials['password'],
            $credentials['home'],
            1,
            '<d:displayname/><d:resourcetype/><a:calendar-color/><c:supported-calendar-component-set/><d:current-user-privilege-set/>',
        );
        $calendars = [];
        foreach ($xpath->query('//d:response') ?: [] as $response) {
            /** @var DOMElement $response */
            if ($xpath->query('.//d:resourcetype/c:calendar', $response)?->length === 0) {
                continue;
            }
            $components = $xpath->query('.//c:supported-calendar-component-set/c:comp', $response);
            $events = $components === false || $components->length === 0;
            foreach ($components ?: [] as $component) {
                /** @var DOMElement $component */
                $events = $events || strtoupper($component->getAttribute('name')) === 'VEVENT';
            }
            if (! $events) {
                continue;
            }
            $writable = ($xpath->query('.//d:current-user-privilege-set//d:write | .//d:current-user-privilege-set//d:write-content | .//d:current-user-privilege-set//d:all', $response)?->length ?? 0) > 0;
            $color = trim((string) $xpath->evaluate('string(.//a:calendar-color)', $response));
            $calendars[] = [
                'id' => $this->absolute($credentials['home'], trim((string) $xpath->evaluate('string(d:href)', $response))),
                'name' => trim((string) $xpath->evaluate('string(.//d:displayname)', $response)) ?: 'Agenda iCloud',
                'color' => $color !== '' ? substr($color, 0, 7) : null,
                'writable' => $writable,
            ];
        }

        return $calendars;
    }

    public function events(CalendarSource $source, DateTimeInterface $from, DateTimeInterface $to): array
    {
        $utc = new DateTimeZone('UTC');
        $range = sprintf(
            '<c:time-range start="%s" end="%s"/>',
            DateTimeImmutable::createFromInterface($from)->setTimezone($utc)->format('Ymd\THis\Z'),
            DateTimeImmutable::createFromInterface($to)->setTimezone($utc)->format('Ymd\THis\Z'),
        );
        $body = '<?xml version="1.0" encoding="utf-8"?>'
            .'<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
            .'<d:prop><d:getetag/><c:calendar-data/></d:prop>'
            .'<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">'.$range
            .'</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>';
        $response = $this->send(fn () => $this->client($source->account)
            ->withHeaders(['Depth' => '1'])
            ->withBody($body, 'application/xml; charset=utf-8')
            ->send('REPORT', (string) $source->remote_id));
        $xpath = $this->multistatus($response);

        $events = [];
        foreach ($xpath->query('//d:response') ?: [] as $item) {
            /** @var DOMElement $item */
            $data = (string) $xpath->evaluate('string(.//c:calendar-data)', $item);
            if (trim($data) === '') {
                continue;
            }
            $href = $this->absolute((string) $source->remote_id, trim((string) $xpath->evaluate('string(d:href)', $item)));
            $etag = trim((string) $xpath->evaluate('string(.//d:getetag)', $item)) ?: null;
            try {
                $parsed = IcsParser::parse($data, $from, $to, $source->time_zone);
            } catch (FetchFailed) {
                // Une ressource illisible ne bloque pas les autres.
                continue;
            }
            foreach ($parsed['events'] as $event) {
                $events[] = [...$event, 'remote_href' => $href, 'remote_etag' => $etag, 'remote_updated_at' => null];
            }
        }

        return $events;
    }

    public function push(CalendarSource $source, array $event): array
    {
        $client = $this->client($source->account);
        if (empty($event['remote_href'])) {
            // Un nouvel événement : une nouvelle ressource dans l'agenda.
            $uid = Str::uuid()->toString().'@nonotion';
            $href = rtrim((string) $source->remote_id, '/').'/'.Str::uuid()->toString().'.ics';
            $calendar = new VCalendar(['PRODID' => '-//Nonotion//Agenda//FR']);
            $vevent = $calendar->add('VEVENT', ['UID' => $uid, 'DTSTAMP' => new DateTimeImmutable('now', new DateTimeZone('UTC'))]);
            self::fill($vevent, $event);
            $response = $this->send(fn () => $client->withHeaders(['If-None-Match' => '*'])
                ->withBody($calendar->serialize(), 'text/calendar; charset=utf-8')->put($href));
            $this->ensure($response, 'la création');

            return [
                'remote_href' => $href,
                'remote_etag' => $this->etag($response, $source, $href),
                'remote_updated_at' => null,
                'uid' => $uid,
                'recurrence_id' => '',
            ];
        }

        $href = (string) $event['remote_href'];
        [$calendar, $etag] = $this->resource($source, $href);
        if (! empty($event['remote_etag']) && $etag !== null && $etag !== $event['remote_etag']) {
            throw new RemoteChanged('Modifié dans iCloud depuis la dernière synchronisation.');
        }
        self::fill(self::occurrence($calendar, (string) ($event['recurrence_id'] ?? '')), $event);
        $response = $this->send(fn () => $client->withHeaders(array_filter(['If-Match' => $etag]))
            ->withBody($calendar->serialize(), 'text/calendar; charset=utf-8')->put($href));
        if ($response->status() === 412) {
            throw new RemoteChanged('Modifié dans iCloud depuis la dernière synchronisation.');
        }
        $this->ensure($response, 'la modification');

        return [
            'remote_href' => $href,
            'remote_etag' => $this->etag($response, $source, $href),
            'remote_updated_at' => null,
            'uid' => (string) $event['uid'],
            'recurrence_id' => (string) ($event['recurrence_id'] ?? ''),
        ];
    }

    public function delete(CalendarSource $source, array $event): void
    {
        if (empty($event['remote_href'])) {
            return;
        }
        $href = (string) $event['remote_href'];
        $recurrence = (string) ($event['recurrence_id'] ?? '');
        if ($recurrence === '') {
            $response = $this->send(fn () => $this->client($source->account)->delete($href));
            if (! $response->successful() && ! in_array($response->status(), [404, 410], true)) {
                $this->ensure($response, 'la suppression');
            }

            return;
        }

        // Une occurrence d'une série : la date est exclue de la série (EXDATE), son exception retirée.
        try {
            [$calendar, $etag] = $this->resource($source, $href);
        } catch (FetchFailed) {
            return;
        }
        foreach ($calendar->select('VEVENT') as $vevent) {
            /** @var VEvent $vevent */
            if (isset($vevent->{'RECURRENCE-ID'}) && self::idOf($vevent->{'RECURRENCE-ID'}) === $recurrence) {
                $calendar->remove($vevent);
            }
        }
        $master = self::master($calendar);
        if ($master !== null) {
            $date = self::dateFromId($recurrence);
            $master->add('EXDATE', $date, strlen($recurrence) === 8 ? ['VALUE' => 'DATE'] : []);
        }
        $response = $this->send(fn () => $this->client($source->account)->withHeaders(array_filter(['If-Match' => $etag]))
            ->withBody($calendar->serialize(), 'text/calendar; charset=utf-8')->put($href));
        $this->ensure($response, 'la suppression');
    }

    /**
     * L'événement à modifier dans la ressource : l'événement lui-même, ou l'exception de cette
     * occurrence (créée depuis la série si elle n'existe pas encore).
     */
    private static function occurrence(VCalendar $calendar, string $recurrenceId): VEvent
    {
        $master = self::master($calendar);
        if ($recurrenceId === '') {
            if ($master === null) {
                throw new FetchFailed('Cet événement iCloud est illisible.');
            }

            return $master;
        }
        foreach ($calendar->select('VEVENT') as $vevent) {
            /** @var VEvent $vevent */
            if (isset($vevent->{'RECURRENCE-ID'}) && self::idOf($vevent->{'RECURRENCE-ID'}) === $recurrenceId) {
                return $vevent;
            }
        }
        if ($master === null) {
            throw new FetchFailed('Cet événement iCloud est illisible.');
        }
        /** @var VEvent $override */
        $override = clone $master;
        foreach (['RRULE', 'RDATE', 'EXDATE', 'EXRULE'] as $name) {
            $override->remove($name);
        }
        $override->add('RECURRENCE-ID', self::dateFromId($recurrenceId), strlen($recurrenceId) === 8 ? ['VALUE' => 'DATE'] : []);
        $calendar->add($override);

        return $override;
    }

    /** Titre, dates, lieu et description de l'événement, depuis notre forme. */
    private static function fill(VEvent $vevent, array $event): void
    {
        foreach (['SUMMARY', 'LOCATION', 'DESCRIPTION', 'DTSTART', 'DTEND', 'DURATION'] as $name) {
            $vevent->remove($name);
        }
        $vevent->add('SUMMARY', (string) $event['title']);
        if (($event['location'] ?? '') !== '') {
            $vevent->add('LOCATION', (string) $event['location']);
        }
        if (($event['description'] ?? '') !== '') {
            $vevent->add('DESCRIPTION', (string) $event['description']);
        }
        $start = (string) $event['start'];
        if (strlen($start) === 10) {
            $last = ($event['end'] ?? null) ?: $start;
            $vevent->add('DTSTART', new DateTimeImmutable($start), ['VALUE' => 'DATE']);
            $vevent->add('DTEND', (new DateTimeImmutable($last))->modify('+1 day'), ['VALUE' => 'DATE']);
        } else {
            $utc = new DateTimeZone('UTC');
            $startAt = new DateTimeImmutable($start, $utc);
            $vevent->add('DTSTART', $startAt->setTimezone($utc));
            $vevent->add('DTEND', ($event['end'] ?? null) ? (new DateTimeImmutable($event['end']))->setTimezone($utc) : $startAt->modify('+30 minutes'));
        }
        $vevent->{'LAST-MODIFIED'} = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }

    private static function master(VCalendar $calendar): ?VEvent
    {
        foreach ($calendar->select('VEVENT') as $vevent) {
            /** @var VEvent $vevent */
            if (! isset($vevent->{'RECURRENCE-ID'})) {
                return $vevent;
            }
        }

        return null;
    }

    /** Le RECURRENCE-ID dans la forme d'IcsParser : « AAAAMMJJ » ou « AAAAMMJJTHHMMSSZ » (UTC). */
    private static function idOf(mixed $property): string
    {
        if (! $property instanceof DateTimeProperty) {
            return '';
        }

        return $property->hasTime()
            ? DateTimeImmutable::createFromInterface($property->getDateTime())->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z')
            : $property->getDateTime()->format('Ymd');
    }

    private static function dateFromId(string $id): DateTimeImmutable
    {
        $date = strlen($id) === 8
            ? DateTimeImmutable::createFromFormat('!Ymd', $id)
            : DateTimeImmutable::createFromFormat('Ymd\THis\Z', $id, new DateTimeZone('UTC'));

        return $date ?: new DateTimeImmutable;
    }

    /**
     * La ressource et son ETag.
     *
     * @return array{0: VCalendar, 1: string|null}
     */
    private function resource(CalendarSource $source, string $href): array
    {
        $response = $this->send(fn () => $this->client($source->account)->get($href));
        if (in_array($response->status(), [404, 410], true)) {
            throw new FetchFailed('Cet événement n’existe plus dans iCloud.');
        }
        $this->ensure($response, 'la lecture');
        $calendar = Reader::read($response->body(), Reader::OPTION_FORGIVING);
        if (! $calendar instanceof VCalendar) {
            throw new FetchFailed('Cet événement iCloud est illisible.');
        }

        return [$calendar, $response->header('ETag') ?: null];
    }

    /** L'ETag d'une ressource qu'on vient d'écrire (iCloud ne le renvoie pas toujours). */
    private function etag(Response $response, CalendarSource $source, string $href): ?string
    {
        $etag = $response->header('ETag');
        if ($etag !== '') {
            return $etag;
        }
        $head = $this->send(fn () => $this->client($source->account)->head($href));

        return $head->header('ETag') ?: null;
    }

    private function propfind(string $username, string $password, string $url, int $depth, string $props): DOMXPath
    {
        $this->allowed($url);
        $body = '<?xml version="1.0" encoding="utf-8"?>'
            .'<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">'
            ."<d:prop>{$props}</d:prop></d:propfind>";
        $response = $this->send(fn () => Http::withBasicAuth($username, $password)
            ->withHeaders(['Depth' => (string) $depth])
            ->withBody($body, 'application/xml; charset=utf-8')
            ->withoutRedirecting()
            ->timeout(20)
            ->send('PROPFIND', $url));

        return $this->multistatus($response);
    }

    private function multistatus(Response $response): DOMXPath
    {
        if ($response->status() === 401 || $response->status() === 403) {
            throw new FetchFailed('iCloud refuse ces identifiants : il faut l’identifiant Apple et un mot de passe pour application (créé sur account.apple.com), pas le mot de passe du compte. Un mot de passe pour application est aussi révoqué quand on change celui de l’identifiant Apple.');
        }
        if ($response->status() !== 207 && ! $response->successful()) {
            throw new FetchFailed("iCloud a refusé la demande (HTTP {$response->status()}).");
        }
        $document = new DOMDocument;
        // Ni accès réseau, ni entités développées (XXE) : on ne lit que la réponse elle-même.
        if (! @$document->loadXML($response->body(), LIBXML_NONET)) {
            throw new FetchFailed('La réponse d’iCloud est illisible.');
        }
        $xpath = new DOMXPath($document);
        foreach (self::NS as $prefix => $uri) {
            $xpath->registerNamespace($prefix, $uri);
        }

        return $xpath;
    }

    private function first(DOMXPath $xpath, string $query): ?string
    {
        $value = trim((string) $xpath->evaluate("string({$query})"));

        return $value === '' ? null : $value;
    }

    /** Une adresse relative de la réponse, rendue absolue ; refusée hors des serveurs d'Apple. */
    private function absolute(string $base, string $href): string
    {
        $url = str_starts_with($href, 'http') ? $href : rtrim((string) preg_replace('#^(https?://[^/]+).*$#', '$1', $base), '/').'/'.ltrim($href, '/');
        $this->allowed($url);

        return $url;
    }

    private function allowed(string $url): void
    {
        $host = (string) parse_url($url, PHP_URL_HOST);
        $scheme = (string) parse_url($url, PHP_URL_SCHEME);
        if (! preg_match((string) config('nonotion.icloud.allowed_hosts'), $host) || ($scheme !== 'https' && ! app()->runningUnitTests())) {
            throw new FetchFailed('iCloud a renvoyé une adresse inattendue : la connexion est refusée.');
        }
    }

    private function client(?CalendarAccount $account): PendingRequest
    {
        if ($account === null) {
            throw new FetchFailed('Le compte de cet agenda n’est plus connecté.');
        }
        $credentials = $account->credentials();

        return Http::withBasicAuth($credentials['username'], $credentials['password'])->withoutRedirecting()->timeout(20);
    }

    /** @param  callable(): Response  $request */
    private function send(callable $request): Response
    {
        try {
            return $request();
        } catch (ConnectionException) {
            throw new FetchFailed('iCloud ne répond pas. Réessayez dans un instant.');
        }
    }

    private function ensure(Response $response, string $what): void
    {
        if ($response->status() === 401 || $response->status() === 403) {
            throw new FetchFailed('iCloud refuse l’accès à ce compte : reconnectez-le avec un nouveau mot de passe pour application.');
        }
        if (! $response->successful()) {
            throw new FetchFailed("iCloud a refusé {$what} (HTTP {$response->status()}).");
        }
    }
}
