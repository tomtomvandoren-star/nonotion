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

## Phase 2

- **BlockNote 0.57.0 (`@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`), licence MPL-2.0, aucun paquet `@blocknote/xl-*`.** La version shadcn reprend les couleurs et composants du design system ; Tailwind génère ses classes (`@source`).
- **L'éditeur est chargé à la demande, à l'ouverture de la première page.** BlockNote pèse environ 1 Mo : le reste de l'application (connexion, barre latérale, accueil) n'a pas à l'attendre.
- **Blocs proposés : texte, titres 1 à 3, listes à puces et numérotées, to-do, liste dépliable, citation, séparateur, encadré, bloc de code.** C'est la liste de la phase 2 (spec 9). Image, fichier et tableau sont retirés du schéma tant que l'envoi de fichiers n'existe pas : un bloc qui ne marche pas n'a rien à faire dans le menu.
- **Trois niveaux de titre, comme Notion.** Un titre de niveau 4 à 6 reçu (autre version) s'affiche en titre 3.
- **L'encadré (callout) est un bloc maison (`createReactBlockSpec`), pas un paquet XL.** Émoji modifiable (même sélecteur que l'icône de page), fond pêche par défaut, couleur du menu du bloc sinon.
- **Menu « / » : groupes Basique et Avancé ; Médias et Bases de données arrivent avec leurs phases.** Recherche dans le titre et dans des mots-clés français et anglais, sans tenir compte des accents ni des tirets ; dans un groupe, un titre qui commence par la saisie passe devant. Le raccourci Markdown de chaque bloc est affiché à droite, pour qu'on l'apprenne en passant.
- **« / » n'ouvre le menu qu'en début de ligne ou après un espace.** Comme l'écrit la spec 6.3a ; dans « 1/2 » ou une adresse, c'est un caractère normal.
- **« > » crée une liste dépliable et « " » une citation, comme dans Notion (spec 6.3b).** BlockNote fait de « > » une citation : notre règle passe avant la sienne.
- **Après « --- », le curseur passe sur la ligne suivante.** BlockNote laissait le séparateur sélectionné : la suite de la frappe se perdait.
- **Menu de la poignée ⠿ : Supprimer, Dupliquer, Transformer en…, Couleur.** « Commentaire » viendra avec les commentaires (phase 10), comme dans la barre flottante, qui n'a pas non plus « Mention » : mentionner une page ou une personne est une fonction à part, pas encore prévue.
- **Pas d'alignement du texte ni de boutons d'indentation dans la barre flottante.** Notion n'en a pas ; Tab et Maj+Tab indentent.
- **Bloc de code sans coloration syntaxique.** Elle demande `@blocknote/code-block` et Shiki (plusieurs centaines de Ko) ; à ajouter si le besoin se fait sentir.
- **Le texte de l'éditeur s'aligne sur le titre ; le « + » et la poignée vivent dans une marge de 56 px de chaque côté de la colonne de 700 px.** Spec 6.3c : la marge gauche est la zone des outils.
- **Le document est lu au moment de l'envoi (500 ms après la dernière modification), et un document identique au dernier envoyé ne part pas.** Rien n'est recopié à chaque lettre, et ouvrir une page n'écrit jamais sur le serveur (sinon chaque ouverture créerait une version).
- **Une version plus récente reçue du serveur remplace le contenu affiché seulement si rien n'attend d'être envoyé et que personne n'écrit dans la page.** Sinon l'envoi suivant reçoit un 409 et la question « Recharger ou écraser » est posée.
- **Un bloc d'un type inconnu s'ouvre comme un paragraphe qui garde son texte.** Une page ne doit jamais devenir illisible parce qu'elle contient un bloc d'une version future.
- **Le serveur vérifie la forme du document (chaque bloc a un type, des enfants en tableau), pas son détail.** Le détail appartient à l'éditeur ; les liens sont neutralisés à l'affichage par BlockNote (`javascript:` et autres protocoles non autorisés donnent un lien vide).
- **Flèche bas en fin de titre descend dans le corps ; flèche haut au début du corps remonte au titre.** Le titre et le corps se parcourent comme un seul document.
- **Les tests du glisser-déposer de blocs attendent 700 ms avant de prendre la poignée.** L'historique d'annulation regroupe les changements faits à moins de 500 ms d'intervalle ; un utilisateur met plus longtemps à prendre la souris, et Ctrl+Z annule alors le seul déplacement.
- **Test précoce natif (spec 9) : un « bac à sable » de l'éditeur, sans compte ni serveur (`sandbox.html`).** C'est le « build minimal contenant seulement l'éditeur » demandé ; il évite d'avoir à régler dès maintenant CORS et l'authentification des vues web natives (phases 8 et 9).
- **APK Android et AppImage/.deb Linux construits par GitHub Actions (workflow « Builds natifs de test »).** La machine de développement n'a ni Java, ni SDK Android, ni Rust, et il n'y a pas de PC Linux : la CI construit les deux et vérifie que l'application Linux démarre sans planter ; l'APK s'installe sur le téléphone.
- **Projets natifs générés en CI (`cap add android`, icônes Tauri depuis `app-icon.svg`), pas encore versionnés ; pas de `Cargo.lock` pour l'instant.** Ils le seront en phases 8 et 9, quand l'application complète sera emballée et signée.
- **Capacitor 8.6.0 (MIT) et Tauri 2 (CLI 2.12.4, Apache-2.0 ou MIT) ; identifiant d'application `be.thomasvandoren.nonotion`.** Le domaine du site, à l'envers, comme le veut la convention.
- **Pas de capture de l'application Linux en CI.** Dans l'écran virtuel (Xvfb), seule la fenêtre cachée de GTK apparaît, sans message d'erreur, même en rendu logiciel et avec le bac à sable WebKitGTK autorisé. Le moteur WebKit est couvert par les tests de bout en bout sous Linux ; l'essai visuel de WebKitGTK se fera sur une vraie machine Linux (ou une VM) en phase 8.
- **Raccourcis Markdown au clavier d'un téléphone : un filet de sécurité qui regarde le document plutôt que la frappe.** Sur Android, les claviers regroupent la frappe en mots validés d'un coup (« composition ») et BlockNote ne voyait jamais « # » suivi d'une espace : rien ne se transformait (constaté sur le téléphone de test). Après une frappe de quelques caractères, ou à la validation d'un mot, une ligne qui commence par un raccourci est convertie, y compris « # Titre » arrivé d'un coup. Au clavier physique, BlockNote a déjà converti : le filet ne fait rien.
- **Annuler et Rétablir sont des boutons de la barre collée au-dessus du clavier, sur téléphone.** Il n'y a pas de Ctrl+Z sur un téléphone (spec 6.14 : chaque action a un équivalent tactile).
- **La poignée et le « + » sont centrés sur la première ligne réelle du bloc, mesurée à l'affichage.** BlockNote les décalait d'une valeur fixe calculée pour ses propres tailles de titre (48 px pour un titre 1), trop bas pour les nôtres.
- **Sur téléphone (moins de 768 px), la marge gauche fait 40 px et ne loge que la poignée ⠿.** Avec la marge de 16 px, la poignée sortait de l'écran ; le « + » est retiré là, Entrée et « / » suffisent pour insérer un bloc.

