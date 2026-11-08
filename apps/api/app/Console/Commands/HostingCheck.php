<?php

namespace App\Console\Commands;

use App\Support\Heartbeat;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Vérifie en une commande ce que la phase 0 doit confirmer sur l'hébergement (spec 1.8) :
 * PHP, extensions, limites, MariaDB, droits d'écriture, cron et connexions HTTPS sortantes.
 * À lancer en SSH sur le serveur : php artisan nonotion:hosting-check
 */
#[Signature('nonotion:hosting-check {--skip-network : Ne pas tester les connexions sortantes}')]
#[Description("Vérifie que l'hébergement a tout ce qu'il faut pour Nonotion")]
class HostingCheck extends Command
{
    private const MIN_PHP = '8.3.0';

    private const REQUIRED_EXTENSIONS = [
        'ctype', 'curl', 'dom', 'fileinfo', 'filter', 'hash', 'mbstring',
        'openssl', 'pdo_mysql', 'session', 'tokenizer', 'xml',
    ];

    /** Fonctions dont l'import ICS a besoin (résolution DNS pour la protection SSRF, cURL). */
    private const REQUIRED_FUNCTIONS = ['curl_exec', 'dns_get_record'];

    /** Flux ICS public utilisé comme cible de test (jours fériés belges, Google Agenda). */
    private const NETWORK_TEST_URL = 'https://calendar.google.com/calendar/ical/fr.be%23holiday%40group.v.calendar.google.com/public/basic.ics';

    private bool $failed = false;

    public function handle(): int
    {
        $this->components->info('PHP');
        $this->checkPhp();

        $this->components->info('Base de données');
        $this->checkDatabase();

        $this->components->info('Fichiers et planificateur');
        $this->checkWritableDirectories();
        $this->checkCron();

        if (! $this->option('skip-network')) {
            $this->components->info('Connexions sortantes (import ICS)');
            $this->checkOutboundHttps();
        }

        if ($this->failed) {
            $this->components->error('Au moins un point bloquant : voir les lignes ÉCHEC ci-dessus.');

            return self::FAILURE;
        }

        $this->components->success('Hébergement prêt pour Nonotion.');

        return self::SUCCESS;
    }

    private function checkPhp(): void
    {
        $this->report('Version de PHP', PHP_VERSION, version_compare(PHP_VERSION, self::MIN_PHP, '>='));

        $missing = array_values(array_filter(self::REQUIRED_EXTENSIONS, fn (string $ext) => ! extension_loaded($ext)));
        $this->report('Extensions requises', $missing === [] ? 'toutes présentes' : 'manquantes : '.implode(', ', $missing), $missing === []);

        $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
        $unavailable = array_values(array_filter(
            self::REQUIRED_FUNCTIONS,
            fn (string $fn) => ! function_exists($fn) || in_array($fn, $disabled, true),
        ));
        $this->report('Fonctions cURL et DNS', $unavailable === [] ? 'disponibles' : 'désactivées : '.implode(', ', $unavailable), $unavailable === []);

        foreach (['max_execution_time', 'memory_limit', 'upload_max_filesize', 'post_max_size'] as $setting) {
            $this->report($setting, (string) ini_get($setting));
        }

        $this->report('APP_KEY définie (à sauvegarder !)', config('app.key') ? 'oui' : 'non', (bool) config('app.key'));

        if (app()->isProduction() && config('app.debug')) {
            $this->report('APP_DEBUG', 'activé en production', false);
        }
    }

    private function checkDatabase(): void
    {
        try {
            $version = (string) DB::scalar('SELECT VERSION()');
            $this->report('Serveur', $version, true);
        } catch (Throwable $e) {
            $this->report('Connexion', 'impossible ('.$e::class.')', false);

            return;
        }

        $hasBinaryCollation = DB::select("SHOW COLLATION WHERE Collation = 'utf8mb4_bin'") !== [];
        $this->report('Collation utf8mb4_bin', $hasBinaryCollation ? 'disponible' : 'absente', $hasBinaryCollation);

        try {
            $written = Heartbeat::record(Heartbeat::WEB);
            $ok = Heartbeat::lastSeen(Heartbeat::WEB)?->equalTo($written) ?? false;
            $this->report('Écriture puis lecture', $ok ? 'ok' : 'valeur relue différente', $ok);
        } catch (Throwable $e) {
            $this->report('Écriture puis lecture', 'échec : lancer « php artisan migrate --force » ('.$e::class.')', false);

            return;
        }

        $hasFullText = DB::select("SHOW INDEX FROM pages WHERE Index_type = 'FULLTEXT'") !== [];
        $this->report('Index FULLTEXT sur pages', $hasFullText ? 'présent' : 'absent', $hasFullText);
    }

