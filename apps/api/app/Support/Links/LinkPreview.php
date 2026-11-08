<?php

namespace App\Support\Links;

use App\Support\Calendars\FetchFailed;
use App\Support\Calendars\SafeFetcher;

/**
 * L'aperçu d'un lien web (bloc « Aperçu de lien ») : titre, description, image, icône et nom du
 * site, lus dans les balises Open Graph et Twitter de la page, à défaut dans son titre. La page est
 * lue par le serveur, avec la protection SSRF des agendas. YouTube et Vimeo répondent par oEmbed :
 * leurs pages demandent d'abord d'accepter des cookies.
 */
class LinkPreview
{
    /** Les sites qui décrivent leurs vidéos par oEmbed : motif de l'hôte => adresse oEmbed. */
    private const OEMBED = [
        '/(^|\.)(youtube\.com|youtu\.be)$/' => 'https://www.youtube.com/oembed?format=json&url=',
        '/(^|\.)vimeo\.com$/' => 'https://vimeo.com/api/oembed.json?url=',
    ];

    public function __construct(private SafeFetcher $fetcher) {}

    /** « exemple.com/page » devient « https://exemple.com/page » ; seuls http et https sont acceptés. */
    public static function normalize(string $url): string
    {
        $url = trim($url);
        if (! preg_match('#^[a-z][a-z0-9+.-]*://#i', $url)) {
            $url = 'https://'.$url;
        }
        $parts = parse_url($url);
        if ($parts === false || ! isset($parts['scheme'], $parts['host'])
            || ! in_array(strtolower($parts['scheme']), ['http', 'https'], true)
            || ! str_contains($parts['host'], '.') && ! filter_var(trim($parts['host'], '[]'), FILTER_VALIDATE_IP)) {
            throw new FetchFailed('Ce lien n’est pas une adresse web (https://…).');
        }

        return $url;
    }

    /** @return array{url: string, title: string|null, description: string|null, image: string|null, icon: string|null, site_name: string|null} */
    public function for(string $url): array
    {
        $url = self::normalize($url);

        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        foreach (self::OEMBED as $pattern => $endpoint) {
            if (preg_match($pattern, $host)) {
                $preview = $this->oembed($url, $endpoint.rawurlencode($url));
                if ($preview !== null) {
                    return $preview;
                }
            }
        }

        $page = $this->fetcher->fetchPage($url);
        if (! str_contains($page['type'], 'html')) {
            // Un PDF, une image… : un aperçu sans titre, l'adresse fait foi.
            return self::empty($url);
        }

        return self::parse($page['body'], $page['url'], $url, $page['type']);
    }

    /**
     * @return array{url: string, title: string|null, description: string|null, image: string|null, icon: string|null, site_name: string|null}
     */
    public static function parse(string $html, string $pageUrl, string $url, string $contentType = 'text/html'): array
    {
        // Tout caractère non ASCII devient une entité : le charset annoncé par la page n'a plus
        // d'effet sur la lecture.
        $html = mb_encode_numericentity(self::toUtf8($html, $contentType), [0x80, 0x10FFFF, 0, 0x1FFFFF], 'UTF-8');

        $previous = libxml_use_internal_errors(true);
        $document = new \DOMDocument;
        $document->loadHTML($html, LIBXML_NONET | LIBXML_NOWARNING | LIBXML_NOERROR);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        $xpath = new \DOMXPath($document);

        $meta = [];
        foreach ($xpath->query('//meta[@content]') ?: [] as $node) {
            /** @var \DOMElement $node */
            $key = strtolower(trim($node->getAttribute('property') ?: $node->getAttribute('name')));
            if ($key !== '' && ! isset($meta[$key]) && trim($node->getAttribute('content')) !== '') {
                $meta[$key] = $node->getAttribute('content');
            }
        }
        $titleNode = $xpath->query('//title')?->item(0);

        $title = self::text($meta['og:title'] ?? $meta['twitter:title'] ?? $titleNode?->textContent, 300);
        $description = self::text($meta['og:description'] ?? $meta['twitter:description'] ?? $meta['description'] ?? null, 500);
        $image = self::link($pageUrl, $meta['og:image:secure_url'] ?? $meta['og:image'] ?? $meta['twitter:image'] ?? $meta['twitter:image:src'] ?? null);

        $icon = null;
        foreach ($xpath->query('//link[@rel][@href]') ?: [] as $node) {
            /** @var \DOMElement $node */
            $rel = preg_split('/\s+/', strtolower(trim($node->getAttribute('rel')))) ?: [];
            if (in_array('icon', $rel, true) || in_array('apple-touch-icon', $rel, true)) {
                $icon = self::link($pageUrl, $node->getAttribute('href'));
                if ($icon !== null && in_array('icon', $rel, true)) {
                    break;
                }
            }
        }
        $icon ??= self::link($pageUrl, '/favicon.ico');

        return [
            'url' => $url,
            'title' => $title,
            'description' => $description,
            'image' => $image,
            'icon' => $icon,
            'site_name' => self::text($meta['og:site_name'] ?? null, 100) ?? self::host($pageUrl),
        ];
    }

