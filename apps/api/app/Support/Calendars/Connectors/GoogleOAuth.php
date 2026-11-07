<?php

namespace App\Support\Calendars\Connectors;

use App\Models\CalendarAccount;
use App\Support\Calendars\FetchFailed;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;

/**
 * La connexion d'un compte Google (spec 6.15) : OAuth 2.0 côté serveur, flux « code
 * d'autorisation » avec un client confidentiel. Le jeton de rafraîchissement reste sur le serveur,
 * chiffré ; le navigateur (ou l'application) ne voit jamais aucun jeton Google.
 */
class GoogleOAuth
{
    public const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

    public const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    public const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

    public const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

    /** Lire et modifier les événements, lister les agendas, et connaître l'adresse du compte. */
    public const SCOPES = [
        'openid',
        'email',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    ];

    /** Durée de validité du lien de connexion (le temps de passer par la page de Google). */
    private const STATE_MINUTES = 15;

    public static function configured(): bool
    {
        return filled(config('services.google.client_id')) && filled(config('services.google.client_secret'));
    }

    public static function redirectUri(): string
    {
        return (string) (config('services.google.redirect') ?: url('/api/integrations/google/callback'));
    }

    /**
     * L'adresse de la page de Google. Le retour (callback) n'a pas le jeton de l'utilisateur : le
     * `state`, chiffré et de courte durée, dit à quel espace de travail rattacher le compte.
     */
    public static function authorizationUrl(string $workspaceId, string $userId): string
    {
        $state = Crypt::encryptString(json_encode([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'expires_at' => now()->addMinutes(self::STATE_MINUTES)->timestamp,
        ]));

        return self::AUTHORIZE_URL.'?'.http_build_query([
            'client_id' => config('services.google.client_id'),
            'redirect_uri' => self::redirectUri(),
            'response_type' => 'code',
            'scope' => implode(' ', self::SCOPES),
            // Un jeton de rafraîchissement, à chaque connexion (même si le compte l'a déjà été).
            'access_type' => 'offline',
            'prompt' => 'consent',
            'include_granted_scopes' => 'true',
            'state' => $state,
        ]);
    }

    /**
     * Le `state` du retour : l'espace et l'utilisateur, si le lien est intact et pas expiré.
     *
     * @return array{workspace_id: string, user_id: string}|null
     */
    public static function readState(string $state): ?array
    {
        try {
            $data = json_decode(Crypt::decryptString($state), true);
        } catch (\Throwable) {
            return null;
        }
        if (! is_array($data) || ($data['expires_at'] ?? 0) < now()->timestamp) {
            return null;
        }

        return ['workspace_id' => (string) $data['workspace_id'], 'user_id' => (string) $data['user_id']];
    }

    /**
     * Échange le code du retour contre les jetons, et l'adresse du compte.
     *
     * @return array{email: string, credentials: array<string, mixed>}
     */
    public static function exchange(string $code): array
    {
        $tokens = self::tokenRequest([
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => self::redirectUri(),
        ]);
        if (! isset($tokens['refresh_token'])) {
            throw new FetchFailed('Google n’a pas donné d’accès durable : reconnectez le compte.');
        }
        $email = self::send(fn () => Http::withToken($tokens['access_token'])->acceptJson()->get(self::USERINFO_URL))['email'] ?? null;
        if (! is_string($email) || $email === '') {
            throw new FetchFailed('Google n’a pas donné l’adresse du compte.');
        }

        return ['email' => $email, 'credentials' => self::credentials($tokens)];
    }

    /** Un jeton d'accès valide pour ce compte, rafraîchi s'il expire dans moins d'une minute. */
    public static function accessToken(CalendarAccount $account): string
    {
        $credentials = $account->credentials();
        if (isset($credentials['access_token']) && ($credentials['expires_at'] ?? 0) > now()->addMinute()->timestamp) {
            return $credentials['access_token'];
        }
        try {
            $tokens = self::tokenRequest([
                'grant_type' => 'refresh_token',
                'refresh_token' => $credentials['refresh_token'] ?? '',
            ]);
        } catch (FetchFailed $e) {
            throw new FetchFailed('Google refuse l’accès à ce compte (jeton révoqué ou expiré) : reconnectez-le.', previous: $e);
        }
        $account->setCredentials([...$credentials, ...self::credentials($tokens)]);
        $account->save();

        return $tokens['access_token'];
    }

    /** Déconnexion : le jeton est révoqué chez Google (sans erreur s'il l'était déjà). */
    public static function revoke(CalendarAccount $account): void
    {
        $token = $account->credentials()['refresh_token'] ?? null;
        if ($token === null) {
            return;
        }
        try {
            Http::asForm()->timeout(10)->post(self::REVOKE_URL, ['token' => $token]);
        } catch (ConnectionException) {
            // Révoqué plus tard par Google (jeton inutilisé) ; les identifiants sont effacés ici.
        }
    }

    /**
     * @param  array<string, string>  $form
     * @return array<string, mixed>
     */
    private static function tokenRequest(array $form): array
    {
        $tokens = self::send(fn () => Http::asForm()->acceptJson()->timeout(15)->post(self::TOKEN_URL, [
            ...$form,
            'client_id' => config('services.google.client_id'),
            'client_secret' => config('services.google.client_secret'),
        ]));
        if (! isset($tokens['access_token'])) {
            throw new FetchFailed('Google n’a pas donné de jeton d’accès.');
        }

        return $tokens;
    }

    /**
     * @param  array<string, mixed>  $tokens
     * @return array<string, mixed>
     */
    private static function credentials(array $tokens): array
    {
        return array_filter([
            'refresh_token' => $tokens['refresh_token'] ?? null,
            'access_token' => $tokens['access_token'],
            'expires_at' => Carbon::now()->addSeconds((int) ($tokens['expires_in'] ?? 3600))->timestamp,
        ], fn ($value) => $value !== null);
    }

    /**
     * @param  callable(): Response  $request
     * @return array<string, mixed>
     */
    private static function send(callable $request): array
    {
        try {
            $response = $request();
        } catch (ConnectionException) {
            throw new FetchFailed('Google ne répond pas. Réessayez dans un instant.');
        }
        if (! $response->successful()) {
            // Jamais le corps de la réponse : il peut contenir un jeton.
            throw new FetchFailed("Google a refusé la demande (HTTP {$response->status()}).");
        }

        return $response->json() ?? [];
    }
}
