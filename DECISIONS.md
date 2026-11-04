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
- **Webcron toutes les heures, aux heures fixes.** C'est la fréquence la plus courte que propose l'abonnement (la spec visait 30 minutes). Les agendas ICS en abonnement resteront frais grâce à la synchronisation à l'ouverture (plus de 15 minutes sans mise à jour) et au bouton « Resynchroniser » ; le cron n'est qu'un complément (spec 1.7).
- **`deploy.sh` génère `CRON_PASSWORD` sur le serveur s'il manque.** Comme l'`APP_KEY`, il ne transite jamais par le poste de développement.
- **Pas de routes « web » Laravel ni de route `/up`.** La SPA sert `/` (`DirectoryIndex index.html`) ; l'API vit sous `/api`.
- **`QUEUE_CONNECTION=sync`.** Pas de worker permanent sur un hébergement mutualisé.
- **En dev, Vite relaie `/api` vers `php artisan serve`.** Même origine qu'en production ; `CORS_ALLOWED_ORIGINS` servira aux WebViews (phases 8 et 9).
- **Routes TanStack Router déclarées en code, sans génération de fichiers.** Moins d'outillage, toutes les routes lisibles dans `src/router.ts`.
- **Palette Nonotion (pêche #F7D9BC, beige #CDB39C, taupe #AB9682, sauge #657868) à la place des couleurs de la spec 7.** Demande de l'utilisateur. Accent = sauge (#8A9E8C en sombre) ; barre latérale, bordures et survol = teintes de pêche et de beige ; texte secondaire = taupe (assombri en clair à #78695B). Les teintes dérivées gardent un contraste AA. La sélection de bloc prendra l'accent translucide au lieu du bleu.
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

## Phase 1

- **shadcn/ui 4 sur la base Radix (style radix-nova), couleurs branchées sur la palette Nonotion.** Les noms Tailwind suivent les conventions shadcn ; chez shadcn « accent » est le fond de survol, donc l'accent sauge de la spec s'appelle `primary`. Police Geist retirée (spec : system-ui / Inter), `next-themes` retiré (le thème suit le système jusqu'à la phase 7).
- **Thème sombre par `prefers-color-scheme`, ou forcé par `data-theme` sur `<html>`**, et non par une classe `.dark`. Comme la spec 7 le demande ; la bascule manuelle arrive en phase 7.
- **Workspace courant = le premier de l'utilisateur ; routes `/api/workspaces/{id}/pages`.** Un seul workspace tant que le partage n'existe pas (phase 10), mais l'API est déjà prête pour plusieurs.
- **Inscription : le premier compte est toujours accepté, les suivants seulement si `REGISTRATION_OPEN=true`.** Usage personnel d'abord (spec 2) : sur le site public, personne d'autre ne peut s'inscrire une fois le compte créé.
- **Limite d'inscriptions (10/min par IP) désactivée en local et dans les tests.** Les tests de bout en bout créent un compte par scénario.
- **Isolation : une portée globale renvoie 404 pour les données d'un autre workspace, les policies vérifient en plus.** Une page d'autrui « n'existe pas » : on ne confirme même pas son identifiant.
- **L'arbre de la barre latérale est chargé en entier (métadonnées seulement), sans pagination.** Quelques centaines de pages personnelles tiennent en une requête légère ; le contenu des pages n'est chargé qu'à leur ouverture (spec 8).
- **Synchronisation entre appareils en phase 1 : l'arbre est rechargé au retour sur l'onglet et toutes les 60 s.** `GET /api/sync?since=` arrivera quand il y aura plus que l'arbre à synchroniser.
- **Les positions sont calculées par le client (fractional-indexing) ; le serveur les valide et sait aussi en produire (`FractionalIndex`, portage PHP vérifié sur les mêmes valeurs).** Le serveur en a besoin pour dupliquer, restaurer et, plus tard, importer des événements ICS.
- **Glisser-déposer : le milieu de la ligne (50 %) en fait une sous-page, les bords (25 % en haut et en bas) une sœur.** C'est ce que décrit la spec 6.1 (« dépôt sur le milieu d'une ligne = devenir enfant ; entre deux lignes = frère »), qui parle aussi de « position horizontale » : la règle verticale, plus explicite, a été retenue. Déposer sous une page dépliée la place en tête de ses sous-pages.
- **Le dépôt est calculé à partir de la position réelle du pointeur, et non de la ligne survolée selon dnd-kit.** dnd-kit met cette ligne à jour au rendu suivant : un lâcher rapide (constaté sous WebKit) visait encore une ligne dépassée.
- **Le lien de chaque ligne a `draggable={false}`.** Sinon WebKit (Safari, vues web macOS et iOS) lance le glisser natif du lien à la place de dnd-kit.
- **Alternative au glisser-déposer : « Déplacer vers… » dans le menu ⋯, et le glisser au clavier (Espace, flèches, Espace).** P7 et spec 1.6.7.
- **Suppression = la page et ses sous-pages vont ensemble à la corbeille, avec la même date ; la restauration les ramène ensemble.** Une sous-page restaurée seule alors que sa parente est encore à la corbeille revient à la racine.
- **Pas de bouton « Ajouter un commentaire », de « Partager », de « Boîte de réception », de « Templates » ni d'« Importer » pour l'instant.** Ces fonctions arrivent plus tard (phases 3, 6 et 10) ; afficher des boutons inactifs irait contre la sobriété (P8).
- **Corps de page provisoire : une zone de texte, enregistrée au format BlockNote (un paragraphe par ligne).** Il fallait un corps pour le critère « Entrée dans le titre place le curseur dans le corps » ; l'éditeur de blocs de la phase 2 reprendra ces pages telles quelles.
- **Le contenu est enregistré avec la version lue (409 si elle a changé) ; les envois partent l'un après l'autre.** Deux envois rapprochés avec la même version se gêneraient (le second recevrait un 409 à tort).
- **Couvertures : six dégradés de la palette (`preset:…`) ou une image par lien https.** L'envoi d'images (`uploads/`) n'est pas demandé en phase 1.
- **Préférences d'affichage (largeur et état de la barre latérale, pages dépliées) gardées sur l'appareil.** La règle 1.6.10 vise les données ; ces réglages appartiennent à chaque écran, comme la taille d'une fenêtre.
- **Ctrl+N crée une page, mais certains navigateurs le gardent pour ouvrir une fenêtre.** Il marchera dans l'application de bureau ; sur le web, « Nouvelle page » reste à un clic.
- **Le contenu des pages échappe aux middlewares `TrimStrings` et `ConvertEmptyStringsToNull`.** Sinon les espaces en bord de texte disparaissent (« Deuxième » + « ligne » devenait « Deuxièmeligne »).
- **Mot de passe oublié : 503 et message clair si l'envoi d'e-mails échoue.** Plutôt qu'une erreur 500 opaque ; la réponse reste la même que le compte existe ou non.
- **Tests de bout en bout un par un en local, en parallèle en CI.** Sous Windows, le serveur de développement PHP ne traite qu'une requête à la fois ; sous Linux (CI), il a 4 processus.
