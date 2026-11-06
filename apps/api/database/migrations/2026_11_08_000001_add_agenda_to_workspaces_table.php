<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workspaces', function (Blueprint $table) {
            // La page « Agenda » de l'espace (spec 6.15), en JSON : les bases affichées et leurs
            // couleurs, les agendas masqués, la base des nouveaux éléments.
            $table->text('agenda')->nullable()->after('owner_id');
        });
    }

    public function down(): void
    {
        Schema::table('workspaces', function (Blueprint $table) {
            $table->dropColumn('agenda');
        });
    }
};
