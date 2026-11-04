<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// `pages` et `databases` se référencent mutuellement : ces clés étrangères
// ne peuvent être posées qu'une fois les deux tables (et calendar_sources) créées.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pages', function (Blueprint $table) {
            $table->foreign('database_id')->references('id')->on('databases')->cascadeOnDelete();
            // Supprimer un agenda supprime ses événements importés.
            $table->foreign('calendar_source_id')->references('id')->on('calendar_sources')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('pages', function (Blueprint $table) {
            $table->dropForeign(['database_id']);
            $table->dropForeign(['calendar_source_id']);
        });
    }
};
