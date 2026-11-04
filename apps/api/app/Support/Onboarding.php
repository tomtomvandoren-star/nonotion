<?php

namespace App\Support;

use App\Models\Page;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Facades\DB;

/** Création d'un compte : l'utilisateur, son workspace et une première page. */
class Onboarding
{
    public static function createAccount(string $name, string $email, string $password): User
    {
        return DB::transaction(function () use ($name, $email, $password) {
            $user = User::create(['name' => $name, 'email' => $email, 'password' => $password]);

            $workspace = Workspace::create(['name' => "Espace de {$name}", 'owner_id' => $user->id]);
            $workspace->members()->attach($user->id, ['role' => 'owner']);

            $content = [
                ['type' => 'paragraph', 'content' => 'Cette page est la vôtre : modifiez-la, déplacez-la ou supprimez-la.'],
                ['type' => 'paragraph', 'content' => 'Créez une page avec « Nouvelle page » dans la barre latérale, ou une sous-page avec le « + » qui apparaît au survol d’une page.'],
                ['type' => 'paragraph', 'content' => 'Glissez les pages dans la barre latérale pour les réorganiser.'],
            ];
            Page::create([
                'workspace_id' => $workspace->id,
                'title' => 'Bienvenue dans Nonotion',
                'icon' => '👋',
                'content' => $content,
                'position' => FractionalIndex::between(null, null),
            ])->forceFill(['search_text' => BlockText::extract($content)])->save();

            return $user;
        });
    }
}
