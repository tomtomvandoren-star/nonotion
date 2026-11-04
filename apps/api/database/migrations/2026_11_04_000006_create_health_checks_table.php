<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Dernier passage connu de chaque composant ('web' = /api/health, 'cron' = planificateur).
        Schema::create('health_checks', function (Blueprint $table) {
            $table->string('name', 32)->primary();
            $table->timestamp('checked_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('health_checks');
    }
};
