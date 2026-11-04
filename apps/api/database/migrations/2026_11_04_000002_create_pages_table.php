<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pages', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('parent_page_id')->nullable()->constrained('pages')->cascadeOnDelete();
            // Si non NULL, la page est une ligne de cette base. Clé étrangère ajoutée une fois `databases` créée.
            $table->ulid('database_id')->nullable();

            $table->string('title')->default('');
            $table->string('icon', 64)->nullable();
            $table->string('cover_url', 2048)->nullable();

            // Colonnes JSON stockées en texte : on ne les interroge jamais en SQL (spec 1.3.3).
            $table->longText('content')->nullable();
            $table->longText('search_text')->nullable();
            $table->longText('properties')->nullable();

            $table->boolean('is_favorite')->default(false);
            // Clé de fractional indexing : la collation binaire garantit l'ordre des clés.
            $table->string('position', 64)->collation('utf8mb4_bin');
            // Verrouillage optimiste : +1 à chaque sauvegarde, 409 si le client est en retard.
            $table->unsignedInteger('version')->default(1);

            // Événements importés depuis un lien ICS (spec 6.9). Clé étrangère ajoutée plus loin.
            $table->ulid('calendar_source_id')->nullable();
            $table->string('ics_uid')->nullable();
            // '' et non NULL : un index unique MariaDB accepte plusieurs NULL, ce qui créerait des doublons.
            $table->string('ics_recurrence_id', 64)->default('');

            $table->timestamps();
            $table->softDeletes();

            $table->unique(['calendar_source_id', 'ics_uid', 'ics_recurrence_id']);
            $table->index(['workspace_id', 'parent_page_id', 'position']);
            $table->index(['database_id', 'deleted_at']);
            $table->fullText(['title', 'search_text']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pages');
    }
};
