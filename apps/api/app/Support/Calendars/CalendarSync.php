<?php

namespace App\Support\Calendars;

use App\Models\CalendarAccount;
use App\Models\CalendarSource;
use App\Models\Database;
use App\Models\Page;
use App\Models\Scopes\VisibleToCurrentUser;
use App\Models\Workspace;
use App\Support\BlockText;
use App\Support\Calendars\Connectors\CalDavConnector;
use App\Support\Calendars\Connectors\CalendarConnector;
use App\Support\Calendars\Connectors\GoogleConnector;
use App\Support\Calendars\Connectors\RemoteChanged;
use App\Support\Databases\Databases;
use App\Support\Databases\EventTemplate;
use App\Support\FractionalIndex;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

use function Illuminate\Support\defer;

/**
 * La synchronisation dans les deux sens des agendas Google et iCloud (spec 6.15). Chaque occurrence
 * est une ligne de la base, clé (agenda, UID, RECURRENCE-ID), comme pour un ICS (6.9) ; mais ici la
 * ligne se modifie dans Nonotion, et la modification part chez le fournisseur.
 *
 * Règles :
 * - une modification faite dans Nonotion et pas encore envoyée (updated_at après synced_at) n'est
 *   jamais écrasée par une synchronisation ; elle part à la suivante si l'envoi a échoué ;
 * - modifié des deux côtés : la version la plus récente gagne, l'autre est gardée sur la page
 *   (`sync_conflict`) ;
 * - un élément créé dans une base qui n'a qu'un agenda modifiable est créé dans cet agenda.
 */
class CalendarSync
{
    /** Un conflit se règle par une synchronisation, qui ne relance pas elle-même un règlement. */
    private bool $resolving = false;

    public function __construct(
        private GoogleConnector $google,
        private CalDavConnector $caldav,
    ) {}

    public function connector(string $provider): CalendarConnector
    {
        return $provider === CalendarAccount::GOOGLE ? $this->google : $this->caldav;
    }

    /**
     * Ajoute un agenda du compte à une base (existante, ou nouvelle sous $host) et le synchronise.
     * Si la première synchronisation échoue, rien ne reste.
     *
     * @param  array{id: string, name: string, color: string|null, writable: bool}  $calendar
     * @return array{source: CalendarSource, database: Database, page: Page|null, created: int}
     */
    public function add(CalendarAccount $account, array $calendar, string $name, string $color, ?Database $database, Page|Workspace|null $host): array
    {
        $container = null;
        if ($database === null) {
            [$database, $container] = Databases::create($host, true, $name, EventTemplate::NAME);
        }
        $source = new CalendarSource([
            'workspace_id' => $database->workspace_id,
            'database_id' => $database->id,
            'name' => $name,
            'color' => $color,
            'mode' => CalendarSource::SUBSCRIPTION,
            'property_map' => CalendarImporter::prepare($database),
        ]);
        $source->forceFill([
            'kind' => $account->provider,
            'account_id' => $account->id,
            'remote_id' => $calendar['id'],
            'writable' => $calendar['writable'],
            // Pour l'affichage (« Google · moi@gmail.com ») et la détection des doublons.
            'url_encrypted' => Crypt::encryptString($calendar['id']),
            'url_host' => ($account->provider === CalendarAccount::GOOGLE ? 'Google' : 'iCloud').' · '.$account->account_email,
            'url_hash' => self::hash($account, $calendar['id']),
            'status' => 'pending',
        ])->save();

        try {
            $result = $this->sync($source);
        } catch (FetchFailed $e) {
            $source->delete();
            $container?->delete();
            throw $e;
        }

        return ['source' => $source->refresh(), 'database' => $database->refresh(), 'page' => $container, 'created' => $result['created']];
    }

    /** Empreinte d'un agenda d'un compte : le retrouver sans rien déchiffrer. */
    public static function hash(CalendarAccount $account, string $remoteId): string
    {
        return CalendarSource::hashUrl("{$account->id}:{$remoteId}");
    }

