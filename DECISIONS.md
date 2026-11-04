# Décisions

Une ligne par décision : la décision, puis sa raison (spec, section 0, règle 4).

## Phase 0

- **Nom : Nonotion.** Remplace `[NOM_APP]` de la spec.
- **Projet dans `C:\dev\nonotion`, hors de OneDrive.** OneDrive remet les dossiers en lecture seule, et PHP sous Windows refuse alors d'écrire dans `bootstrap/cache` et `storage/`.
- **TypeScript 6.0.3, pas 7.x.** typescript-eslint 8.72 ne prend en charge que TypeScript < 6.1.
- **Versions JS épinglées sans `^`.** BlockNote est en 0.x et son format JSON est stocké en base : une mise à jour doit être volontaire.
- **PHP 8.4 en local et sur Infomaniak.** Laravel 13 exige PHP ≥ 8.3 et Pest 5 exige PHP ≥ 8.4.
- **Pest 5 à la place de PHPUnit, tests sur MariaDB (`nonotion_test`), pas sur SQLite.** Collations, index FULLTEXT et contraintes uniques doivent se comporter comme en production.
- **MariaDB locale = celle de XAMPP (10.4.32), compte `root` sans mot de passe.** La table `mysql.db` de XAMPP est corrompue, ce qui empêche de créer un compte dédié. Version à aligner sur celle d'Infomaniak.
- **CI sur MariaDB 10.11, provisoirement.** À remplacer par la version relevée dans le Manager Infomaniak.
- **Identifiants ULID pour toutes les tables, `users` compris** (`ulidMorphs` pour les jetons Sanctum). Spec 1.3.3 ; une seule convention partout.
- **`databases` et `views` ont `created_at`, `updated_at` et `deleted_at`.** `GET /api/sync?since=` doit pouvoir propager les modifications et les suppressions.
- **`calendar_sources` : colonnes ajoutées `url_hash`, `last_modified`, `next_sync_at`, `failure_count`.** Détecter les doublons sans déchiffrer l'URL, envoyer `If-Modified-Since`, espacer les essais après une erreur (spec 6.9).
- **Clés étrangères `pages.database_id` et `pages.calendar_source_id` dans une migration séparée.** `pages` et `databases` se référencent mutuellement.
- **`/api/health` minimal (écriture + lecture en base, date du dernier cron), limité à 30 appels/min.** Il est public et écrit en base à chaque appel.
- **Commande `php artisan nonotion:hosting-check` pour le reste des vérifications.** Versions, extensions, limites PHP et test HTTPS sortant (avec `CURLOPT_RESOLVE`) ne sont visibles qu'en SSH, pas sur une URL publique.
- **Battement du planificateur toutes les minutes (`heartbeat`).** Prouve que la tâche cron du Manager tourne, quelle que soit sa fréquence.
- **Pas de routes « web » Laravel ni de route `/up`.** La SPA sert `/` (`DirectoryIndex index.html`) ; l'API vit sous `/api`.
- **`QUEUE_CONNECTION=sync`.** Pas de worker permanent sur un hébergement mutualisé.
- **En dev, Vite relaie `/api` vers `php artisan serve`.** Même origine qu'en production ; `CORS_ALLOWED_ORIGINS` servira aux WebViews (phases 8 et 9).
- **Routes TanStack Router déclarées en code, sans génération de fichiers.** Moins d'outillage, toutes les routes lisibles dans `src/router.ts`.
- **Jetons de couleur exposés à Tailwind sous les noms `fg`, `fg-muted`, `line`.** Évite les classes ambiguës `text-text` et `border-border` ; les variables CSS gardent les noms de la spec.
- **shadcn/ui initialisé en phase 1, avec le premier composant.** La phase 0 n'affiche aucun composant.
- **PWA (`vite-plugin-pwa`) ajoutée en phase 7.** Un service worker dès la phase 0 compliquerait le débogage des déploiements.
- **Déploiement par `tar` dans `ssh`, pas `rsync`.** rsync n'est pas fourni avec Git for Windows ; tar et ssh le sont.
- **Playwright lance `php artisan serve` et `node …/vite.js` directement.** Les tests e2e marchent même sans pnpm installé globalement.
- **pnpm 12.16.1 via corepack (`packageManager`).** Version identique en local et en CI sans installation globale.
- **Les « agent skills » proposées par des paquets npm (`pnpm approve`) ne sont pas approuvées.** Ce sont des instructions tierces, hors du périmètre du projet.
- **PHP local : `curl.cainfo` pointe sur le bundle de certificats de Git for Windows.** PHP sous Windows n'a pas de magasin de certificats ; sur le serveur Linux, celui du système suffit.
