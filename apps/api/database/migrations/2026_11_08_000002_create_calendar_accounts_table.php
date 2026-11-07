<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Comptes Google et iCloud connectés (spec 6.15).
        Schema::create('calendar_accounts', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            // google | icloud
            $table->string('provider', 16);
            $table->string('account_email');
            // Google : le jeton de rafraîchissement ; iCloud : l'identifiant et le mot de passe pour
            // application. Chiffrés (Crypt, APP_KEY), jamais renvoyés au client ni journalisés.
            $table->text('credentials_encrypted');
            $table->string('status', 16)->default('ok');
            $table->text('error_message')->nullable();
            $table->timestamp('last_sync_at')->nullable();
            $table->timestamps();
            $table->unique(['workspace_id', 'provider', 'account_email']);
        });

        Schema::table('calendar_sources', function (Blueprint $table) {
            // ics (lien, lecture seule) | google | icloud (dans les deux sens).
            $table->string('kind', 16)->default('ics')->after('database_id');
            $table->foreignUlid('account_id')->nullable()->after('kind')
                ->constrained('calendar_accounts')->cascadeOnDelete();
            // L'agenda chez le fournisseur : identifiant Google, ou adresse de la collection CalDAV.
            $table->text('remote_id')->nullable()->after('account_id');
            $table->boolean('writable')->default(false)->after('remote_id');
            // Notifications de Google (spec 6.15) : le canal ouvert, et sa fin.
            $table->string('push_channel_id', 64)->nullable()->after('writable');
            $table->string('push_resource_id')->nullable()->after('push_channel_id');
            $table->timestamp('push_expires_at')->nullable()->after('push_resource_id');
        });

        Schema::table('pages', function (Blueprint $table) {
            // Un événement d'un agenda Google ou iCloud : ce qu'on sait de sa version distante.
            // remote_href : l'identifiant de l'occurrence chez Google, la ressource CalDAV chez Apple.
            $table->text('remote_href')->nullable()->after('ics_recurrence_id');
            $table->string('remote_etag')->nullable()->after('remote_href');
            $table->timestamp('remote_updated_at')->nullable()->after('remote_etag');
            // Le moment où la ligne et l'agenda étaient d'accord : une modification après n'est pas
            // encore envoyée, et une synchronisation ne doit pas l'écraser.
            $table->timestamp('synced_at')->nullable()->after('remote_updated_at');
            // Modifié des deux côtés : la version écartée, gardée pour la page (spec 6.15).
            $table->text('sync_conflict')->nullable()->after('synced_at');
        });
    }

    public function down(): void
    {
        Schema::table('pages', function (Blueprint $table) {
            $table->dropColumn(['remote_href', 'remote_etag', 'remote_updated_at', 'synced_at', 'sync_conflict']);
        });
        Schema::table('calendar_sources', function (Blueprint $table) {
            $table->dropConstrainedForeignId('account_id');
            $table->dropColumn(['kind', 'remote_id', 'writable', 'push_channel_id', 'push_resource_id', 'push_expires_at']);
        });
        Schema::dropIfExists('calendar_accounts');
    }
};