    /**
     * Synchronise l'agenda : les événements de la fenêtre (6.9) arrivent, ceux qui ont disparu
     * partent, puis ce qui a été modifié dans Nonotion et pas encore envoyé part chez le fournisseur.
     *
     * @return array{changed: bool, created: int, updated: int, deleted: int, conflicts: int}
     */
    public function sync(CalendarSource $source): array
    {
        $source->loadMissing('account');
        try {
            if ($source->account === null) {
                throw new FetchFailed('Le compte de cet agenda n’est plus connecté.');
            }
            [$from, $to] = CalendarImporter::window();
            $events = $this->connector($source->kind)->events($source, $from, $to);
            $result = ['changed' => true, ...$this->upsert($source, $events)];
            $this->pushPending($source);
        } catch (FetchFailed $e) {
            $this->failed($source, $e->getMessage());
            throw $e;
        } catch (\Throwable $e) {
            // Jamais le message brut : il peut contenir un jeton ou une adresse privée.
            Log::error('Synchronisation d’agenda connecté impossible', ['source' => $source->id, 'exception' => $e::class]);
            $this->failed($source, 'La synchronisation a échoué. Réessayez plus tard.');
            throw new FetchFailed('La synchronisation a échoué. Réessayez plus tard.');
        }

        $source->forceFill([
            'status' => 'ok',
            'error_message' => null,
            'failure_count' => 0,
            'last_sync_at' => now(),
            'next_sync_at' => now()->addMinutes(config('nonotion.accounts.sync_every_minutes')),
            'events_count' => Page::query()->withoutGlobalScope(VisibleToCurrentUser::class)
                ->where('calendar_source_id', $source->id)->count(),
        ])->save();
        $source->account->forceFill(['status' => 'ok', 'error_message' => null, 'last_sync_at' => now()])->save();

        return $result;
    }

    /**
     * Après une modification dans Nonotion (titre, propriétés, contenu, création, restauration) :
     * l'événement part chez le fournisseur. Appelé après la réponse au navigateur.
     */
    public function pushRow(Page $row): void
    {
        $source = $this->sourceFor($row);
        if ($source === null) {
            return;
        }
        $event = self::eventOf($row, $source);
        if ($event === null) {
            return;
        }
        try {
            $result = $this->connector($source->kind)->push($source, $event);
        } catch (RemoteChanged) {
            // Modifié des deux côtés : la synchronisation départage (la plus récente gagne).
            if (! $this->resolving) {
                $this->resolving = true;
                try {
                    $this->syncQuietly($source);
                } finally {
                    $this->resolving = false;
                }
            }

            return;
        } catch (FetchFailed $e) {
            // Rien de perdu : la ligne reste « à envoyer » et repartira à la prochaine synchronisation.
            $this->failed($source, $e->getMessage(), reschedule: false);

            return;
        }
        $now = now();
        $row->forceFill([
            'calendar_source_id' => $source->id,
            'ics_uid' => $result['uid'],
            'ics_recurrence_id' => $result['recurrence_id'],
            'remote_href' => $result['remote_href'],
            'remote_etag' => $result['remote_etag'],
            'remote_updated_at' => $result['remote_updated_at'] !== null ? Carbon::parse($result['remote_updated_at']) : null,
            'synced_at' => $now,
            'updated_at' => $now,
        ])->saveQuietly();
    }

    /** Une ligne mise à la corbeille : l'événement est supprimé chez le fournisseur. */
    public function deleteRow(Page $row): void
    {
        if ($row->calendar_source_id === null || $row->remote_href === null) {
            return;
        }
        $source = CalendarSource::query()->withoutGlobalScopes()->with('account')->find($row->calendar_source_id);
        if ($source === null || ! $source->writable) {
            return;
        }
        try {
            $this->connector($source->kind)->delete($source, self::eventOf($row, $source, allowUndated: true) ?? []);
        } catch (FetchFailed $e) {
            $this->failed($source, $e->getMessage(), reschedule: false);

            return;
        }
        // Restaurée plus tard, elle sera recréée chez le fournisseur.
        $row->forceFill(['remote_href' => null, 'remote_etag' => null, 'synced_at' => null])->saveQuietly();
    }

