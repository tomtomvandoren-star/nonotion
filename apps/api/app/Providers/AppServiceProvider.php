<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Notifications\Messages\MailMessage;
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
