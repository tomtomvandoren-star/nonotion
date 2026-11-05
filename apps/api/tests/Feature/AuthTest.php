<?php

use App\Models\Page;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Symfony\Component\Mailer\Exception\TransportException;

function registerPayload(array $overrides = []): array
{
    return [
        'name' => 'Alice',
        'email' => 'alice@example.test',
        'password' => 'mot-de-passe-solide',
        'password_confirmation' => 'mot-de-passe-solide',
        ...$overrides,
    ];
}

it('crée le compte, son workspace et une première page, puis renvoie un jeton', function () {
    $response = $this->postJson('/api/auth/register', registerPayload())->assertCreated();

    $response->assertJsonStructure(['token', 'user' => ['id', 'name', 'email'], 'workspaces' => [['id', 'name', 'role']]]);
    expect($response->json('workspaces.0.role'))->toBe('owner');

    $this->withToken($response->json('token'))
        ->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonPath('user.email', 'alice@example.test');

    $workspaceId = $response->json('workspaces.0.id');
    expect(Page::query()->withoutGlobalScopes()->where('workspace_id', $workspaceId)->count())->toBe(1);
});

it('accepte toujours le premier compte mais ferme ensuite les inscriptions', function () {
    config(['nonotion.registration_open' => false]);

    $this->postJson('/api/auth/register', registerPayload())->assertCreated();
    $this->postJson('/api/auth/register', registerPayload(['email' => 'bob@example.test']))
        ->assertForbidden()
        ->assertJsonPath('message', 'Les inscriptions sont fermées sur ce serveur.');
});

it('valide l’inscription avec des messages en français', function () {
    $this->postJson('/api/auth/register', registerPayload(['email' => 'pas-un-email', 'password_confirmation' => 'autre']))
        ->assertUnprocessable()
        ->assertJsonPath('errors.email.0', 'Le champ adresse e-mail doit être une adresse e-mail valide.')
        ->assertJsonPath('errors.password.0', 'La confirmation du champ mot de passe ne correspond pas.');
});

it('connecte avec le bon mot de passe et refuse le mauvais', function () {
    $user = createAccount('Bob');

    $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'mot-de-passe-solide'])
        ->assertOk()
        ->assertJsonStructure(['token', 'user', 'workspaces']);

    $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'faux'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.email.0', 'Adresse e-mail ou mot de passe incorrect.');
});

it('limite les tentatives de connexion', function () {
    $user = createAccount('Carla');
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'faux'])->assertUnprocessable();
    }

    // Même le bon mot de passe est refusé tant que le délai n'est pas écoulé.
    $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'mot-de-passe-solide'])
        ->assertStatus(429);
});

it('révoque le jeton à la déconnexion', function () {
    $token = $this->postJson('/api/auth/register', registerPayload())->json('token');

    $this->withToken($token)->postJson('/api/auth/logout')->assertOk();

    $this->app['auth']->forgetGuards();
    $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
});

it('répond 401 en JSON sans jeton, même sans en-tête Accept', function () {
    $this->get('/api/auth/me')->assertUnauthorized()->assertJson(['message' => 'Unauthenticated.']);
});

it('envoie un lien de réinitialisation vers le front, sans révéler si le compte existe', function () {
    Notification::fake();
    $user = createAccount('Dora');

    $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertOk();
    $this->postJson('/api/auth/forgot-password', ['email' => 'inconnu@example.test'])
        ->assertOk()
        ->assertJsonPath('message', 'Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé.');

    Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $notification) use ($user) {
        $mail = $notification->toMail($user);

        return str_starts_with($mail->actionUrl, config('nonotion.frontend_url').'/reset-password?token=')
            && $mail->subject === 'Réinitialiser votre mot de passe Nonotion';
    });
});

it('répond 503 avec un message clair si l’envoi d’e-mails ne marche pas', function () {
    $user = createAccount('Gaby');
    Password::shouldReceive('sendResetLink')->andThrow(new TransportException('SMTP injoignable'));
    // Le jeton créé pour un envoi raté est retiré (sinon le réessai répondrait « envoyé »).
    Password::shouldReceive('broker->deleteToken')->once();

    $this->postJson('/api/auth/forgot-password', ['email' => $user->email])
        ->assertStatus(503)
        ->assertJsonPath('message', 'L’envoi d’e-mails est indisponible pour le moment. Réessayez plus tard.');
});

it('réinitialise le mot de passe et déconnecte tous les appareils', function () {
    $user = createAccount('Emma');
    $oldToken = $user->createToken('ancien appareil')->plainTextToken;
    $token = Password::createToken($user);

    $this->postJson('/api/auth/reset-password', [
        'token' => $token,
        'email' => $user->email,
        'password' => 'nouveau-mot-de-passe',
        'password_confirmation' => 'nouveau-mot-de-passe',
    ])->assertOk();

    $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'nouveau-mot-de-passe'])->assertOk();
    expect(User::find($user->id)->tokens()->where('name', 'ancien appareil')->exists())->toBeFalse();

    $this->app['auth']->forgetGuards();
    $this->withToken($oldToken)->getJson('/api/auth/me')->assertUnauthorized();
});

it('refuse un lien de réinitialisation invalide', function () {
    $user = createAccount('Fanny');

    $this->postJson('/api/auth/reset-password', [
        'token' => 'faux-jeton',
        'email' => $user->email,
        'password' => 'nouveau-mot-de-passe',
        'password_confirmation' => 'nouveau-mot-de-passe',
    ])->assertUnprocessable()->assertJsonPath('errors.email.0', 'Ce lien de réinitialisation est invalide ou a expiré.');
});

it('répond 503 si l’adresse d’expédition est mal réglée, et encore au nouvel essai (pas de faux succès)', function () {
    // Constaté en production : MAIL_FROM_ADDRESS valait un nom de domaine, sans « @ ».
    config(['mail.from.address' => 'example.test']);
    $user = createAccount('Hugo');

    $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertStatus(503);
    $this->postJson('/api/auth/forgot-password', ['email' => $user->email])
        ->assertStatus(503)
        ->assertJsonPath('message', 'L’envoi d’e-mails est indisponible pour le moment. Réessayez plus tard.');
});
