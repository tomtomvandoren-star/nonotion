<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Une vue porte aussi le workspace de sa base : la même portée d'isolation (VisibleToCurrentUser)
// s'applique alors aux pages, aux bases et aux vues, sans jointure.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('views', function (Blueprint $table) {
            $table->foreignUlid('workspace_id')->after('id')->constrained()->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('views', function (Blueprint $table) {
            $table->dropConstrainedForeignId('workspace_id');
        });
    }
};