    /**
     * Une ligne vient d'être créée, modifiée ou restaurée : si sa base a un agenda Google ou iCloud
     * modifiable, l'envoi part juste après la réponse au navigateur (pas de file d'attente permanente
     * sur l'hébergement mutualisé).
     */
    public static function afterChange(Page $row): void
    {
        if (! self::linked($row)) {
            return;
        }
        $id = $row->id;
        defer(function () use ($id) {
            $fresh = Page::query()->withoutGlobalScopes()->find($id);
            if ($fresh !== null) {
                app(self::class)->pushRow($fresh);
            }
        });
    }

    /** Une ligne mise à la corbeille : sa suppression chez le fournisseur part après la réponse. */
    public static function afterTrash(Page $row): void
    {
        if ($row->calendar_source_id === null || $row->remote_href === null || ! self::linked($row)) {
            return;
        }
        $id = $row->id;
        defer(function () use ($id) {
            $trashed = Page::query()->withoutGlobalScopes()->withTrashed()->find($id);
            if ($trashed !== null) {
                app(self::class)->deleteRow($trashed);
            }
        });
    }

    /** La base de la ligne a-t-elle un agenda Google ou iCloud modifiable ? */
    private static function linked(Page $row): bool
    {
        return $row->database_id !== null && CalendarSource::query()->withoutGlobalScopes()
            ->where('database_id', $row->database_id)
            ->where('kind', '!=', CalendarSource::ICS)
            ->where('writable', true)
            ->exists();
    }

    /** Planificateur : les agendas connectés dont la synchronisation est due (quelques-uns par passage). */
    public static function syncDue(int $limit = 5): void
    {
        $sync = app(self::class);
        CalendarSource::query()->withoutGlobalScopes()
            ->where('kind', '!=', CalendarSource::ICS)
            ->where(fn ($query) => $query->whereNull('next_sync_at')->orWhere('next_sync_at', '<=', now()))
            ->orderBy('next_sync_at')
            ->limit($limit)
            ->get()
            ->each(function (CalendarSource $source) use ($sync) {
                try {
                    $sync->sync($source);
                } catch (FetchFailed) {
                    // Déjà noté sur l'agenda (statut, message, prochain essai).
                }
            });
    }

    /**
     * L'agenda où va cette ligne : le sien s'il est modifiable ; pour une ligne qui n'en a pas
     * encore, l'unique agenda modifiable de sa base.
     */
    private function sourceFor(Page $row): ?CalendarSource
    {
        if ($row->database_id === null || $row->trashed()) {
            return null;
        }
        if ($row->calendar_source_id !== null) {
            $source = CalendarSource::query()->withoutGlobalScopes()->with('account')->find($row->calendar_source_id);

            return $source !== null && $source->writable && $source->kind !== CalendarSource::ICS ? $source : null;
        }
        $writable = CalendarSource::query()->withoutGlobalScopes()->with('account')
            ->where('database_id', $row->database_id)
            ->where('kind', '!=', CalendarSource::ICS)
            ->where('writable', true)
            ->limit(2)->get();

        return $writable->count() === 1 ? $writable->first() : null;
    }

    /**
     * La ligne, dans la forme d'un événement ; null sans date (rien à placer dans un agenda).
     *
     * @return array<string, mixed>|null
     */
    private static function eventOf(Page $row, CalendarSource $source, bool $allowUndated = false): ?array
    {
        $map = $source->property_map;
        $date = $row->properties[$map['date']] ?? null;
        if (! is_array($date) || ! isset($date['start'])) {
            if (! $allowUndated) {
                return null;
            }
            $date = ['start' => now()->format('Y-m-d')];
        }

        return [
            'uid' => $row->ics_uid,
            'recurrence_id' => $row->ics_recurrence_id ?? '',
            'title' => $row->title,
            'start' => $date['start'],
            'end' => $date['end'] ?? null,
            'time_zone' => $date['time_zone'] ?? null,
            'location' => (string) ($row->properties[$map['location'] ?? ''] ?? ''),
            'description' => BlockText::extract($row->content ?? []),
            'remote_href' => $row->remote_href,
            'remote_etag' => $row->remote_etag,
        ];
    }

