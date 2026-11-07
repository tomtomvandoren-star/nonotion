<?php

namespace App\Support\Calendars;

use App\Models\CalendarSource;
use App\Models\Database;
use App\Models\Page;
use App\Models\Scopes\VisibleToCurrentUser;
use App\Models\View;
use App\Models\Workspace;
use App\Support\BlockText;
use App\Support\Databases\Databases;
use App\Support\Databases\EventTemplate;
use App\Support\FractionalIndex;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Import et synchronisation des agendas par lien ICS (spec 6.9). Chaque occurrence d'un événement
 * devient une ligne de la base, identifiée par (agenda, UID, RECURRENCE-ID) : une resynchronisation
 * met la ligne à jour, sans doublon. Le titre, la date, le lieu et le lien viennent de l'agenda
 * (lecture seule) ; les autres propriétés et les notes de l'utilisateur sont conservées.
 */
class CalendarImporter
{
    public function __construct(private SafeFetcher $fetcher) {}

    /**
     * La fenêtre glissante des occurrences : un mois avant aujourd'hui, douze mois après.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public static function window(): array
    {
        $now = CarbonImmutable::now('UTC');

        return [
            $now->subDays(config('nonotion.ics.window_past_days'))->startOfDay(),
            $now->addDays(config('nonotion.ics.window_future_days'))->endOfDay(),
        ];
    }

    /**
     * Télécharge et lit l'agenda ; null si rien n'a changé depuis la dernière fois (304).
     *
     * @return array{name: string|null, events: list<array<string, mixed>>, warnings: list<string>, etag: string|null, last_modified: string|null}|null
     */
    private function read(string $url, ?string $zone, ?string $etag = null, ?string $lastModified = null): ?array
    {
        $fetched = $this->fetcher->fetch($url, $etag, $lastModified);
        if ($fetched['body'] === null) {
            return null;
        }
        [$from, $to] = self::window();

        return [
            ...IcsParser::parse($fetched['body'], $from, $to, $zone),
            'etag' => $fetched['etag'],
            'last_modified' => $fetched['last_modified'],
        ];
    }

    /**
     * L'aperçu avant import (spec 6.9, étape 2) : le nombre d'événements, la période couverte, les
     * 20 prochains et les avertissements. Rien n'est enregistré.
     *
     * @return array<string, mixed>
     */
    public function preview(string $url, ?string $zone): array
    {
        $parsed = $this->read($url, $zone) ?? ['name' => null, 'events' => [], 'warnings' => []];
        $events = $parsed['events'];
        $today = CarbonImmutable::now('UTC')->format('Y-m-d');
        $upcoming = array_filter($events, fn (array $event) => substr($event['end'] ?? $event['start'], 0, 10) >= $today);

        return [
            // Le nom que l'agenda se donne (X-WR-CALNAME) : une proposition pour le nôtre.
            'name' => $parsed['name'],
            'total' => count($events),
            'from' => $events === [] ? null : substr($events[0]['start'], 0, 10),
            'to' => $events === [] ? null : max(array_map(fn ($e) => substr($e['end'] ?? $e['start'], 0, 10), $events)),
            'events' => array_map(fn (array $event) => array_intersect_key($event, array_flip(
                ['title', 'start', 'end', 'time_zone', 'location'],
            )), array_slice(array_values($upcoming), 0, 20)),
            'warnings' => $parsed['warnings'],
        ];
    }

    /**
     * Ajoute l'agenda à une base (existante, ou nouvelle sous la page $host ; au premier niveau de
     * l'espace de travail depuis l'Agenda, spec 6.15) et l'importe.
     * Si l'import échoue, rien ne reste : ni l'agenda, ni la base créée pour lui.
     *
     * @param  array{url: string, name: string, color: string, mode: string, time_zone: string|null}  $input
     * @return array{source: CalendarSource, database: Database, page: Page|null, created: int}
     */
    public function create(array $input, ?Database $database, Page|Workspace|null $host): array
    {
        $container = null;
        if ($database === null) {
            [$database, $container] = Databases::create($host, true, $input['name'], EventTemplate::NAME);
        }

        $source = new CalendarSource([
            'workspace_id' => $database->workspace_id,
            'database_id' => $database->id,
            'name' => $input['name'],
            'color' => $input['color'],
            'mode' => $input['mode'],
            'time_zone' => IcsParser::validZone($input['time_zone']),
            'property_map' => self::prepare($database),
        ]);
        $source->setUrl($input['url']);
        $source->forceFill(['status' => 'pending'])->save();

        try {
            $result = $this->sync($source, force: true);
        } catch (FetchFailed $e) {
            $source->delete();
            $container?->delete();
            throw $e;
        }

        return ['source' => $source->refresh(), 'database' => $database->refresh(), 'page' => $container, 'created' => $result['created']];
    }

