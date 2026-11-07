<?php

namespace App\Http\Controllers;

use App\Http\Requests\Calendars\AddAccountCalendarRequest;
use App\Http\Requests\Calendars\ConnectIcloudRequest;
use App\Models\CalendarAccount;
use App\Models\CalendarSource;
use App\Models\Database;
use App\Models\Page;
use App\Models\User;
use App\Models\Workspace;
use App\Support\Calendars\CalendarImporter;
use App\Support\Calendars\CalendarSync;
use App\Support\Calendars\Connectors\CalDavConnector;
use App\Support\Calendars\Connectors\GoogleOAuth;
use App\Support\Calendars\FetchFailed;
use App\Support\Databases\Databases;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/**
 * Comptes Google et iCloud connectés (spec 6.15) : connexion, agendas du compte, ajout d'un agenda à
 * une base, déconnexion. Aucun jeton ni mot de passe ne revient jamais au client.
 */
class CalendarAccountController extends Controller
{
    public function __construct(private CalendarSync $sync) {}

    /** « Connecter Google Agenda » : l'adresse de la page de Google, que le client ouvre. */
    public function google(Workspace $workspace): JsonResponse
    {
        Gate::authorize('view', $workspace);
        if (! GoogleOAuth::configured()) {
            return response()->json(['message' => 'Google Agenda n’est pas encore configuré sur ce serveur.'], 422);
        }

        return response()->json(['data' => ['url' => GoogleOAuth::authorizationUrl($workspace->id, (string) Auth::id())]]);
    }

    /**
     * Le retour de Google. Le navigateur y arrive sans le jeton de l'utilisateur : le `state`
     * (chiffré, de courte durée) dit à quel espace rattacher le compte. On revient ensuite à l'Agenda.
     */
    public function googleCallback(Request $request): RedirectResponse
    {
        $back = fn (string $result) => redirect()->away(
            config('nonotion.frontend_url').'/agenda?'.http_build_query(['connexion' => $result]),
        );
        $state = GoogleOAuth::readState((string) $request->query('state', ''));
        if ($state === null || $request->filled('error') || ! $request->filled('code')) {
            return $back('annulee');
        }
        $user = User::query()->find($state['user_id']);
        if ($user === null || ! $user->belongsToWorkspace($state['workspace_id'])) {
            return $back('annulee');
        }
        try {
            $result = GoogleOAuth::exchange((string) $request->query('code'));
        } catch (FetchFailed) {
            return $back('echec');
        }
        $account = CalendarAccount::query()->withoutGlobalScopes()->firstOrNew([
            'workspace_id' => $state['workspace_id'],
            'provider' => CalendarAccount::GOOGLE,
            'account_email' => $result['email'],
        ]);
        $account->setCredentials($result['credentials']);
        $account->forceFill(['status' => 'ok', 'error_message' => null])->save();

        return $back('google');
    }

    /** « Connecter iCloud » : l'identifiant Apple et un mot de passe pour application. */
    public function icloud(ConnectIcloudRequest $request, Workspace $workspace, CalDavConnector $caldav): JsonResponse
    {
        Gate::authorize('view', $workspace);
        try {
            $credentials = $caldav->connect(trim($request->string('username')), (string) $request->string('password'));
        } catch (FetchFailed $e) {
            throw ValidationException::withMessages(['password' => $e->getMessage()]);
        }
        $account = CalendarAccount::query()->firstOrNew([
            'workspace_id' => $workspace->id,
            'provider' => CalendarAccount::ICLOUD,
            'account_email' => $credentials['username'],
        ]);
        $account->setCredentials($credentials);
        $account->forceFill(['status' => 'ok', 'error_message' => null])->save();

        return response()->json(['data' => self::present($account)], 201);
    }

    /** Les agendas du compte, chacun avec l'agenda Nonotion qui le synchronise déjà, s'il y en a un. */
    public function calendars(CalendarAccount $account): JsonResponse
    {
        Gate::authorize('update', $account);
        try {
            $calendars = $this->sync->connector($account->provider)->calendars($account);
        } catch (FetchFailed $e) {
            $account->forceFill(['status' => 'error', 'error_message' => $e->getMessage()])->save();

            return response()->json(['message' => $e->getMessage()], 422);
        }
        $added = CalendarSource::query()->where('account_id', $account->id)->pluck('id', 'remote_id');

        return response()->json(['data' => array_map(
            fn (array $calendar) => [...$calendar, 'source_id' => $added[$calendar['id']] ?? null],
            $calendars,
        )]);
    }

    /** Ajoute un agenda du compte à une base (existante, ou nouvelle) et le synchronise. */
    public function addCalendar(AddAccountCalendarRequest $request, CalendarAccount $account): JsonResponse
    {
        Gate::authorize('update', $account);
        $database = null;
        $host = null;
        if ($request->filled('database_id')) {
            $database = Database::query()->findOrFail($request->string('database_id'));
            Gate::authorize('update', $database);
        } elseif ($request->filled('page_id')) {
            $host = Page::query()->whereNull('database_id')->findOrFail($request->string('page_id'));
            Gate::authorize('update', $host);
        } else {
            $host = Workspace::query()->findOrFail($request->string('workspace_id'));
            Gate::authorize('createPage', $host);
        }
        $workspaceId = $database->workspace_id ?? ($host instanceof Workspace ? $host->id : $host->workspace_id);
        abort_unless($workspaceId === $account->workspace_id, 404);

        $remoteId = (string) $request->string('remote_id');
        $existing = CalendarSource::query()->where('url_hash', CalendarSync::hash($account, $remoteId))->first();
        if ($existing !== null) {
            return response()->json([
                'message' => "Cet agenda est déjà synchronisé (« {$existing->name} »).",
                'existing' => ['id' => $existing->id, 'name' => $existing->name, 'database_id' => $existing->database_id],
            ], 409);
        }

        try {
            $calendar = collect($this->sync->connector($account->provider)->calendars($account))->firstWhere('id', $remoteId);
            if ($calendar === null) {
                throw new FetchFailed('Cet agenda n’existe plus dans le compte.');
            }
            $result = $this->sync->add($account, $calendar, trim($request->string('name')), (string) $request->string('color'), $database, $host);
        } catch (FetchFailed $e) {
            throw ValidationException::withMessages(['remote_id' => $e->getMessage()]);
        }

        return response()->json([
            'data' => CalendarSourceController::present($result['source']),
            'imported' => $result['created'],
            'database' => Databases::detail($result['database']),
            'page' => $result['page'] === null ? null : PageController::detail($result['page']->refresh()),
        ], 201);
    }

    /**
     * Déconnexion : le jeton est révoqué chez Google, les agendas du compte disparaissent (leurs
     * événements vont à la corbeille, comme pour un agenda par lien) et les identifiants sont effacés.
     */
    public function destroy(CalendarAccount $account, CalendarImporter $importer): JsonResponse
    {
        Gate::authorize('delete', $account);
        if ($account->provider === CalendarAccount::GOOGLE) {
            GoogleOAuth::revoke($account);
        }
        $moved = 0;
        foreach ($account->sources as $source) {
            $moved += $importer->remove($source);
        }
        $account->delete();

        return response()->json(['data' => ['moved_to_trash' => $moved]]);
    }

    /** @return array<string, mixed> */
    public static function present(CalendarAccount $account): array
    {
        return [
            'id' => $account->id,
            'provider' => $account->provider,
            'account_email' => $account->account_email,
            'status' => $account->status,
            'error_message' => $account->error_message,
            'last_sync_at' => $account->last_sync_at?->toIso8601String(),
        ];
    }
}