    /** Modifiée dans Nonotion depuis le dernier accord avec le fournisseur. */
    private static function changedLocally(Page $row): bool
    {
        return $row->synced_at !== null && $row->updated_at !== null && $row->updated_at->gt($row->synced_at);
    }

    /**
     * @param  list<array<string, mixed>>  $events
     * @return array{created: int, updated: int, deleted: int, conflicts: int}
     */
    private function upsert(CalendarSource $source, array $events): array
    {
        $database = Database::query()->withoutGlobalScopes()->find($source->database_id);
        if ($database === null) {
            throw new FetchFailed('La base de cet agenda est à la corbeille.');
        }
        $map = $source->property_map;
        $existing = Page::query()->withoutGlobalScopes()->withTrashed()
            ->where('calendar_source_id', $source->id)
            ->get()
            ->keyBy(fn (Page $row) => $row->ics_uid."\n".$row->ics_recurrence_id);
        $seen = [];
        $counts = ['created' => 0, 'updated' => 0, 'deleted' => 0, 'conflicts' => 0];
        $position = Databases::positionAtEnd($database);

        foreach (array_chunk($events, config('nonotion.ics.batch_size')) as $batch) {
            DB::transaction(function () use ($batch, $source, $database, $map, $existing, &$seen, &$counts, &$position) {
                foreach ($batch as $event) {
                    $key = $event['uid']."\n".$event['recurrence_id'];
                    if (isset($seen[$key])) {
                        continue;
                    }
                    $seen[$key] = true;
                    $values = self::values($map, $event);
                    $remote = [
                        'remote_href' => $event['remote_href'],
                        'remote_etag' => $event['remote_etag'],
                        'remote_updated_at' => $event['remote_updated_at'] !== null ? Carbon::parse($event['remote_updated_at']) : null,
                    ];

                    /** @var Page|null $row */
                    $row = $existing->get($key);
                    if ($row === null) {
                        $position = FractionalIndex::between($position, null);
                        $row = Databases::createRow($database, ['title' => $event['title'], 'properties' => $values, 'position' => $position]);
                        $content = self::content($event['description']);
                        $now = now();
                        $row->forceFill([
                            'calendar_source_id' => $source->id,
                            'ics_uid' => $event['uid'],
                            'ics_recurrence_id' => $event['recurrence_id'],
                            'content' => $content,
                            'search_text' => BlockText::extract($content),
                            ...$remote,
                            'synced_at' => $now,
                            'updated_at' => $now,
                        ])->save();
                        $counts['created']++;

                        continue;
                    }
                    // Supprimée dans Nonotion : la suppression part (ou est partie) chez le fournisseur.
                    if ($row->trashed() || $row->remote_etag === $event['remote_etag']) {
                        continue;
                    }
                    if (self::changedLocally($row)) {
                        $counts['conflicts']++;
                        $remoteTime = $remote['remote_updated_at'];
                        // Sans date de modification chez le fournisseur (CalDAV), sa version l'emporte.
                        if ($remoteTime !== null && $row->updated_at->gt($remoteTime)) {
                            // La nôtre est plus récente : elle repartira (avec le nouvel ETag).
                            $row->forceFill([
                                'sync_conflict' => self::conflict('remote', $event, $map),
                                'remote_etag' => $event['remote_etag'],
                                'remote_updated_at' => $remoteTime,
                            ])->saveQuietly();

                            continue;
                        }
                        $row->forceFill(['sync_conflict' => self::conflict('local', self::eventOf($row, $source, allowUndated: true) ?? [], $map)]);
                    }
                    $properties = [...($row->properties ?? []), ...$values];
                    $content = self::content($event['description']);
                    $now = now();
                    $row->forceFill([
                        'title' => $event['title'],
                        'properties' => $properties,
                        // La description remplace le corps tant que l'utilisateur n'y a rien écrit.
                        ...($row->version === 1 && $row->content != $content
                            ? ['content' => $content, 'search_text' => BlockText::extract($content)]
                            : []),
                        ...$remote,
                        'synced_at' => $now,
                        'updated_at' => $now,
                    ])->save();
                    $counts['updated']++;
                }
            });
        }

        // Disparu chez le fournisseur (ou sorti de la fenêtre) : la ligne est retirée.
        $gone = $existing->filter(fn (Page $row, string $key) => ! isset($seen[$key]) && ! $row->trashed() && $row->remote_href !== null)->pluck('id');
        foreach ($gone->chunk(config('nonotion.ics.batch_size')) as $ids) {
            $counts['deleted'] += DB::table('pages')->whereIn('id', $ids->all())->delete();
        }

        return $counts;
    }