## Phase 3

- **Une ligne de base est une page dont `database_id` est rempli, rangée sous la page qui contient la base.** Elle part à la corbeille, revient et se déplace avec sa page sans code à part ; l'arbre de la barre latérale ne la montre pas. Une ligne supprimée seule figure dans la corbeille et revient dans sa base.
- **Le Titre est une propriété du schéma (identifiant `title`), dont la valeur est le titre de la page.** On peut le renommer (« Nom », « Tâche »…) mais pas le masquer, le supprimer ni changer son type : c'est lui qui ouvre la ligne.
- **Les identifiants des propriétés et des options sont courts et créés par le client ; le serveur les vérifie.** Une option créée en tapant dans une cellule s'affiche tout de suite, sans attendre un aller-retour pour son identifiant.
- **Valeurs validées à l'identique par le front (Zod) et l'API (PHP), sur un même fichier d'exemples (`packages/shared/fixtures/property-values.json`).** La « règle d'or » de la spec 4.3 : une valeur invalide est refusée par l'API, pas seulement par l'interface.
- **Dates : « AAAA-MM-JJ » pour une journée entière, un instant ISO 8601 en UTC quand l'heure compte ; une fin facultative du même genre.** Affichage dans le fuseau de l'appareil ; le fuseau d'origine (événements importés) viendra avec le calendrier et l'ICS (phases 5 et 6).
- **Changer le type d'une propriété convertit les valeurs qui ont un sens (« 12,5 » devient 12,5) ; un texte qui devient une sélection donne ses options.** Comme Notion, plutôt que d'effacer les valeurs.
- **Toute la base (schéma, vues, lignes) arrive en une requête ; filtres, tris et regroupement sont calculés dans le navigateur.** Le MVP de la spec 6.6. La pagination et la virtualisation des longs tableaux (spec 8, plus de 200 lignes) viendront quand une base le demandera.
- **Vues proposées : Tableau, Liste et Galerie.** Le Board et le Calendrier arrivent avec leurs phases (4 et 5) ; le menu « + » ne montre que ce qui marche.
- **« Nouveau » sans sa flèche ▾ des modèles pour l'instant.** Il n'y a pas encore de modèles de lignes ; un menu vide irait contre P8.
- **« Nouveau » crée l'élément en tête et l'ouvre aussitôt, le curseur dans son titre ; la ligne « + Nouveau » du bas crée l'élément quand on valide son titre (Entrée) et rouvre une ligne vide.** Saisie en rafale sans perte de lettres (le champ reste le même pendant la réponse du serveur), et pas de ligne vide créée par un clic distrait.
- **Un élément créé dans une vue filtrée ou depuis une section hérite des valeurs que la vue fixe (Statut = En cours…).** « Le + hérite du contexte où il se trouve » (spec 6.6) ; un filtre OU à plusieurs règles ne fixe rien.
- **Une règle de filtre sans valeur ne filtre rien, et « Statut n'est pas Terminé » garde les lignes sans statut.** Ajouter un filtre ne vide pas la vue avant qu'on l'ait rempli ; une tâche pas encore classée n'est pas terminée.
- **Ordre, visibilité et largeur des colonnes appartiennent à chaque vue (`visible_properties`, `property_widths`).** Une vue est une configuration (P6) ; une propriété ajoutée apparaît dans toutes les vues.
- **La configuration d'une vue s'applique tout de suite à l'écran et part au serveur 400 ms après le dernier changement.** Glisser une largeur de colonne envoie une requête, pas une par pixel ; une réponse du serveur arrivée entre-temps ne l'écrase pas.
- **Les colonnes se déplacent à la souris ou par appui long au doigt ; les tris se réordonnent par flèches haut et bas.** L'équivalent clavier pour déplacer une colonne reste à faire.
- **Ligne ouverte en aperçu à droite par défaut ; au centre ou en pleine page selon l'option de la vue.** Spec 6.4, `open_pages_in`.
- **Le bloc « base de données » n'est pas sélectionnable comme du texte.** Taper dans une cellule ou glisser une colonne appartient à la base, jamais à l'éditeur de la page.
- **Supprimer le bloc d'une base ne supprime pas ses données.** Elles restent en base, sans plus être affichées ; une vraie suppression (avec corbeille) des bases viendra plus tard.
- **Les options se créent en tapant dans une cellule ; les renommer, les recolorer ou les supprimer viendra avec la gestion des options.** Le serveur sait déjà vider les valeurs d'une option supprimée.
- **Les requêtes des bases et des valeurs de lignes échappent à `TrimStrings` et `ConvertEmptyStringsToNull`.** Une cellule de texte vidée vaut « » et non null, et ses espaces restent.
- **Les vues portent aussi le `workspace_id` de leur base.** La même portée d'isolation s'applique aux pages, aux bases et aux vues, sans jointure.
- **Glisser un bloc au doigt : notre propre gestion du toucher sur la poignée ⠿.** BlockNote déplace les blocs par le glisser-déposer natif, qu'Android ne déclenche pas au doigt (constaté sur le téléphone de test). Appuyer puis glisser (8 px) déplace le bloc avec une ligne qui montre où il tombe et un défilement près des bords ; un tap ouvre toujours le menu ; à la souris, rien ne change.
- **Mot de passe oublié : un envoi raté répond 503 et retire le jeton créé.** Sinon le réessai, limité à un envoi par minute, affichait « e-mail envoyé » alors que rien n'était parti (constaté avec une adresse d'expédition sans « @ »). Le contrôle de l'hébergement vérifie aussi que MAIL_FROM_ADDRESS est une adresse complète.

