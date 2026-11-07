<?php

namespace Tests\Support;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/**
 * Un faux iCloud (CalDAV) en mémoire, pour les tests : un principal, un espace d'agendas, un agenda
 * « Maison » modifiable, et des ressources iCalendar avec leur ETag. PUT avec un If-Match périmé :
 * 412, comme un vrai serveur CalDAV.
 */
class FakeICloud
{
    public const BASE = 'https://caldav.icloud.com';

    public const HOME = 'https://p42-caldav.icloud.com/123456/calendars/';

    public const CALENDAR = 'https://p42-caldav.icloud.com/123456/calendars/maison/';

    /** @var array<string, array{ics: string, etag: string}> les ressources par adresse */
    public array $resources = [];

    /** @var list<array{method: string, url: string, body: string, if_match: string|null}> */
    public array $writes = [];

    public string $password = 'abcd-efgh-ijkl-mnop';

    private int $counter = 0;

    public static function install(): self
    {
        $icloud = new self;
        Http::fake(fn (Request $request) => $icloud->handle($request));

        return $icloud;
    }

    public function put(string $name, string $ics): string
    {
        $href = self::CALENDAR.$name;
        $this->resources[$href] = ['ics' => $ics, 'etag' => '"e'.(++$this->counter).'"'];

        return $href;
    }

    private function handle(Request $request): mixed
    {
        $auth = $request->header('Authorization')[0] ?? '';
        if ($auth !== 'Basic '.base64_encode('moi@icloud.com:'.$this->password)) {
            return Http::response('', 401);
        }
        $url = $request->url();
        $method = $request->method();

        if ($method === 'PROPFIND' && rtrim($url, '/') === self::BASE) {
            return $this->multistatus('<d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/123456/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response>');
        }
        if ($method === 'PROPFIND' && $url === self::BASE.'/123456/principal/') {
            return $this->multistatus('<d:response><d:href>/123456/principal/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>'.self::HOME.'</d:href></c:calendar-home-set></d:prop></d:propstat></d:response>');
        }
        if ($method === 'PROPFIND' && $url === self::HOME) {
            return $this->multistatus(
                '<d:response><d:href>/123456/calendars/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>'
                .'<d:response><d:href>/123456/calendars/maison/</d:href><d:propstat><d:prop><d:displayname>Maison</d:displayname>'
                .'<d:resourcetype><d:collection/><c:calendar/></d:resourcetype><a:calendar-color>#FF9500FF</a:calendar-color>'
                .'<c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>'
                .'<d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set>'
                .'</d:prop></d:propstat></d:response>'
                .'<d:response><d:href>/123456/calendars/rappels/</d:href><d:propstat><d:prop><d:displayname>Rappels</d:displayname>'
                .'<d:resourcetype><d:collection/><c:calendar/></d:resourcetype>'
                .'<c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set>'
                .'</d:prop></d:propstat></d:response>',
            );
        }
        if ($method === 'REPORT' && $url === self::CALENDAR) {
            $responses = '';
            foreach ($this->resources as $href => $resource) {
                $responses .= '<d:response><d:href>'.parse_url($href, PHP_URL_PATH).'</d:href><d:propstat><d:prop>'
                    .'<d:getetag>'.htmlspecialchars($resource['etag']).'</d:getetag>'
                    .'<c:calendar-data>'.htmlspecialchars($resource['ics']).'</c:calendar-data></d:prop></d:propstat></d:response>';
            }

            return $this->multistatus($responses);
        }

        $resource = $this->resources[$url] ?? null;
        if ($method === 'GET' || $method === 'HEAD') {
            return $resource === null
                ? Http::response('', 404)
                : Http::response($method === 'GET' ? $resource['ics'] : '', 200, ['ETag' => $resource['etag']]);
        }
        $ifMatch = $request->header('If-Match')[0] ?? null;
        $this->writes[] = ['method' => $method, 'url' => $url, 'body' => $request->body(), 'if_match' => $ifMatch];
        if ($ifMatch !== null && $resource !== null && $ifMatch !== $resource['etag']) {
            return Http::response('', 412);
        }
        if ($method === 'PUT') {
            $this->resources[$url] = ['ics' => $request->body(), 'etag' => '"e'.(++$this->counter).'"'];

            return Http::response('', $resource === null ? 201 : 204, ['ETag' => $this->resources[$url]['etag']]);
        }
        if ($method === 'DELETE') {
            unset($this->resources[$url]);

            return Http::response('', $resource === null ? 404 : 204);
        }

        return Http::response('', 405);
    }

    private function multistatus(string $responses): mixed
    {
        return Http::response(
            '<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">'
            .$responses.'</d:multistatus>',
            207,
            ['Content-Type' => 'application/xml; charset=utf-8'],
        );
    }
}