    /**
     * Les propriétés que l'import remplit : la Date du calendrier (sinon la première, sinon une
     * nouvelle), un texte « Lieu » et un texte « Lien », ajoutés s'ils manquent.
     *
     * @return array{date: string, location: string, url: string}
     */
    public static function prepare(Database $database): array
    {
        $schema = collect($database->schema);
        $calendarBy = View::query()->where('database_id', $database->id)->where('type', 'calendar')
            ->orderBy('position')->get()->pluck('config.calendar_by')->filter()->first();
        $date = $schema->first(fn ($p) => $p['id'] === $calendarBy && $p['type'] === 'date')
            ?? $schema->firstWhere('type', 'date');

        $text = function (string $name) use ($database, &$schema): string {
            $existing = $schema->first(fn ($p) => $p['type'] === 'text' && mb_strtolower($p['name']) === mb_strtolower($name));
            if ($existing !== null) {
                return $existing['id'];
            }
            $taken = $schema->contains(fn ($p) => mb_strtolower($p['name']) === mb_strtolower($name));
            $property = ['id' => Str::lower(Str::random(8)), 'name' => $taken ? "{$name} (agenda)" : $name, 'type' => 'text'];
            Databases::appendProperty($database, $property);
            $schema = collect($database->schema);

            return $property['id'];
        };

        if ($date === null) {
            $date = ['id' => Str::lower(Str::random(8)), 'name' => 'Date', 'type' => 'date'];
            Databases::appendProperty($database, $date);
            $schema = collect($database->schema);
        }

        return ['date' => $date['id'], 'location' => $text('Lieu'), 'url' => $text('Lien')];
    }

    /**
     * Resynchronise l'agenda (spec 6.9) : rien à faire si le serveur répond 304 (sauf $force), sinon
     * mise à jour des lignes par lots. En abonnement, ce qui a disparu de la source est retiré.
     *
     * @return array{changed: bool, created: int, updated: int, deleted: int}
     */
    public function sync(CalendarSource $source, bool $force = false): array
    {
        // Un agenda d'un compte connecté (Google, iCloud) a son propre moteur (spec 6.15).
        if ($source->kind !== CalendarSource::ICS) {
            return app(CalendarSync::class)->sync($source);
        }
        try {
            try {
                $url = $source->url();
            } catch (DecryptException) {
                throw new FetchFailed('Le lien de cet agenda ne peut plus être lu (la clé de l’application a changé) : ajoutez-le à nouveau.');
            }
            $parsed = $this->read($url, $source->time_zone, $force ? null : $source->etag, $force ? null : $source->last_modified);
            $result = $parsed === null
                ? ['changed' => false, 'created' => 0, 'updated' => 0, 'deleted' => 0]
                : ['changed' => true, ...$this->upsert($source, $parsed['events'])];
        } catch (FetchFailed $e) {
            $this->failed($source, $e->getMessage());
            throw $e;
        } catch (\Throwable $e) {
            // Jamais le message brut : il peut contenir le lien.
            Log::error('Synchronisation d’agenda impossible', ['source' => $source->id, 'exception' => $e::class]);
            $this->failed($source, 'La synchronisation a échoué. Réessayez plus tard.');
            throw new FetchFailed('La synchronisation a échoué. Réessayez plus tard.');
        }

        $source->forceFill([
            'status' => 'ok',
            'error_message' => null,
            'failure_count' => 0,
            'last_sync_at' => now(),
            'next_sync_at' => now()->addMinutes(config('nonotion.ics.sync_every_minutes')),
            'events_count' => Page::query()->withoutGlobalScope(VisibleToCurrentUser::class)
                ->where('calendar_source_id', $source->id)->count(),
            ...($parsed !== null ? ['etag' => $parsed['etag'], 'last_modified' => $parsed['last_modified']] : []),
        ])->save();

        return $result;
    }

