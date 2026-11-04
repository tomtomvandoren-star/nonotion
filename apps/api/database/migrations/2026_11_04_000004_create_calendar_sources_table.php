<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Agendas importés par lien ICS (spec 6.9).
        Schema::create('calendar_sources', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('database_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('color', 16)->default('blue');

            // L'URL est un secret : chiffrée avec Crypt (APP_KEY), jamais renvoyée au client.
            $table->text('url_encrypted');
            $table->string('url_host');
            // Empreinte HMAC de l'URL normalisée : détecte les doublons sans déchiffrer,
            // car le chiffrement produit un texte différent à chaque fois.
            $table->char('url_hash', 64);

            // subscription | one_shot
            $table->string('mode', 16);
            // En-têtes de la dernière réponse, pour If-None-Match / If-Modified-Since.
            $table->string('etag')->nullable();
            $table->string('last_modified')->nullable();

            $table->timestamp('last_sync_at')->nullable();
            // Intervalle croissant entre les essais en cas d'erreur.
            $table->timestamp('next_sync_at')->nullable();
            $table->unsignedSmallInteger('failure_count')->default(0);
            $table->string('status', 16)->default('pending');
            $table->text('error_message')->nullable();
            $table->unsignedInteger('events_count')->default(0);
            $table->timestamps();

            $table->index(['workspace_id', 'url_hash']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('calendar_sources');
    }
};
