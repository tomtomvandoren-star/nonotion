<?php

namespace App\Http\Controllers;

use App\Models\Database;
use App\Models\Page;
use App\Models\Scopes\VisibleToCurrentUser;
use App\Models\View;
use App\Support\Databases\PropertyValue;
use DateInterval;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Sabre\VObject\Component\VCalendar;

/**
 * Afficher une base dans Google Agenda ou le Calendrier Apple : un lien secret d'abonnement (ICS)
 * qui publie ses éléments datés, et que ces agendas relisent d'eux-mêmes. Les événements importés
 * d'un autre agenda n'y sont pas repris (ils y sont déjà).
 */
class CalendarFeedController extends Controller
{
    /** Crée le lien s'il n'existe pas encore. */
    public function store(Database $database): JsonResponse
    {
        Gate::authorize('update', $database);
        if ($database->feed_token === null) {
            $database->forceFill(['feed_token' => Str::random(40)])->save();
        }

        return response()->json(['data' => ['feed_url' => self::url($database)]]);
    }

    /** Le lien est révoqué : les agendas abonnés ne reçoivent plus rien. */
    public function destroy(Database $database): JsonResponse
    {
        Gate::authorize('update', $database);
        $database->forceFill(['feed_token' => null])->save();

        return response()->json(['data' => ['feed_url' => null]]);
    }

    public static function url(Database $database): ?string
    {
        return $database->feed_token === null ? null : url("/api/feeds/{$database->feed_token}.ics");
    }

    /** Le flux lui-même : public, mais seulement pour qui connaît le jeton. */
    public function show(string $token): Response
    {
        $database = Database::query()->withoutGlobalScope(VisibleToCurrentUser::class)
            ->where('feed_token', $token)->first();
        abort_if($database === null, 404);

        $calendar = new VCalendar([
            'PRODID' => '-//Nonotion//Agenda//FR',
            'X-WR-CALNAME' => $database->title ?: 'Nonotion',
            // Une indication pour les agendas qui la lisent (le Calendrier Apple) : relire toutes les heures.
            'X-PUBLISHED-TTL' => 'PT1H',
        ]);
        $date = self::dateProperty($database);
        $status = collect($database->schema)->firstWhere('type', 'status');
        $done = $status === null ? [] : collect($status['options'])->where('group', 'complete')->pluck('id')->all();

        if ($date !== null) {
            $rows = Page::query()->withoutGlobalScope(VisibleToCurrentUser::class)
                ->where('database_id', $database->id)
                ->whereNull('calendar_source_id')
                ->get();
            foreach ($rows as $row) {
                $value = $row->properties[$date] ?? null;
                if (! PropertyValue::isValid(['type' => 'date'], $value) || $value === null) {
                    continue;
                }
                $isDone = $status !== null && in_array($row->properties[$status['id']] ?? null, $done, true);
                self::addEvent($calendar, $row, $value, $isDone);
            }
        }

        return response($calendar->serialize(), 200, [
            'Content-Type' => 'text/calendar; charset=utf-8',
            'Cache-Control' => 'private, max-age=300',
        ]);
    }

    /** La Date du premier calendrier de la base, sinon sa première Date. */
    private static function dateProperty(Database $database): ?string
    {
        $dates = collect($database->schema)->where('type', 'date')->pluck('id');
        $calendarBy = View::query()->withoutGlobalScope(VisibleToCurrentUser::class)
            ->where('database_id', $database->id)->where('type', 'calendar')
            ->orderBy('position')->get()->pluck('config.calendar_by')->first(fn ($id) => $dates->contains($id));

        return $calendarBy ?? $dates->first();
    }

    /** @param array{start: string, end?: string|null, repeat?: array<string, mixed>|null} $value */
    private static function addEvent(VCalendar $calendar, Page $row, array $value, bool $isDone): void
    {
        $utc = new DateTimeZone('UTC');
        $event = $calendar->add('VEVENT', [
            'UID' => "{$row->id}@nonotion",
            // Une tâche faite se voit dans l'agenda.
            'SUMMARY' => ($isDone ? '✓ ' : '').($row->title !== '' ? $row->title : 'Sans titre'),
            'DTSTAMP' => ($row->updated_at ?? now())->toDateTimeImmutable()->setTimezone($utc),
            'URL' => rtrim((string) config('nonotion.frontend_url'), '/')."/p/{$row->id}",
        ]);

        $allDay = strlen($value['start']) === 10;
        if ($allDay) {
            // Journée entière : la fin d'iCalendar est exclusive (le lendemain du dernier jour).
            $last = new DateTimeImmutable(($value['end'] ?? null) ?: $value['start'], $utc);
            $event->add('DTSTART', new DateTimeImmutable($value['start'], $utc), ['VALUE' => 'DATE']);
            $event->add('DTEND', $last->add(new DateInterval('P1D')), ['VALUE' => 'DATE']);
        } else {
            $start = (new DateTimeImmutable($value['start']))->setTimezone($utc);
            $end = isset($value['end']) ? (new DateTimeImmutable($value['end']))->setTimezone($utc) : $start->add(new DateInterval('PT30M'));
            $event->add('DTSTART', $start);
            $event->add('DTEND', $end);
        }

        $repeat = $value['repeat'] ?? null;
        if (is_array($repeat)) {
            $rule = [
                'FREQ' => ['day' => 'DAILY', 'week' => 'WEEKLY', 'month' => 'MONTHLY', 'year' => 'YEARLY'][$repeat['unit']],
                'INTERVAL' => $repeat['interval'],
            ];
            if (isset($repeat['count'])) {
                $rule['COUNT'] = $repeat['count'];
            } elseif (isset($repeat['until'])) {
                $rule['UNTIL'] = str_replace('-', '', $repeat['until']).($allDay ? '' : 'T235959Z');
            }
            $event->add('RRULE', $rule);
        }
    }
}