    private function checkWritableDirectories(): void
    {
        // public/uploads : les fichiers envoyés dans les pages (blocs Média).
        foreach ([storage_path(), base_path('bootstrap/cache'), public_path('uploads')] as $directory) {
            $this->report('Écriture dans '.basename($directory), is_writable($directory) ? 'ok' : 'refusée', is_writable($directory));
        }
    }

    private function checkCron(): void
    {
        try {
            $lastRun = Heartbeat::lastSeen(Heartbeat::CRON);
        } catch (Throwable) {
            $lastRun = null;
        }

        // Pas un échec : la tâche se crée dans le Manager après le premier déploiement.
        $this->report('Dernier passage du cron', $lastRun === null
            ? 'jamais (programmer GET /api/cron dans le Planificateur de tâches du Manager)'
            : $lastRun->diffForHumans());

        $this->report('Mot de passe de /api/cron', config('nonotion.cron.password') ? 'défini' : 'absent (URL désactivée)');

        // Pas un échec s'il manque : sans SMTP, seule la réinitialisation du mot de passe par e-mail est
        // indisponible. Mais une adresse d'expédition qui n'en est pas une fait échouer chaque envoi.
        $mailer = (string) config('mail.default');
        $smtpReady = $mailer !== 'smtp' || (config('mail.mailers.smtp.username') && config('mail.from.address'));
        $this->report('E-mails (réinitialisation du mot de passe)', $smtpReady
            ? "envoi par {$mailer}"
            : 'SMTP incomplet : remplir MAIL_USERNAME, MAIL_PASSWORD et MAIL_FROM_ADDRESS');
        $from = config('mail.from.address');
        if ($mailer === 'smtp' && $from) {
            $valid = filter_var($from, FILTER_VALIDATE_EMAIL) !== false;
            $this->report('Adresse d’expédition (MAIL_FROM_ADDRESS)', $valid
                ? (string) $from
                : "« {$from} » n’est pas une adresse complète : mettre celle de la boîte, par exemple ".config('mail.mailers.smtp.username'), $valid);
        }
    }

    private function checkOutboundHttps(): void
    {
        $host = (string) parse_url(self::NETWORK_TEST_URL, PHP_URL_HOST);

        $records = @dns_get_record($host, DNS_A) ?: [];
        $ip = $records[0]['ip'] ?? null;
        $this->report('Résolution DNS de '.$host, $ip ?? 'échec', $ip !== null);

        if ($ip === null) {
            return;
        }

        // CURLOPT_RESOLVE force la connexion sur l'IP validée : c'est le mécanisme de la protection SSRF (spec 6.9).
        $curl = curl_init(self::NETWORK_TEST_URL);
        curl_setopt_array($curl, [
            CURLOPT_RESOLVE => ["{$host}:443:{$ip}"],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);

        $isCalendar = is_string($body) && str_starts_with(ltrim($body), 'BEGIN:VCALENDAR');
        $detail = $isCalendar
            ? "HTTP {$status}, flux iCalendar reçu (".strlen($body).' octets)'
            : ($error !== '' ? $error : "HTTP {$status}, réponse inattendue");

        $this->report('HTTPS sortant avec CURLOPT_RESOLVE', $detail, $isCalendar);
    }

    /** Affiche une ligne ; $ok = null pour une simple information. */
    private function report(string $label, string $value, ?bool $ok = null): void
    {
        $prefix = match ($ok) {
            true => '<fg=green>OK</>',
            false => '<fg=red>ÉCHEC</>',
            null => '<fg=gray>INFO</>',
        };

        if ($ok === false) {
            $this->failed = true;
        }

        $this->components->twoColumnDetail("{$prefix} {$label}", $value);
    }
}