    /**
     * @param  list<array<string, mixed>>  $events
     * @return array{created: int, updated: int, deleted: int}
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
        $counts = ['created' => 0, 'updated' => 0, 'deleted' => 0];
        $position = Databases::positionAtEnd($database);

        // Par lots : un agenda de plusieurs milliers d'événements ne tient pas une seule transaction.
        foreach (array_chunk($events, config('nonotion.ics.batch_size')) as $batch) {
            DB::transaction(function () use ($batch, $source, $database, $map, $existing, &$seen, &$counts, &$position) {
                foreach ($batch as $event) {
                    $key = $event['uid']."\n".$event['recurrence_id'];
                    if (isset($seen[$key])) {
                        continue;
                    }
                    $seen[$key] = true;
                    $values = [
                        $map['date'] => array_filter(
                            ['start' => $event['start'], 'end' => $event['end'], 'time_zone' => $event['time_zone']],
                            fn ($value) => $value !== null,
                        ),
                        $map['location'] => $event['location'],
                        $map['url'] => $event['url'],
                    ];
                    $content = self::content($event['description']);

                    /** @var Page|null $row */
                    $row = $existing->get($key);
                    if ($row === null) {
                        $position = FractionalIndex::between($position, null);
                        $row = Databases::createRow($database, ['title' => $event['title'], 'properties' => $values, 'position' => $position]);
                        $row->forceFill([
                            'calendar_source_id' => $source->id,
                            'ics_uid' => $event['uid'],
                            'ics_recurrence_id' => $event['recurrence_id'],
                            'content' => $content,
                            'search_text' => BlockText::extract($content),
                        ])->save();
                        $counts['created']++;

                        continue;
                    }
                    // Supprimé à la main : il reste à la corbeille, on ne le recrée pas.
                    if ($row->trashed()) {
                        continue;
                    }
                    $properties = [...($row->properties ?? []), ...$values];
                    $changes = [];
                    if ($row->title !== $event['title']) {
                        $changes['title'] = $event['title'];
                    }
                    if ($properties != ($row->properties ?? [])) {
                        $changes['properties'] = $properties;
                    }
                    // La description remplace le corps tant que l'utilisateur n'y a rien écrit.
                    if ($row->version === 1 && $row->content != $content) {
                        $changes['content'] = $content;
                        $changes['search_text'] = BlockText::extract($content);
                    }
                    if ($changes !== []) {
                        $row->forceFill($changes)->save();
                        $counts['updated']++;
                    }
                }
            });
        }

        // Abonnement : un événement disparu de la source, ou sorti de la fenêtre, est retiré.
        if ($source->mode === CalendarSource::SUBSCRIPTION) {
            $gone = $existing->filter(fn (Page $row, string $key) => ! isset($seen[$key]) && ! $row->trashed())->pluck('id');
            foreach ($gone->chunk(config('nonotion.ics.batch_size')) as $ids) {
                $counts['deleted'] += DB::table('pages')->whereIn('id', $ids->all())->delete();
            }
        }

        return $counts;
    }

    /**
     * Le corps de la page : la description, un paragraphe par ligne.
     *
     * @return list<array<string, mixed>>|null
     */
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

    /** Erreur : statut, message clair, et un essai suivant de plus en plus espacé (jusqu'à 24 h). */
    private function failed(CalendarSource $source, string $message): void
    {
        $failures = $source->failure_count + 1;
        $delay = min(24 * 60, config('nonotion.ics.sync_every_minutes') * 2 ** min($failures - 1, 6));
        $source->forceFill([
            'status' => 'error',
            'error_message' => $message,
            'failure_count' => $failures,
            'next_sync_at' => now()->addMinutes($delay),
        ])->save();
    }

    /**
     * L'agenda est supprimé ; ses événements partent à la corbeille, comme des pages ordinaires
     * (restaurables 30 jours). Renvoie leur nombre.
     */
    public function remove(CalendarSource $source): int
    {
        return DB::transaction(function () use ($source) {
            $rows = Page::query()->withoutGlobalScopes()->withTrashed()->where('calendar_source_id', $source->id);
            $count = (clone $rows)->whereNull('deleted_at')->count();
            (clone $rows)->whereNull('deleted_at')->update(['deleted_at' => now()]);
            $rows->update(['calendar_source_id' => null]);
            $source->delete();

            return $count;
        });
    }

    /** Planificateur : les abonnements dont la prochaine synchronisation est due (quelques-uns par passage). */
    public static function syncDue(int $limit = 5): void
    {
        $importer = app(self::class);
        CalendarSource::query()
            ->where('kind', CalendarSource::ICS)
            ->where('mode', CalendarSource::SUBSCRIPTION)
            ->where(fn ($query) => $query->whereNull('next_sync_at')->orWhere('next_sync_at', '<=', now()))
            ->orderBy('next_sync_at')
            ->limit($limit)
            ->get()
            ->each(function (CalendarSource $source) use ($importer) {
                try {
                    $importer->sync($source);
                } catch (FetchFailed) {
                    // Déjà noté sur l'agenda (statut, message, prochain essai).
                }
            });
    }
}
