<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('databases', function (Blueprint $table) {
            // Le lien secret d'abonnement (ICS) : Google Agenda ou le Calendrier Apple y lisent la base.
            $table->string('feed_token', 64)->nullable()->unique()->after('schema');
        });
    }

    public function down(): void
    {
        Schema::table('databases', function (Blueprint $table) {
            $table->dropUnique(['feed_token']);
            $table->dropColumn('feed_token');
        });
    }
};
