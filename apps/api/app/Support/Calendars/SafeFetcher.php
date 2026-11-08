<?php

namespace App\Support\Calendars;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Télécharge un agenda ICS sans exposer le réseau du serveur (spec 6.9, protection SSRF) :
 * le nom est résolu ici, toute adresse privée ou locale est refusée, puis la connexion est forcée
 * sur l'adresse vérifiée (CURLOPT_RESOLVE) : une autre réponse DNS au moment de se connecter ne
 * change rien. Les redirections sont suivies à la main, vérifiées à chaque fois (3 au plus).
 * Le lien est un secret : il n'apparaît dans aucun message d'erreur.
 *
 * Lit aussi, avec les mêmes protections, le début d'une page web pour son aperçu (fetchPage).
 */
class SafeFetcher
{
    /** Réseaux refusés : locaux, privés, réservés (IPv4 et IPv6). */
    private const BLOCKED = [
        '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
        '192.0.0.0/24', '192.168.0.0/16', '198.18.0.0/15', '224.0.0.0/4', '240.0.0.0/4',
        '::/128', '::1/128', 'fc00::/7', 'fe80::/10', 'ff00::/8', '64:ff9b::/96', '2001:db8::/32',
    ];

    /** @param  \Closure(string): list<string>|null  $resolver  le résolveur DNS (remplacé dans les tests) */
    public function __construct(private ?\Closure $resolver = null)
    {
        $this->resolver ??= self::dnsResolver(...);
    }

    /** « webcal://… » devient « https://… » ; seuls http et https sont acceptés. */
    public static function normalize(string $url): string
    {
        $url = trim($url);
        $url = (string) preg_replace('#^webcals?://#i', 'https://', $url);
        $parts = parse_url($url);
        if ($parts === false || ! isset($parts['scheme'], $parts['host'])
            || ! in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
            throw new FetchFailed('Ce lien n’est pas une adresse web (https://… ou webcal://…).');
        }

        return $url;
    }

    /**
     * @return array{body: string|null, etag: string|null, last_modified: string|null}
     *                                                                                 body null : pas de changement (304)
     */
    public function fetch(string $url, ?string $etag = null, ?string $lastModified = null): array
    {
        $config = config('nonotion.ics');
        [$response] = $this->request(self::normalize($url), array_filter([
            'Accept' => 'text/calendar, */*;q=0.5',
            'User-Agent' => 'Nonotion (import d’agenda)',
            'If-None-Match' => $etag,
            'If-Modified-Since' => $lastModified,
        ]), $config['timeout'], $config['max_bytes'], [
            'too_big' => 'Cet agenda dépasse 10 Mo.',
            'silent' => 'Le serveur de l’agenda ne répond pas.',
        ]);

        $status = $response->status();
        if ($status === 304) {
            return ['body' => null, 'etag' => $etag, 'last_modified' => $lastModified];
        }
        if (in_array($status, [401, 403], true)) {
            throw new FetchFailed('Le lien n’est plus valide ou a été révoqué.');
        }
        if ($status === 404 || $status === 410) {
            throw new FetchFailed('Aucun agenda à cette adresse (le lien a peut-être changé).');
        }
        if (! $response->successful()) {
            throw new FetchFailed("Le serveur de l’agenda a répondu par une erreur ({$status}).");
        }

        $body = $response->body();
        if (strlen($body) > $config['max_bytes']) {
            throw new FetchFailed('Cet agenda dépasse 10 Mo.');
        }
        if (! str_contains(substr($body, 0, 2048), 'BEGIN:VCALENDAR')) {
            throw new FetchFailed('Ce lien ne renvoie pas un agenda au format iCalendar (.ics).');
        }

        return [
            'body' => $body,
            'etag' => $response->header('ETag') ?: null,
            'last_modified' => $response->header('Last-Modified') ?: null,
        ];
    }

    /**
     * Une page web (max_bytes au plus), son adresse après redirections et son type.
     *
     * @return array{url: string, body: string, type: string}
     */
    public function fetchPage(string $url): array
    {
        $config = config('nonotion.link_preview');
        [$response, $finalUrl] = $this->request($url, [
            'Accept' => 'text/html, application/xhtml+xml;q=0.9, */*;q=0.5',
            'Accept-Language' => 'fr, en;q=0.8',
            'User-Agent' => 'Mozilla/5.0 (compatible; Nonotion/1.0; aperçu de lien)',
        ], $config['timeout'], $config['max_bytes'], [
            'too_big' => 'Cette page est trop lourde pour un aperçu.',
            'silent' => 'Ce site ne répond pas.',
        ]);

        $status = $response->status();
        if (! $response->successful()) {
            throw new FetchFailed($status === 404 || $status === 410
                ? 'Aucune page à cette adresse.'
                : "Ce site a répondu par une erreur ({$status}).");
        }

        return [
            'url' => $finalUrl,
            'body' => $response->body(),
            'type' => strtolower($response->header('Content-Type')),
        ];
    }

