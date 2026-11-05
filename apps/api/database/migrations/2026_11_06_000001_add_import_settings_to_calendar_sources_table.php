<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('calendar_sources', function (Blueprint $table) {
            // Les propriétés de la base que l'import remplit : {"date": id, "location": id, "url": id}.
            $table->text('property_map')->nullable()->after('mode');
            // Le fuseau de l'appareil qui a ajouté l'agenda : celui des heures « flottantes » (sans fuseau).
            $table->string('time_zone', 64)->nullable()->after('property_map');
        });
    }

    public function down(): void
    {
        Schema::table('calendar_sources', function (Blueprint $table) {
            $table->dropColumn(['property_map', 'time_zone']);
        });
    }
};
