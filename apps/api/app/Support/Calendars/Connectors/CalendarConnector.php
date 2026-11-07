<?php

namespace App\Support\Calendars\Connectors;

use App\Models\CalendarAccount;
use App\Models\CalendarSource;
use App\Support\Calendars\FetchFailed;
use DateTimeInterface;

/**
 * Un fournisseur d'agendas d'un compte connecté (spec 6.15) : Google (API Calendar v3) ou iCloud
 * (CalDAV). Le moteur commun (CalendarSync) fait le reste : upsert, suppressions, conflits.
 *
 * Un événement, dans les deux sens, a la forme de ceux d'IcsParser (uid, recurrence_id, title,
 * start, end, time_zone, location, url, description), plus ce qu'on sait de sa version distante :
 * remote_href (l'occurrence chez Google, la ressource CalDAV chez Apple), remote_etag et
 * remote_updated_at (ISO 8601, ou null).
 *
 * Toutes les méthodes lèvent FetchFailed avec un message clair en cas d'échec (jamais de secret).
 */
interface CalendarConnector
{
    /**
     * Les agendas du compte.
     *
     * @return list<array{id: string, name: string, color: string|null, writable: bool}>
     */
    public function calendars(CalendarAccount $account): array;

    /**
     * Les événements de l'agenda entre $from et $to, une entrée par occurrence.
     *
     * @return list<array<string, mixed>>
     */
    public function events(CalendarSource $source, DateTimeInterface $from, DateTimeInterface $to): array;

    /**
     * Crée l'événement (sans remote_href) ou le met à jour (avec If-Match sur remote_etag).
     *
     * @param  array<string, mixed>  $event
     * @return array{remote_href: string, remote_etag: string|null, remote_updated_at: string|null, uid: string, recurrence_id: string}
     *
     * @throws RemoteChanged si l'événement a changé chez le fournisseur depuis remote_etag
     * @throws FetchFailed
     */
    public function push(CalendarSource $source, array $event): array;

    /**
     * Supprime l'événement (ou, pour une occurrence d'une série, cette occurrence seulement).
     * Déjà disparu chez le fournisseur : rien à faire.
     *
     * @param  array<string, mixed>  $event
     */
    public function delete(CalendarSource $source, array $event): void;
}
