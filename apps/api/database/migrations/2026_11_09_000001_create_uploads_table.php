<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Les fichiers envoyés dans les pages (images, vidéos, sons, documents), rangés dans
        // public/uploads (spec 1.4) : à qui ils appartiennent, et ce qu'ils sont.
        Schema::create('uploads', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('page_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUlid('user_id')->nullable()->constrained()->nullOnDelete();
            // Le nom donné par l'utilisateur ; le fichier est rangé sous un nom sûr (path).
            $table->string('name');
            $table->string('path');
            $table->string('mime', 127);
            $table->unsignedBigInteger('size');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('uploads');
    }
};
