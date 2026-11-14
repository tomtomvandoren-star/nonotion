<?php

namespace App\Providers;

use App\Models\User;
use App\Support\PhpMailTransport;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Symfony\Component\Mailer\Transport\SendmailTransport;

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
        // MAIL_MAILER=sendmail : la commande sendmail, ou la fonction mail() de PHP quand le site ne
        // peut pas lancer de commande (proc_open désactivé, comme sur l'hébergement mutualisé).
        Mail::extend('sendmail', fn (array $config) => function_exists('proc_open')
            ? new SendmailTransport($config['path'] ?? null)
            : new PhpMailTransport);

        // Créations de compte : 10 par minute et par adresse IP, sauf en local et dans les tests,
        // où les tests de bout en bout créent un compte par scénario.
        RateLimiter::for('register', fn (Request $request) => app()->environment('local', 'testing')
            ? Limit::none()
            : Limit::perMinute(10)->by($request->ip()));

        // Pages publiques de Planifier (spec 6.17, 6.3), par adresse IP : lire (la page, les
        // créneaux) et écrire (réserver, replanifier, annuler) ont chacun leur compteur, pour que
        // parcourir les créneaux n'épuise pas le droit de réserver.
        RateLimiter::for('scheduling-read', fn (Request $request) => app()->environment('local', 'testing')
            ? Limit::none()
            : Limit::perMinute(120)->by($request->ip()));
        RateLimiter::for('scheduling-write', fn (Request $request) => app()->environment('local', 'testing')
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
