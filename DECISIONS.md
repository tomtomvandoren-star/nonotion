# Décisions

Une ligne par décision : la décision, puis sa raison (spec, section 0, règle 4).

## Phase 0

- **Nom : Nonotion.** Remplace `[NOM_APP]` de la spec.
- **Projet dans `C:\dev\nonotion`, hors de OneDrive.** OneDrive remet les dossiers en lecture seule, et PHP sous Windows refuse alors d'écrire dans `bootstrap/cache` et `storage/`.
- **TypeScript 6.0.3, pas 7.x.** typescript-eslint 8.72 ne prend en charge que TypeScript < 6.1.
- **Versions JS épinglées sans `^`.** BlockNote est en 0.x et son format JSON est stocké en base : une mise à jour doit être volontaire.
- **PHP 8.5 sur Infomaniak et en CI, 8.4 en local.** Version choisie dans le Manager ; Laravel 13 exige PHP ≥ 8.3 et Pest 5 PHP ≥ 8.4, donc les deux conviennent. Passer le poste en 8.5 si un écart apparaît.
- **Sur le serveur, artisan, Composer et le cron utilisent `/opt/php8.5/bin/php` et `/opt/php8.5/bin/composer`.** Le `php` par défaut en SSH est en 8.4, pas la version du site.
- **Pest 5 à la place de PHPUnit, tests sur MariaDB (`nonotion_test`), pas sur SQLite.** Collations, index FULLTEXT et contraintes uniques doivent se comporter comme en production.
- **MariaDB locale = celle de XAMPP (10.4.32), compte `root` sans mot de passe.** La table `mysql.db` de XAMPP est corrompue, ce qui empêche de créer un compte dédié. Plus ancienne qu'Infomaniak (10.11.19) : la CI fait foi.
- **CI sur MariaDB 10.11.** Même branche que l'hébergement Infomaniak (10.11.19).
- **Identifiants ULID pour toutes les tables, `users` compris** (`ulidMorphs` pour les jetons Sanctum). Spec 1.3.3 ; une seule convention partout.
- **`databases` et `views` ont `created_at`, `updated_at` et `deleted_at`.** `GET /api/sync?since=` doit pouvoir propager les modifications et les suppressions.
- **`calendar_sources` : colonnes ajoutées `url_hash`, `last_modified`, `next_sync_at`, `failure_count`.** Détecter les doublons sans déchiffrer l'URL, envoyer `If-Modified-Since`, espacer les essais après une erreur (spec 6.9).
- **Clés étrangères `pages.database_id` et `pages.calendar_source_id` dans une migration séparée.** `pages` et `databases` se référencent mutuellement.
- **`/api/health` minimal (écriture + lecture en base, date du dernier cron), limité à 30 appels/min.** Il est public et écrit en base à chaque appel.
- **Commande `php artisan nonotion:hosting-check` pour le reste des vérifications.** Versions, extensions, limites PHP et test HTTPS sortant (avec `CURLOPT_RESOLVE`) ne sont visibles qu'en SSH, pas sur une URL publique.
- **Battement du planificateur toutes les minutes (`heartbeat`).** Prouve que la tâche cron du Manager tourne, quelle que soit sa fréquence.
- **Le planificateur est lancé par `GET /api/cron` (HTTP Basic, `CRON_USER` / `CRON_PASSWORD`), pas par `php artisan schedule:run`.** Écart avec la spec 1.8, validé par l'utilisateur : l'hébergement mutualisé refuse `crontab` et son Planificateur de tâches n'appelle qu'une URL, au plus toutes les 15 minutes. Sans mot de passe, l'URL répond 404.
- **Tâches planifiées en `everyMinute()` qui décident elles-mêmes si elles ont du travail, et uniquement `Schedule::call()` / `Schedule::job()`.** Le webcron passe à des minutes quelconques (un `everyThirtyMinutes()` pourrait ne jamais tomber juste) et tourne dans une requête web, où `->command()` ne peut pas lancer de PHP en ligne de commande. La resynchronisation ICS s'appuiera sur `next_sync_at`, plus la synchronisation à l'ouverture (spec 1.7).
- **`deploy.sh` génère `CRON_PASSWORD` sur le serveur s'il manque.** Comme l'`APP_KEY`, il ne transite jamais par le poste de développement.
- **Pas de routes « web » Laravel ni de route `/up`.** La SPA sert `/` (`DirectoryIndex index.html`) ; l'API vit sous `/api`.
- **`QUEUE_CONNECTION=sync`.** Pas de worker permanent sur un hébergement mutualisé.
- **En dev, Vite relaie `/api` vers `php artisan serve`.** Même origine qu'en production ; `CORS_ALLOWED_ORIGINS` servira aux WebViews (phases 8 et 9).
- **Routes TanStack Router déclarées en code, sans génération de fichiers.** Moins d'outillage, toutes les routes lisibles dans `src/router.ts`.
- **Palette Nonotion (pêche #F7D9BC, beige #CDB39C, taupe #AB9682, sauge #657868) à la place des couleurs de la spec 7.** Demande de l'utilisateur. Accent = sauge (#8A9E8C en sombre) ; barre latérale, bordures et survol = teintes de pêche et de beige ; texte secondaire = taupe (assombri en clair à #78695B). Les teintes dérivées gardent un contraste AA. La sélection de bloc prendra l'accent translucide au lieu du bleu.
- **Jetons de couleur exposés à Tailwind sous les noms `fg`, `fg-muted`, `line`.** Évite les classes ambiguës `text-text` et `border-border` ; les variables CSS gardent les noms de la spec.
- **shadcn/ui initialisé en phase 1, avec le premier composant.** La phase 0 n'affiche aucun composant.
- **PWA (`vite-plugin-pwa`) ajoutée en phase 7.** Un service worker dès la phase 0 compliquerait le débogage des déploiements.
- **Déploiement par `tar` dans `ssh`, pas `rsync`.** rsync n'est pas fourni avec Git for Windows ; tar et ssh le sont.
- **Clé SSH dédiée `~/.ssh/nonotion_deploy`, sans phrase de passe, réglages dans `deploy.env` (non versionné).** Le script tourne sans saisie ; la clé ne sert qu'à ce déploiement et se révoque en la retirant de `~/.ssh/authorized_keys` sur le serveur.
- **`deploy.sh` vérifie que la racine web pointe sur `public/` avant d'envoyer le code.** Sinon le code Laravel et le `.env` seraient lisibles sur internet.
- **Au premier déploiement, `deploy.sh` crée le `.env` (adresse du site, `APP_KEY` générée sur le serveur) puis s'arrête.** Les identifiants de la base sont saisis à la main sur le serveur et ne passent jamais par le script.
- **Playwright lance `php artisan serve` et `node …/vite.js` directement.** Les tests e2e marchent même sans pnpm installé globalement.
- **pnpm 12.16.1 via corepack (`packageManager`).** Version identique en local et en CI sans installation globale.
- **Les « agent skills » proposées par des paquets npm (`pnpm approve`) ne sont pas approuvées.** Ce sont des instructions tierces, hors du périmètre du projet.
- **PHP local : `curl.cainfo` pointe sur le bundle de certificats de Git for Windows.** PHP sous Windows n'a pas de magasin de certificats ; sur le serveur Linux, celui du système suffit.
- **Limiteur de requêtes (`throttle`) sur le cache fichier (`cache.limiter`), pas sur la base.** Sinon `/api/health` répond 500 au lieu de 503 quand MariaDB est injoignable (constaté au premier déploiement), et chaque requête coûterait une écriture SQL.
