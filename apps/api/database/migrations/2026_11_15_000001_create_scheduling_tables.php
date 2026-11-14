<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Liens de planification (spec 6.17) : une page publique où un invité réserve un créneau.
        Schema::create('scheduling_links', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            // L'organisateur : ses disponibilités, son agenda.
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            // one_off (plages datées) | recurring (horaires de la semaine)
            $table->string('type', 16);
            $table->string('slug', 64)->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('duration_minutes')->default(30);
            $table->unsignedSmallInteger('slot_step_minutes')->default(30);
            $table->unsignedSmallInteger('buffer_before_minutes')->default(0);
            $table->unsignedSmallInteger('buffer_after_minutes')->default(0);
            // Fuseau IANA de référence : « lundi 9 h » reste « lundi 9 h » après un changement d'heure.
            $table->string('timezone', 64);
            // JSON. Récurrent : [{weekday 1-7 (lundi = 1), start "HH:MM", end "HH:MM"}] dans le fuseau du
            // lien ; ponctuel : [{start, end}] en UTC.
            $table->text('availability');
            // La base de l'Agenda où chaque rendez-vous devient un élément (et part chez Google ou iCloud
            // si elle y est reliée).
            $table->foreignUlid('target_database_id')->nullable()->constrained('databases')->nullOnDelete();
            $table->boolean('avoid_conflicts')->default(true);
            $table->boolean('allow_multiple_bookings')->default(true);
            $table->boolean('single_use')->default(false);
            $table->unsignedInteger('min_notice_minutes')->default(0);
            $table->unsignedSmallInteger('max_advance_days')->default(60);
            $table->string('location')->nullable();
            $table->string('video_url', 2048)->nullable();
            $table->string('phone', 64)->nullable();
            $table->timestamp('expires_at')->nullable();
            // active | disabled | consumed (usage unique déjà réservé). « Expiré » se déduit d'expires_at.
            $table->string('status', 16)->default('active');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('bookings', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('link_id')->constrained('scheduling_links')->cascadeOnDelete();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            // L'élément créé dans l'agenda de l'organisateur.
            $table->foreignUlid('page_id')->nullable()->constrained('pages')->nullOnDelete();
            $table->string('invitee_name');
            $table->string('invitee_email');
            $table->string('invitee_timezone', 64);
            $table->text('note')->nullable();
            // En UTC, comme toutes les dates (spec 4.1).
            $table->dateTime('start_at');
            $table->dateTime('end_at');
            // confirmed | cancelled
            $table->string('status', 16)->default('confirmed');
            // Le jeton de « Replanifier ou annuler » : haché, renouvelé à chaque usage.
            $table->string('manage_token_hash', 64)->unique();
            // Le numéro de version de l'invitation (.ics) : +1 à chaque changement.
            $table->unsignedInteger('sequence')->default(0);
            $table->text('cancel_reason')->nullable();
            $table->string('cancelled_by', 16)->nullable();
            $table->timestamps();
            $table->index(['user_id', 'status', 'start_at']);
        });

        // Qui peut voir mes disponibilités (blocs « Occupé » seulement) : par adresse e-mail, que le
        // compte existe déjà ou pas encore.
        Schema::create('freebusy_shares', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('owner_id')->constrained('users')->cascadeOnDelete();
            $table->string('viewer_email');
            $table->timestamps();
            $table->unique(['owner_id', 'viewer_email']);
            $table->index('viewer_email');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('freebusy_shares');
        Schema::dropIfExists('bookings');
        Schema::dropIfExists('scheduling_links');
    }
};
