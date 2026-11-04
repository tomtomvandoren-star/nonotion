<?php

namespace Database\Seeders;

use App\Models\Page;
use App\Models\User;
use App\Support\FractionalIndex;
use App\Support\Onboarding;
use Illuminate\Database\Seeder;

/**
 * Données de démonstration (spec 8), pour le développement local uniquement :
 * php artisan db:seed — compte demo@nonotion.test / nonotion-demo.
 * La base de tâches et le fichier ICS d'exemple viendront avec les phases 4 et 6.
 */
class DatabaseSeeder extends Seeder
{
    public const DEMO_EMAIL = 'demo@nonotion.test';

    public const DEMO_PASSWORD = 'nonotion-demo';

    public function run(): void
    {
        if (app()->isProduction()) {
            $this->command->warn('Pas de données de démonstration en production.');

            return;
        }
        if (User::where('email', self::DEMO_EMAIL)->exists()) {
            $this->command->info('Le compte de démonstration existe déjà.');

            return;
        }

        $user = Onboarding::createAccount('Démo', self::DEMO_EMAIL, self::DEMO_PASSWORD);
        $workspaceId = $user->workspaces()->withoutGlobalScopes()->value('workspaces.id');

        // La page de bienvenue occupe déjà « a0 » : les suivantes viennent après.
        $position = FractionalIndex::between(null, null);
        $add = function (string $title, ?string $icon, ?string $parentId = null) use ($workspaceId, &$position) {
            $position = FractionalIndex::between($position, null);

            return Page::create([
                'workspace_id' => $workspaceId,
                'parent_page_id' => $parentId,
                'title' => $title,
                'icon' => $icon,
                'position' => $position,
            ])->id;
        };

        $studies = $add('Études', '🎓');
        $courses = $add('Cours', '📚', $studies);
        $add('Mathématiques', '📐', $courses);
        $add('Projets', '🚀', $studies);
        $add('Idées', '💡');
        $add('Voyages', '✈️');
    }
}
