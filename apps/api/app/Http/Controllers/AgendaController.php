<?php

namespace App\Http\Controllers;

use App\Http\Requests\Calendars\UpdateAgendaRequest;
use App\Models\CalendarAccount;
use App\Models\CalendarSource;
use App\Models\Workspace;
use App\Support\Calendars\Agenda;
use App\Support\Calendars\Connectors\GoogleOAuth;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

/**
 * La page « Agenda » de l'espace de travail (spec 6.15) : les bases qu'elle peut réunir, les agendas
 * importés ou connectés, et ses réglages. Les éléments eux-mêmes arrivent par les bases (une requête
 * par base affichée) : la même mise en cache et les mêmes mises à jour optimistes qu'ailleurs.
 */
class AgendaController extends Controller
{
    public function show(Workspace $workspace): JsonResponse
    {
        Gate::authorize('view', $workspace);

        return response()->json(['data' => self::present($workspace)]);
    }

    public function update(UpdateAgendaRequest $request, Workspace $workspace): JsonResponse
    {
        Gate::authorize('view', $workspace);
        $workspace->forceFill(['agenda' => [
            ...Agenda::DEFAULTS,
            ...($workspace->agenda ?? []),
            ...$request->validated(),
        ]])->save();

        return response()->json(['data' => self::present($workspace)]);
    }

    /** @return array<string, mixed> */
    public static function present(Workspace $workspace): array
    {
        $databases = Agenda::databases($workspace);
        $sources = CalendarSource::query()->where('workspace_id', $workspace->id)
            ->orderBy('created_at')->orderBy('id')->get();

        $settings = Agenda::settings($workspace, array_column($databases, 'id'), $sources->pluck('id')->all());

        return [
            // Un objet JSON, même vide (pas un tableau).
            'settings' => [...$settings, 'colors' => (object) $settings['colors']],
            'databases' => $databases,
            'sources' => $sources->map(fn (CalendarSource $source) => CalendarSourceController::present($source))->all(),
            'accounts' => CalendarAccount::query()->where('workspace_id', $workspace->id)->orderBy('created_at')->get()
                ->map(fn (CalendarAccount $account) => CalendarAccountController::present($account))->all(),
            // « Connecter Google Agenda » n'est proposé que si le serveur a ses identifiants OAuth.
            'google_available' => GoogleOAuth::configured(),
        ];
    }
}
