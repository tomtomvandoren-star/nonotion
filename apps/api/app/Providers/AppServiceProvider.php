<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Créations de compte : 10 par minute et par adresse IP, sauf en local et dans les tests,
        // où les tests de bout en bout créent un compte par scénario.
        RateLimiter::for('register', fn (Request $request) => app()->environment('local', 'testing')
            ? Limit::none()
            : Limit::perMinute(10)->by($request->ip()));

        // E-mail de réinitialisation en français ; le lien mène au front (SPA),
        // qui appelle ensuite POST /api/auth/reset-password.
        ResetPassword::toMailUsing(function (User $user, string $token) {
            $url = config('nonotion.frontend_url').'/reset-password?'
                .http_build_query(['token' => $token, 'email' => $user->getEmailForPasswordReset()]);

            return (new MailMessage)
                ->subject('Réinitialiser votre mot de passe Nonotion')
                ->greeting("Bonjour {$user->name},")
                ->line('Vous avez demandé à réinitialiser le mot de passe de votre compte Nonotion.')
                ->action('Choisir un nouveau mot de passe', $url)
                ->line('Ce lien expire dans '.config('auth.passwords.users.expire').' minutes.')
                ->line('Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet e-mail.')
                ->salutation('L’équipe Nonotion');
        });
    }
}