    /**
     * Les lignes modifiées dans Nonotion et pas encore envoyées partent ; et celles créées dans la
     * base depuis l'ajout de l'agenda, dont l'envoi aurait échoué (pas les lignes d'avant : ajouter
     * un agenda à une base existante n'y envoie pas tout son contenu).
     */
    private function pushPending(CalendarSource $source): void
    {
        if (! $source->writable) {
            return;
        }
        Page::query()->withoutGlobalScopes()
            ->where(fn ($rows) => $rows
                ->where(fn ($own) => $own->where('calendar_source_id', $source->id)
                    ->where(fn ($query) => $query->whereNull('synced_at')->orWhereColumn('updated_at', '>', 'synced_at')))
                ->orWhere(fn ($new) => $new->where('database_id', $source->database_id)
                    ->whereNull('calendar_source_id')
                    ->where('created_at', '>', $source->created_at)))
            ->limit(50)
            ->get()
            ->each(fn (Page $row) => $this->pushRow($row));
    }

    private function syncQuietly(CalendarSource $source): void
    {
        try {
            $this->sync($source);
        } catch (FetchFailed) {
            // Noté sur l'agenda.
        }
    }

    /**
     * @param  array<string, string>  $map
     * @param  array<string, mixed>  $event
     * @return array<string, mixed>
     */
    private static function values(array $map, array $event): array
    {
        return [
            $map['date'] => array_filter(
                ['start' => $event['start'], 'end' => $event['end'], 'time_zone' => $event['time_zone']],
                fn ($value) => $value !== null,
            ),
            $map['location'] => $event['location'],
            $map['url'] => $event['url'] ?? '',
        ];
    }

    /**
     * La version écartée d'un conflit, gardée sur la page.
     *
     * @param  array<string, mixed>  $event
     * @param  array<string, string>  $map
     * @return array<string, mixed>
     */
    private static function conflict(string $lost, array $event, array $map): array
    {
        return [
            // La version écartée : celle de Nonotion (local) ou celle du fournisseur (remote).
            'lost' => $lost,
            'at' => now()->toIso8601String(),
            'title' => $event['title'] ?? '',
            'date' => array_filter(['start' => $event['start'] ?? null, 'end' => $event['end'] ?? null]),
            'location' => $event['location'] ?? '',
        ];
    }

    /** @return list<array<string, mixed>>|null */
    private static function content(string $description): ?array
    {
        if ($description === '') {
            return null;
        }

        return array_values(array_map(
            fn (string $line) => ['type' => 'paragraph', 'content' => $line],
            preg_split('/\n{2,}|\n/', $description) ?: [],
        ));
    }

    private function failed(CalendarSource $source, string $message, bool $reschedule = true): void
    {
        $failures = $source->failure_count + 1;
        $source->forceFill([
            'status' => 'error',
            'error_message' => $message,
            'failure_count' => $failures,
            ...($reschedule ? ['next_sync_at' => now()->addMinutes(min(24 * 60, config('nonotion.accounts.sync_every_minutes') * 2 ** min($failures - 1, 6)))] : []),
        ])->save();
        $source->account?->forceFill(['status' => 'error', 'error_message' => $message])->save();
    }
}