## Phase 4

- **Le « Gestionnaire de tâches » est créé par le serveur (`template: "tasks"`), en ligne dans la page, depuis le menu « / ».** Une seule requête crée le schéma (Nom, Statut, Échéance, Priorité, Étiquettes), les quatre vues de la spec 6.7 et trois tâches « À faire ». En ligne plutôt qu'en pleine page : on reste dans sa page, et le bloc s'ouvre en grand d'un clic. La relation « Projet » viendra avec les relations.
- **La vue Calendrier du modèle existe déjà, affichée en tableau avec une mention jusqu'à la phase 5.** Les bases de tâches créées maintenant auront leur calendrier sans rien refaire ; le menu « + » des vues ne propose toujours pas le Calendrier.
- **La vue « Aujourd'hui » est une Liste.** Une liste courte de ce qui est dû, avec sa case à cocher ; le Tableau reste la vue complète.
- **Une nouvelle ligne prend la première option « À faire » de chaque Statut, sauf si la vue ou la saisie en fixe une autre.** Une tâche qu'on vient d'ajouter est à faire, pas « sans statut » ; c'est aussi ce que fait Notion.
- **La case à cocher pilote le premier Statut de la base : cocher met le premier statut « Terminé », décocher le premier « À faire ».** Elle est devant le titre, dans le Tableau et la Liste. Une tâche terminée a son titre grisé et barré (transition 150 ms, comme une to-do de page), sur les cartes du Board aussi. La case change à l'écran au clic, sans attendre la réponse.
- **Récurrence : « Répéter » dans la date (tous les jours, semaines, mois, ans, ou tous les N), stocké dans la valeur (`repeat: { unit, interval }`).** Quand la tâche passe dans le groupe « Terminé », le serveur crée dans la même transaction la suivante : même titre, icône, contenu et valeurs, date décalée (la fin aussi, pour garder la durée), statut « À faire », placée juste après. La tâche terminée garde sa date mais perd sa répétition : la décocher puis la recocher ne crée pas de doublon. Le client ajoute la nouvelle ligne sans recharger et l'annonce (« Prochaine occurrence : 12 nov. 2026 »).
- **« Tous les mois » le 31 janvier tombe le 28 février (29 les années bissextiles), pas le 3 mars.** Comme un agenda. Les mois suivants partent de cette nouvelle date.
- **Une heure de tâche récurrente est décalée en UTC.** Une tâche à 9 h se retrouve à 10 h (ou 8 h) après un changement d'heure d'été ; le fuseau de l'utilisateur viendra avec le calendrier (phase 5).
- **Board : une colonne par option d'un Statut, d'une Sélection ou d'une Sélection multiple ; « Sans … » toujours présente (même vide, pour y déposer une carte) et masquable.** Les colonnes masquées sont listées à droite (« Groupes masqués »), un clic les réaffiche. Sur une Sélection multiple, changer de colonne échange l'option de départ contre celle d'arrivée.
- **Glisser une carte : la colonne sous le pointeur, la place selon le milieu de la carte ; un trait montre où elle tombe.** Souris : dès 4 px ; doigt : appui long (250 ms), un glisser rapide fait défiler le Board. La place est une clé d'ordre (fractional indexing) entre les deux voisines de la colonne, enregistrée sur la ligne (`position`, accepté seulement pour une ligne de base). Avec un tri actif, glisser ne change que la colonne.
- **En-tête de colonne : « ⋯ » (masquer, renommer, couleur, supprimer l'option) et « + » ; « + Nouvelle page » au pied ; « + Ajouter un groupe » en dernière colonne.** Supprimer un groupe demande confirmation et ne supprime aucune tâche : elles passent dans « Sans … ». Un nouveau groupe de Statut se range dans « En cours », entre ce qui reste à faire et ce qui est fait.
- **Les cartes montrent le titre et les propriétés visibles qui ont une valeur, sauf celle des colonnes.** Le Statut d'une carte se lit déjà à sa colonne.
- **Une modification de vue encore en attente (400 ms) part tout de suite quand la page est masquée, rechargée ou fermée.** Sinon masquer une colonne puis recharger aussitôt la perdait. Et une propriété ajoutée pendant cette attente rejoint aussi les colonnes de la vue (elle n'apparaissait pas).
- **La section « Sans … » se note « :empty » dans `group_by.hidden`.** Le deux-points n'existe dans aucun identifiant d'option, et un texte vide peut devenir null en route.
