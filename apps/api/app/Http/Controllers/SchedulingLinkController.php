<?php

namespace App\Http\Controllers;

use App\Http\Requests\Scheduling\SchedulingLinkRequest;
use App\Models\Booking;
use App\Models\SchedulingLink;
use App\Models\Workspace;
use App\Support\Calendars\Agenda;
use App\Support\Scheduling\Bookings;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Les liens de planification de l'organisateur (spec 6.17, 3) : créer, modifier, désactiver,
 * dupliquer, supprimer, et voir leurs rendez-vous. Supprimer un lien ne touche pas aux rendez-vous
 * déjà pris : seule la prise de nouveaux est bloquée.
 */
class SchedulingLinkController extends Controller
{
    public function index(Workspace $workspace): JsonResponse
    {
        Gate::authorize('view', $workspace);

        $links = SchedulingLink::query()
            ->where('workspace_id', $workspace->id)->where('user_id', auth()->id())
            ->withCount(['bookings as upcoming_count' => fn ($query) => $query->withoutGlobalScopes()
                ->where('status', 'confirmed')->where('end_at', '>', now())])
            ->orderBy('created_at')->get();

        return response()->json(['data' => $links->map(fn (SchedulingLink $link) => self::present($link))->all()]);
    }

    public function store(SchedulingLinkRequest $request, Workspace $workspace): JsonResponse
    {
        Gate::authorize('createPage', $workspace);

        $link = new SchedulingLink([
            'workspace_id' => $workspace->id,
            'user_id' => auth()->id(),
            'slug' => Str::lower(Str::random(10)),
            'status' => 'active',
        ]);
        $this->fill($link, $request, $workspace);
        $link->save();

        return response()->json(['data' => self::present($link->refresh())], 201);
    }

    public function update(SchedulingLinkRequest $request, SchedulingLink $link): JsonResponse
    {
        $this->authorizeOwner($link);
        $workspace = Workspace::query()->findOrFail($link->workspace_id);
        $this->fill($link, $request, $workspace);
        // Réactiver un lien à usage unique déjà réservé : un choix explicite de l'organisateur.
        if ($request->input('status') === 'active' && $link->getOriginal('status') === 'consumed') {
            $link->status = 'active';
        }
        $link->save();

        return response()->json(['data' => self::present($link->refresh())]);
    }

    public function duplicate(SchedulingLink $link): JsonResponse
    {
        $this->authorizeOwner($link);
        $copy = $link->replicate();
        $copy->slug = Str::lower(Str::random(10));
        $copy->title = mb_substr($link->title.' (copie)', 0, 255);
        $copy->status = 'active';
        $copy->save();

        return response()->json(['data' => self::present($copy->refresh())], 201);
    }

    public function destroy(SchedulingLink $link): JsonResponse
    {
        $this->authorizeOwner($link);
        $link->delete();

        return response()->json(['status' => 'ok']);
    }

    /** Les rendez-vous pris par ce lien, les prochains d'abord. */
    public function bookings(SchedulingLink $link): JsonResponse
    {
        $this->authorizeOwner($link);
        $bookings = $link->bookings()->orderByDesc('start_at')->limit(200)->get()
            ->map(fn (Booking $booking) => [
                'id' => $booking->id,
                'page_id' => $booking->page_id,
                'invitee_name' => $booking->invitee_name,
                'invitee_email' => $booking->invitee_email,
                'note' => $booking->note,
                'start_at' => $booking->start_at->toIso8601String(),
                'end_at' => $booking->end_at->toIso8601String(),
                'status' => $booking->status,
                'cancel_reason' => $booking->cancel_reason,
                'cancelled_by' => $booking->cancelled_by,
            ]);

        return response()->json(['data' => $bookings->all()]);
    }

    /** @return array<string, mixed> */
    public static function present(SchedulingLink $link): array
    {
        return [
            'id' => $link->id,
            'type' => $link->type,
            'slug' => $link->slug,
            'url' => Bookings::publicUrl($link),
            'title' => $link->title,
            'description' => $link->description,
            'duration_minutes' => $link->duration_minutes,
            'slot_step_minutes' => $link->slot_step_minutes,
            'buffer_before_minutes' => $link->buffer_before_minutes,
            'buffer_after_minutes' => $link->buffer_after_minutes,
            'timezone' => $link->timezone,
            'availability' => $link->availability,
            'target_database_id' => $link->target_database_id,
            'avoid_conflicts' => $link->avoid_conflicts,
            'allow_multiple_bookings' => $link->allow_multiple_bookings,
            'single_use' => $link->single_use,
            'min_notice_minutes' => $link->min_notice_minutes,
            'max_advance_days' => $link->max_advance_days,
            'location' => $link->location,
            'video_url' => $link->video_url,
            'phone' => $link->phone,
            'expires_at' => $link->expires_at?->toIso8601String(),
            'status' => $link->status,
            'unavailable_reason' => $link->unavailableReason(),
            'upcoming_count' => (int) ($link->upcoming_count ?? $link->bookings()->where('status', 'confirmed')->where('end_at', '>', now())->count()),
        ];
    }

