<?php

namespace App\Http\Controllers;

use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Models\User;
use App\Support\Onboarding;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;
use Symfony\Component\Mime\Exception\ExceptionInterface as MimeExceptionInterface;

/**
 * Comptes par jetons Bearer (Sanctum) : un seul mécanisme pour le web, le desktop et le mobile.
 */
class AuthController extends Controller
{
    private const MAX_LOGIN_ATTEMPTS = 5;

    public function register(RegisterRequest $request): JsonResponse
    {
        abort_unless(
            config('nonotion.registration_open') || ! User::query()->exists(),
            403,
            __('auth.registration_closed'),
        );

        $user = Onboarding::createAccount(
            $request->string('name')->toString(),
            $request->string('email')->toString(),
            $request->string('password')->toString(),
        );

        return response()->json($this->session($user, $request), 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $key = $request->throttleKey();
        if (RateLimiter::tooManyAttempts($key, self::MAX_LOGIN_ATTEMPTS)) {
            throw ValidationException::withMessages([
                'email' => __('auth.throttle', ['seconds' => RateLimiter::availableIn($key)]),
            ])->status(429);
        }

        $user = User::where('email', $request->input('email'))->first();
        if (! $user || ! Hash::check($request->string('password')->toString(), $user->password)) {
            RateLimiter::hit($key, 60);

            throw ValidationException::withMessages(['email' => __('auth.failed')]);
        }

        RateLimiter::clear($key);

        return response()->json($this->session($user, $request));
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();
        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }

        return response()->json(['status' => 'ok']);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json($this->profile($user));
    }

    public function forgotPassword(ForgotPasswordRequest $request): JsonResponse
    {
        try {
            // Même réponse que le compte existe ou non : on ne révèle pas quelles adresses sont inscrites.
            Password::sendResetLink(['email' => $request->input('email')]);
        } catch (TransportExceptionInterface|MimeExceptionInterface $e) {
            // Serveur SMTP injoignable, ou adresse d'expédition mal réglée (MAIL_FROM_ADDRESS) : le lien
            // n'est pas parti. On retire le jeton créé, sinon la limite d'un envoi par minute ferait
            // répondre au prochain essai qu'un e-mail vient d'être envoyé.
            $user = User::query()->where('email', $request->input('email'))->first();
            if ($user !== null) {
                Password::broker()->deleteToken($user);
            }
            Log::error('Envoi de l’e-mail de réinitialisation impossible', ['exception' => $e::class, 'message' => $e->getMessage()]);

            return response()->json(['message' => __('auth.mail_unavailable')], 503);
        }

        return response()->json(['message' => __('auth.reset_link_sent')]);
    }

    public function resetPassword(ResetPasswordRequest $request): JsonResponse
    {
        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill(['password' => $password])->save();
                // Un mot de passe réinitialisé déconnecte tous les appareils.
                $user->tokens()->delete();
                event(new PasswordReset($user));
            },
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => __($status)]);
        }

        return response()->json(['message' => __($status)]);
    }

    /** @return array<string, mixed> */
    private function session(User $user, Request $request): array
    {
        $device = $request->string('device_name')->toString() ?: 'web';

        return ['token' => $user->createToken($device)->plainTextToken, ...$this->profile($user)];
    }

    /** @return array<string, mixed> */
    private function profile(User $user): array
    {
        return [
            'user' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email],
            'workspaces' => $user->workspaces()
                ->withoutGlobalScopes()
                ->orderBy('workspaces.created_at')
                ->get()
                ->map(fn ($workspace) => [
                    'id' => $workspace->id,
                    'name' => $workspace->name,
                    'role' => $workspace->pivot->role,
                ])
                ->values(),
        ];
    }
}