    /**
     * Une requête GET vers une adresse vérifiée, redirections suivies à la main. Au-delà de
     * maxBytes, le téléchargement s'arrête (erreur « too_big »).
     *
     * @param  array<string, string>  $headers
     * @param  array{too_big: string, silent: string}  $messages
     * @return array{0: Response, 1: string}
     */
    private function request(string $url, array $headers, int $timeout, int $maxBytes, array $messages): array
    {
        $maxRedirects = config('nonotion.ics.max_redirects');

        for ($redirects = 0; ; $redirects++) {
            [$host, $port, $ip] = $this->checkedTarget($url);
            $resolve = str_contains($ip, ':') ? "[{$ip}]" : $ip;
            $received = 0;

            try {
                $response = Http::withOptions([
                    'allow_redirects' => false,
                    'curl' => [CURLOPT_RESOLVE => ["{$host}:{$port}:{$resolve}"]],
                    'progress' => function ($total, $downloaded) use (&$received, $maxBytes, $messages) {
                        $received = $downloaded;
                        if ($total > $maxBytes || $downloaded > $maxBytes) {
                            throw new FetchFailed($messages['too_big']);
                        }
                    },
                ])
                    ->timeout($timeout)
                    ->connectTimeout(5)
                    ->withHeaders($headers)
                    ->get($url);
            } catch (FetchFailed $e) {
                throw $e;
            } catch (ConnectionException) {
                throw new FetchFailed($messages['silent']);
            } catch (\Throwable $e) {
                // Le message d'une erreur cURL contient l'adresse : on ne le reprend pas.
                if ($e->getPrevious() instanceof FetchFailed) {
                    throw $e->getPrevious();
                }
                throw new FetchFailed($received > 0 ? $messages['too_big'] : $messages['silent']);
            }

            $status = $response->status();
            if (in_array($status, [301, 302, 303, 307, 308], true) && $response->header('Location') !== '') {
                if ($redirects >= $maxRedirects) {
                    throw new FetchFailed('Ce lien redirige trop de fois.');
                }
                $url = self::resolveUrl($url, $response->header('Location'));

                continue;
            }

            return [$response, $url];
        }
    }

    /**
     * L'hôte, le port et l'adresse IP vérifiée où se connecter.
     *
     * @return array{0: string, 1: int, 2: string}
     */
    private function checkedTarget(string $url): array
    {
        $parts = parse_url($url);
        $scheme = strtolower($parts['scheme'] ?? '');
        $host = strtolower(trim($parts['host'] ?? '', '[]'));
        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            throw new FetchFailed('Ce lien n’est pas une adresse web (https://… ou webcal://…).');
        }
        $port = (int) ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));

        $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : ($this->resolver)($host);
        if ($ips === []) {
            throw new FetchFailed('Ce nom de domaine est introuvable.');
        }

        // Une adresse locale n'est permise que pour les tests de bout en bout, jamais en production.
        $allowed = ! app()->isProduction() && in_array("{$host}:{$port}", config('nonotion.ics.allow_private_hosts'), true);
        foreach ($ips as $ip) {
            if (! $allowed && self::isBlocked($ip)) {
                throw new FetchFailed('Cette adresse n’est pas autorisée : elle mène à un réseau privé ou local.');
            }
        }

        return [$host, $port, $ips[0]];
    }

    public static function isBlocked(string $ip): bool
    {
        $binary = @inet_pton($ip);
        if ($binary === false) {
            return true;
        }
        // Une adresse IPv4 écrite en IPv6 (::ffff:127.0.0.1) est vérifiée comme IPv4.
        if (strlen($binary) === 16 && str_starts_with($binary, str_repeat("\0", 10)."\xff\xff")) {
            $binary = substr($binary, 12);
        }
        foreach (self::BLOCKED as $cidr) {
            [$network, $bits] = explode('/', $cidr);
            $net = inet_pton($network);
            if ($net === false || strlen($net) !== strlen($binary)) {
                continue;
            }
            $bytes = intdiv((int) $bits, 8);
            $rest = (int) $bits % 8;
            if (substr($binary, 0, $bytes) !== substr($net, 0, $bytes)) {
                continue;
            }
            if ($rest === 0 || (ord($binary[$bytes]) >> (8 - $rest)) === (ord($net[$bytes]) >> (8 - $rest))) {
                return true;
            }
        }

        return false;
    }

    /** @return list<string> */
    private static function dnsResolver(string $host): array
    {
        $records = @dns_get_record($host, DNS_A | DNS_AAAA) ?: [];
        $ips = [];
        foreach ($records as $record) {
            $ips[] = $record['ip'] ?? $record['ipv6'] ?? null;
        }

        return array_values(array_filter($ips));
    }

    /** Une adresse (absolue, « //hôte/… », « /chemin » ou relative) lue depuis la page base. */
    public static function resolveUrl(string $base, string $location): string
    {
        if (preg_match('#^https?://#i', $location)) {
            return $location;
        }
        $parts = parse_url($base);
        $origin = $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');
        if (str_starts_with($location, '//')) {
            return $parts['scheme'].':'.$location;
        }
        if (str_starts_with($location, '/')) {
            return $origin.$location;
        }
        $path = $parts['path'] ?? '/';

        return $origin.substr($path, 0, (int) strrpos($path, '/') + 1).$location;
    }
}