    private function authorizeOwner(SchedulingLink $link): void
    {
        abort_unless($link->user_id === auth()->id(), 404);
    }

    private function fill(SchedulingLink $link, SchedulingLinkRequest $request, Workspace $workspace): void
    {
        $data = $request->validated();
        $type = $data['type'] ?? $link->type;

        if (array_key_exists('availability', $data) || array_key_exists('type', $data)) {
            $data['availability'] = self::availability($type, $data['availability'] ?? $link->availability ?? []);
        }
        if (array_key_exists('target_database_id', $data) && $data['target_database_id'] !== null) {
            $ids = array_column(Agenda::databases($workspace), 'id');
            if (! in_array($data['target_database_id'], $ids, true)) {
                throw ValidationException::withMessages(['target_database_id' => 'Choisissez une base de l’Agenda, avec une Date.']);
            }
        }
        if (array_key_exists('slug', $data)) {
            if ($data['slug'] === null || $data['slug'] === '') {
                unset($data['slug']);
            } elseif (SchedulingLink::query()->withoutGlobalScopes()->withTrashed()
                ->where('slug', $data['slug'])->whereKeyNot($link->id ?? '')->exists()) {
                throw ValidationException::withMessages(['slug' => 'Cette adresse est déjà prise.']);
            }
        }
        if (array_key_exists('expires_at', $data) && $data['expires_at'] !== null) {
            $data['expires_at'] = CarbonImmutable::parse($data['expires_at']);
        }
        // L'usage unique ne vaut que pour un lien ponctuel.
        if ($type === SchedulingLink::RECURRING) {
            $data['single_use'] = false;
        }
        unset($data['status']);
        $link->fill($data);
        if ($request->input('status') === 'disabled' || ($request->input('status') === 'active' && $link->status === 'disabled')) {
            $link->status = $request->input('status');
        }
    }

    /**
     * Les plages, vérifiées et remises au propre. Récurrent : jour (1 = lundi … 7 = dimanche) et heures
     * locales ; ponctuel : début et fin, en UTC.
     *
     * @param  array<int, mixed>  $items
     * @return list<array<string, mixed>>
     */
    private static function availability(string $type, array $items): array
    {
        $clean = [];
        foreach (array_values($items) as $i => $item) {
            $error = fn (string $message) => ValidationException::withMessages(["availability.{$i}" => $message]);
            if (! is_array($item)) {
                throw $error('Plage invalide.');
            }
            if ($type === SchedulingLink::RECURRING) {
                $weekday = filter_var($item['weekday'] ?? null, FILTER_VALIDATE_INT);
                $start = (string) ($item['start'] ?? '');
                $end = (string) ($item['end'] ?? '');
                if ($weekday === false || $weekday < 1 || $weekday > 7) {
                    throw $error('Jour de la semaine invalide.');
                }
                if (! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $start) || ! preg_match('/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/', $end) || $end <= $start) {
                    throw $error('La plage doit finir après son début (heures HH:MM).');
                }
                $clean[] = ['weekday' => $weekday, 'start' => $start, 'end' => $end === '24:00' ? '23:59' : $end];
            } else {
                try {
                    $start = CarbonImmutable::parse((string) ($item['start'] ?? ''))->utc();
                    $end = CarbonImmutable::parse((string) ($item['end'] ?? ''))->utc();
                } catch (Throwable) {
                    throw $error('Date invalide.');
                }
                if ($end <= $start) {
                    throw $error('La plage doit finir après son début.');
                }
                $clean[] = ['start' => $start->format('Y-m-d\TH:i:s\Z'), 'end' => $end->format('Y-m-d\TH:i:s\Z')];
            }
        }
        usort($clean, fn (array $a, array $b) => [$a['weekday'] ?? 0, $a['start']] <=> [$b['weekday'] ?? 0, $b['start']]);

        return $clean;
    }
}
