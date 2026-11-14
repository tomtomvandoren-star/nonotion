<?php

namespace App\Http\Controllers;

use App\Models\FreebusyShare;
use App\Models\User;
use App\Models\Workspace;
use App\Support\Scheduling\Availability;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Voir les disponibilités d'une personne (spec 6.17, fonction A) : seulement celles qui me l'ont
 * permis (« Qui peut voir mes disponibilités »), et seulement en blocs « Occupé » anonymes.
 */
class PeopleController extends Controller
{
    /** La recherche ne trouve jamais personne en dehors de ce périmètre. */
    public function search(Request $request): JsonResponse
    {
        $q = mb_strtolower(trim((string) $request->query('q', '')));
        $me = $request->user();

        $people = User::query()
            ->whereIn('id', FreebusyShare::query()->where('viewer_email', mb_strtolower($me->email))->select('owner_id'))
            ->whereKeyNot($me->id)
            ->when($q !== '', fn ($query) => $query->where(fn ($match) => $match
                ->whereRaw('LOWER(name) LIKE ?', ['%'.addcslashes($q, '%_\\').'%'])
                ->orWhereRaw('LOWER(email) LIKE ?', ['%'.addcslashes($q, '%_\\').'%'])))
            ->orderBy('name')->limit(20)->get(['id', 'name', 'email']);

        return response()->json(['data' => $people->map(fn (User $user) => [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ])->all()]);
    }

    /** Les blocs occupés d'une personne, en UTC : ni titre, ni description, ni participants. */
    public function freebusy(Request $request, string $person): JsonResponse
    {
        $me = $request->user();
        $allowed = FreebusyShare::query()
            ->where('owner_id', $person)->where('viewer_email', mb_strtolower($me->email))->exists();
        abort_unless($allowed, 404);

        $data = $request->validate(['from' => ['required', 'date'], 'to' => ['required', 'date', 'after:from']]);
        $from = CarbonImmutable::parse($data['from'])->utc();
        $to = CarbonImmutable::parse($data['to'])->utc();
        if ($from->diffInDays($to) > 62) {
            $to = $from->addDays(62);
        }
        $workspace = Workspace::query()->withoutGlobalScopes()->where('owner_id', $person)->orderBy('created_at')->first();
        $busy = $workspace === null ? [] : Availability::busy($person, $workspace->id, $from, $to);

        return response()->json(['data' => array_map(fn (array $interval) => [
            'start' => gmdate('Y-m-d\TH:i:s\Z', max($interval[0], $from->getTimestamp())),
            'end' => gmdate('Y-m-d\TH:i:s\Z', min($interval[1], $to->getTimestamp())),
        ], $busy)]);
    }
}