    /** @return array{url: string, title: string|null, description: string|null, image: string|null, icon: string|null, site_name: string|null}|null */
    private function oembed(string $url, string $endpoint): ?array
    {
        try {
            $data = json_decode($this->fetcher->fetchPage($endpoint)['body'], true);
        } catch (FetchFailed) {
            return null;
        }
        if (! is_array($data) || ! is_string($data['title'] ?? null)) {
            return null;
        }
        $site = self::text(is_string($data['provider_name'] ?? null) ? $data['provider_name'] : null, 100);

        return [
            'url' => $url,
            'title' => self::text($data['title'], 300),
            'description' => self::text(is_string($data['author_name'] ?? null) ? $data['author_name'] : null, 500),
            'image' => self::link($url, is_string($data['thumbnail_url'] ?? null) ? $data['thumbnail_url'] : null),
            'icon' => self::link($url, '/favicon.ico'),
            'site_name' => $site ?? self::host($url),
        ];
    }

    /** @return array{url: string, title: null, description: null, image: null, icon: string|null, site_name: string|null} */
    private static function empty(string $url): array
    {
        return [
            'url' => $url,
            'title' => null,
            'description' => null,
            'image' => null,
            'icon' => self::link($url, '/favicon.ico'),
            'site_name' => self::host($url),
        ];
    }

    /** La page en UTF-8, d'après l'en-tête Content-Type ou la balise meta charset. */
    private static function toUtf8(string $html, string $contentType): string
    {
        $charset = null;
        if (preg_match('/charset=["\']?([\w.:-]+)/i', $contentType, $match)) {
            $charset = $match[1];
        } elseif (preg_match('/<meta[^>]+charset=["\']?([\w.:-]+)/i', substr($html, 0, 4096), $match)) {
            $charset = $match[1];
        }
        if ($charset === null || in_array(strtolower($charset), ['utf-8', 'utf8'], true)) {
            return $html;
        }
        try {
            return mb_convert_encoding($html, 'UTF-8', $charset);
        } catch (\ValueError) {
            return $html;
        }
    }

    private static function text(?string $value, int $max): ?string
    {
        $value = trim((string) preg_replace('/\s+/u', ' ', html_entity_decode((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8')));

        return $value === '' ? null : mb_substr($value, 0, $max);
    }

    /** Une adresse de la page rendue absolue ; seulement http et https. */
    private static function link(string $pageUrl, ?string $href): ?string
    {
        $href = trim((string) $href);
        if ($href === '' || strlen($href) > 2048
            || preg_match('#^[a-z][a-z0-9+.-]*:#i', $href) && ! preg_match('#^https?:#i', $href)) {
            return null;
        }
        $absolute = SafeFetcher::resolveUrl($pageUrl, $href);

        return preg_match('#^https?://[^\s]+$#i', $absolute) ? $absolute : null;
    }

    private static function host(string $url): ?string
    {
        $host = parse_url($url, PHP_URL_HOST);

        return is_string($host) ? (string) preg_replace('/^www\./', '', strtolower($host)) : null;
    }
}
