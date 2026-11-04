<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('databases', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            // La page qui contient la base (en ligne ou pleine page).
            $table->foreignUlid('page_id')->constrained('pages')->cascadeOnDelete();
            $table->string('title')->default('');
            // JSON texte : liste des propriétés [{id, name, type, options...}].
            $table->longText('schema');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('views', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('database_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('position', 64)->collation('utf8mb4_bin');
            // table | board | list | calendar | gallery
            $table->string('type', 16);
            // JSON texte : filtres, tris, regroupement, propriétés visibles… (spec 4.2).
            $table->longText('config');
            $table->timestamps();
            $table->softDeletes();

            $table->index(['database_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('views');
        Schema::dropIfExists('databases');
    }
};
