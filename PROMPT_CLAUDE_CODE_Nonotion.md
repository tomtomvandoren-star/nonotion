# PROMPT CLAUDE CODE : Répliquer Notion (blocs, to-do, bases de données, agenda, import ICS)

> **Stack en une ligne** : TypeScript · React + Vite · Tailwind + shadcn/ui · BlockNote · **PHP 8 + Laravel + MariaDB sur l'hébergement mutualisé Infomaniak** · Tauri 2 (Windows, macOS, Linux) · Capacitor (iOS, Android) · PWA. Détails et raisons en section 1.

---

## 0. Mode d'emploi pour Claude Code (à lire en premier)

Tu vas construire, étape par étape, une application web inspirée de Notion. Ce document décrit **quoi construire**, mais surtout **pourquoi chaque élément existe et où il se trouve**. Quand une phrase explique une intention UX (« le bouton + est en haut à droite parce que… »), l'intention est aussi importante que le composant : si tu dois choisir entre deux implémentations, choisis celle qui respecte l'intention.

Règles de travail :

1. **Lis tout le document avant d'écrire du code.**
2. **Propose d'abord un plan** (arborescence du projet, choix techniques, ordre des tâches) et attends ma validation avant de coder.
3. **Travaille par phases** (section 9). À la fin de chaque phase : lance les tests, lance l'application, résume ce qui marche, liste ce qui reste, puis **arrête-toi** et attends mon feu vert.
4. **Pose-moi une question** seulement si un choix change vraiment le résultat. Sinon, prends la décision la plus simple, note-la dans `DECISIONS.md` (une ligne : décision + raison) et continue.
5. **Ne change pas la pile technique** (section 1) sans me demander.
6. Écris du code lisible, typé, avec des commits fréquents et des messages clairs.
7. Quand tu ajoutes une fonction, ajoute au moins un test qui vérifie son **critère d'acceptation** (indiqué pour chaque fonction).

---

## 1. Stack technique et plateformes (adaptée à l'hébergement mutualisé Infomaniak)

### 1.1 Objectif et contrainte d'hébergement

L'application doit fonctionner sur **web, Windows, macOS, Linux, iOS et Android** avec **une seule base de code côté interface (TypeScript)**. Stratégie : **web d'abord**, puis **emballage natif** de la même application (desktop, puis mobile).

**Contrainte forte : tout le serveur doit tourner sur mon abonnement d'hébergement web mutualisé Infomaniak**, sans serveur à administrer. Voici ce que cela implique (à **confirmer dans mon Manager Infomaniak pendant la phase 0**) :

| Disponible sur l'hébergement mutualisé | Non disponible (donc interdit côté serveur) |
|---|---|
| PHP 8.5 (version choisissable par site), MariaDB/MySQL, Apache + `.htaccess`, accès SSH, Composer 2, Git, certificats SSL, e-mail/SMTP, tâches cron du Manager | Node.js, Docker, PostgreSQL, processus qui tournent en continu, WebSockets, accès root |

**Règle** : aucune technologie de la colonne de droite ne doit être nécessaire en production. Node.js sert uniquement sur ma machine (ou en intégration continue) pour **compiler** le front.

**Interdit sans mon accord explicite** : démarrer une seconde base de code d'interface (Flutter, React Native, Swift/Kotlin dédiés), utiliser Next.js, utiliser un service cloud tiers pour les données (Supabase, Firebase…), ou introduire un backend Node.

### 1.2 Stack retenue

| Couche | Choix | Pourquoi |
|---|---|---|
| Langage front | **TypeScript** (mode strict) | Typage de l'interface, bien maîtrisé par Claude Code |
| Interface | **React + Vite** (application monopage) | Produit des fichiers statiques : on les envoie sur l'hébergement, et le même bundle s'emballe dans Tauri et Capacitor |
| Routage | **TanStack Router** (ou React Router) | Une URL par page (`/p/:pageId`) |
| Style | **Tailwind CSS + shadcn/ui** (Radix) | Composants accessibles copiés dans le projet ; thèmes clair/sombre par variables CSS (section 7) |
| Éditeur de blocs | **BlockNote**, cœur uniquement (**aucun paquet `@blocknote/xl-*`**, voir 1.3) | Slash menu, poignée de glisser-déposer, barre flottante, imbrication, to-do, tableaux : déjà fournis. Construit sur Tiptap/ProseMirror |
| Données côté client | **TanStack Query** | Cache, mises à jour optimistes, relance automatique, rafraîchissement périodique (remplace le temps réel) |
| État d'interface | **Zustand** | Sidebar ouverte, thème, sélection |
| Validation côté client | **Zod** (dans `packages/shared`) | Formulaires et propriétés de bases ; le serveur revalide toujours |
| Backend | **PHP 8.x + Laravel** (API JSON) | Tourne sur l'hébergement mutualisé. Fournit déjà : migrations, authentification par jetons (Sanctum), validation, politiques d'accès, chiffrement, planificateur, envoi d'e-mails |
| Base de données | **MariaDB / MySQL** (fournie par l'hébergement) | Seule base disponible. Schéma 100 % en migrations Laravel |
| Authentification | **Laravel Sanctum** (jetons Bearer), mots de passe hachés, limitation de tentatives, réinitialisation par e-mail (SMTP Infomaniak) | Un seul mécanisme pour le web, le desktop et le mobile |
| Import ICS | **sabre/vobject** (PHP, via Composer) | Lit les fichiers iCalendar et sait **développer les récurrences** ; c'est la bibliothèque de référence côté PHP |
| Tâches planifiées | **Planificateur Laravel** déclenché par une tâche **cron** du Manager | Resynchronisation des agendas ICS |
| Glisser-déposer (hors éditeur) | **dnd-kit** | Sidebar, kanban, calendrier |
| Desktop (Windows, macOS, Linux) | **Tauri 2** | Applications légères qui utilisent la vue web du système |
| Mobile (iOS, Android) | **Capacitor** (Tauri mobile en plan B) | Plus mûr sur mobile, plugins de notifications, partage, stockage sécurisé |
| Installable immédiatement | **PWA** (`vite-plugin-pwa`) | Installable depuis le navigateur sur tous les systèmes |
| Tests | **Vitest** + **Playwright** (Chromium, WebKit, Firefox) pour le front ; **Pest** (ou PHPUnit) pour l'API | WebKit sert de proxy pour Safari, iOS et la vue web de macOS |
| Outillage | **pnpm workspaces**, Composer, ESLint, Prettier, Laravel Pint, GitHub Actions | Monorepo `apps/web`, `apps/api`, `apps/desktop`, `apps/mobile`, `packages/shared` |

### 1.3 Décisions importantes et leurs raisons

1. **Vite + React plutôt que Next.js.** L'hébergement mutualisé et les applications Tauri/Capacitor ne font tourner que des fichiers statiques côté interface : pas de serveur Next.js. Notre application est derrière une connexion, le référencement n'apporte rien.
2. **Backend PHP/Laravel, pas Node.** Node.js n'est pas disponible sur l'hébergement mutualisé d'Infomaniak ; PHP, lui, y tourne nativement. Un backend Node (Fastify, NestJS) est donc exclu. Laravel est choisi parce qu'il apporte presque tout (voir tableau) et que Claude Code le connaît bien. Les dépendances s'installent avec **Composer, déjà disponible en SSH**. Plan B si Laravel s'avère trop lourd pour l'hébergement : **Slim 4**. Choisis la version de PHP dans le Manager selon ce que demande la version de Laravel retenue (version récente de PHP 8.x).
3. **MariaDB, pas PostgreSQL.** Conséquences à respecter : le JSON est stocké comme **texte JSON** et **on ne fait pas de requêtes à l'intérieur du JSON** (le filtrage des bases se fait côté client, voir 6.6) ; la recherche plein texte utilise un index `FULLTEXT` ; les identifiants sont des **ULID** générés par Laravel ; la colonne d'ordre (`position`) utilise une collation **binaire** (`utf8mb4_bin`) pour que le tri des clés soit correct.
4. **BlockNote sans les paquets XL.** Le cœur de BlockNote est sous licence MPL-2.0, utilisable gratuitement en commercial. Les paquets **XL** (**multi-colonnes**, export PDF/Word, IA) sont en **GPL-3.0 ou licence commerciale payante**. Donc **pas de colonnes dans le MVP** (ou colonnes écrites par nous sur Tiptap plus tard). Cela concerne la section 6.3c.
5. **Une page = un document JSON + un numéro de version.** Le contenu d'une page est une colonne `content` (JSON texte) au format BlockNote. Chaque page a un champ `version` : à chaque sauvegarde le client envoie la version qu'il a lue, et le serveur répond **409** si la page a été modifiée entre-temps (autre appareil). L'interface affiche alors « Cette page a été modifiée ailleurs » avec le choix de recharger ou d'écraser. C'est le **verrouillage optimiste**.
6. **Pas de temps réel.** Un hébergement mutualisé ne garde pas de connexion WebSocket ouverte. La synchronisation entre appareils se fait par **rafraîchissement** : au retour sur la fenêtre, puis toutes les 30 à 60 secondes tant que l'application est visible, via un point d'accès `GET /api/sync?since=<date>` qui ne renvoie que ce qui a changé. L'édition collaborative simultanée (Yjs) est **hors périmètre** de cet hébergement.
7. **Jetons Bearer partout.** Un seul chemin de code pour le web, le desktop et le mobile. Le jeton est conservé via `platform/secureStorage`. Les applications natives ont une origine différente du site : configurer **CORS** pour les origines des WebViews Tauri et Capacitor (à vérifier lors de la phase 8).
8. **Tauri 2 pour le desktop, Capacitor pour le mobile.** Tauri 2 est stable depuis octobre 2024 et a ajouté iOS/Android à cette occasion, mais le mobile y est plus récent que le desktop. Capacitor est plus éprouvé. Le code web est le même dans les deux cas, et toutes les versions parlent à la même API.
9. **Sécurité par isolation des données.** Toute requête est limitée au `workspace` de l'utilisateur connecté (portée globale Eloquent + **Policies** Laravel), avec un test qui prouve qu'un utilisateur ne peut jamais lire ni modifier les données d'un autre.
10. **En ligne d'abord, hors-ligne ensuite.** Le MVP exige une connexion (avec cache et mises à jour optimistes). Le mode hors-ligne vient dans une phase ultérieure.

### 1.4 Schéma d'architecture

```
 Web / PWA ───────────────┐
 Tauri 2 (Win/Mac/Linux)  ├──► MÊME bundle React (Vite) ──► HTTPS ──► Hébergement mutualisé Infomaniak
 Capacitor (iOS/Android)  ┘                                            │
                                                                       ├─ /            fichiers statiques du front
                                                                       ├─ /api/*       PHP (Laravel) ──► MariaDB
                                                                       ├─ /uploads/    images envoyées par les utilisateurs
                                                                       ├─ /downloads/  installateurs desktop + manifeste de mise à jour
                                                                       └─ cron ──► « artisan schedule:run » (resynchronisation ICS)
```

### 1.5 Plan de livraison par plateforme

| Plateforme | Emballage | Phase | Prérequis et pièges |
|---|---|---|---|
| Web | Navigateur + PWA, hébergé sur Infomaniak | 0 à 7, en continu | Domaine ou sous-domaine en HTTPS, déploiement décrit en 1.8 |
| Windows | Tauri 2 (`.msi` / `.exe`) | 8 | Signature de code conseillée, sinon avertissement SmartScreen |
| macOS | Tauri 2 (`.dmg`) | 8 | Signature et notarisation Apple (compte développeur payant), idéalement construit sur un Mac |
| Linux | Tauri 2 (AppImage, `.deb`, Flatpak) | 8 | Utilise WebKitGTK : tester tôt |
| iOS | Capacitor | 10 | Il faut un **Mac avec Xcode** et un compte Apple Developer (environ 99 $/an) pour tester sur un vrai iPhone et publier |
| Android | Capacitor | 10 | Android Studio ; compte Google Play (environ 25 $, une fois) pour publier ; un APK peut être installé directement pour les tests |

Les installateurs desktop peuvent être mis en téléchargement dans `/downloads/` sur l'hébergement, avec le petit fichier JSON utilisé par la mise à jour automatique de Tauri.

### 1.6 Règles pour que le code reste portable partout

1. **Front sans serveur.** Tout appel au backend passe par un module unique (`apps/web/src/lib/api/`) qui lit l'adresse de l'API dans une variable d'environnement (`VITE_API_URL`). Les applications natives l'utilisent telle quelle.
2. **Couche `platform/`.** Une interface TypeScript `Platform` (ouvrir un lien externe, partager, notifier, choisir un fichier, stockage sécurisé, `isMac`, `isTouch`) avec trois implémentations (web, Tauri, Capacitor) choisies au démarrage. Le reste du code n'importe **jamais** `@tauri-apps/*` ni `@capacitor/*` directement.
3. **Authentification simple d'abord** : e-mail + mot de passe. Les connexions « Se connecter avec Google » demandent des liens profonds propres à chaque plateforme : phases 8 et 10, pas avant.
4. **Aucun contrôle ne dépend du survol.** Tout élément « visible au survol » (principe P2) doit aussi être accessible sur écran tactile via `@media (pointer: coarse)`. Cibles tactiles d'au moins 44 px.
5. **Zones sûres et hauteurs** : `env(safe-area-inset-*)`, `100dvh`, `viewport-fit=cover`.
6. **Raccourcis** : `Cmd` sur macOS, `Ctrl` ailleurs, décidés à un seul endroit (`isMac`).
7. **dnd-kit** : capteurs souris, **tactile avec appui long (~250 ms)** et clavier.
8. **Tests multi-moteurs** : Playwright sur Chromium, WebKit et Firefox.
9. **Secrets** : le client ne contient que l'adresse de l'API. Le fichier `.env` du serveur n'est **jamais** versionné. La clé `APP_KEY` de Laravel (qui chiffre les liens d'agenda) doit être **sauvegardée** : si elle est perdue, les liens chiffrés ne sont plus lisibles.
10. **Seul le jeton d'authentification est conservé côté client** ; toutes les données vivent en base. Exception (phase 11) : les **applications natives** gardent une copie locale de ce qu'elles ont chargé et les modifications pas encore envoyées, pour travailler hors ligne (6.16). Le site web, lui, ne garde rien.
11. **Appels réseau économes** (hébergement partagé) : pagination partout, compression gzip activée, requêtes groupées, rafraîchissement périodique espacé et suspendu quand l'application n'est pas visible.

### 1.7 Risques connus et plans B

| Risque | Pourquoi | Plan B |
|---|---|---|
| Ressources partagées (processeur, mémoire) | Les sites voisins partagent le serveur | Pagination, index MariaDB, cache Laravel, pas de traitement lourd dans une requête ; si besoin, passer plus tard à un Serveur Cloud ou un VPS avec le même code |
| Limites PHP (durée d'exécution, mémoire, taille d'envoi) | Réglées par site dans le Manager | Import ICS et envois **par lots** ; ajuster les réglages PHP dans le Manager |
| Fréquence minimale des tâches cron | Dépend de ce que permet le Manager | **Synchronisation à l'ouverture** : si un agenda n'a pas été resynchronisé depuis plus de 15 minutes, l'application le déclenche ; le cron sert de complément |
| Pas de temps réel | Pas de WebSocket | Rafraîchissement périodique + endpoint `sync` ; le collaboratif simultané viendra avec un VPS |
| Connexions sortantes (import ICS) | L'hébergement doit autoriser les requêtes HTTPS vers l'extérieur | **Tester en phase 0** ; si bloqué, proposer l'import par fichier `.ics` envoyé depuis l'appareil |
| Pas de requêtes JSON en SQL (MariaDB) | Le JSON est du texte | Filtrage côté client (6.6) ; si une base devient très grande, ajouter des colonnes indexées pour les propriétés les plus filtrées |
| Vue web Linux (WebKitGTK) moins fluide que Chromium | Tauri utilise la vue web du système | Tester dès la phase 2 ; si bloquant, Electron pour le desktop (même code web) |
| Clavier mobile et zones d'édition riches (iOS surtout) | Les éditeurs de texte sont délicats dans une WebView | Faire un **build Capacitor minimal sur un vrai téléphone dès la fin de la phase 2** |
| Licence BlockNote XL | Multi-colonnes, exports, IA : GPL-3.0 ou licence payante | Ne pas les utiliser ; colonnes maison plus tard, ou licence commerciale |
| Dépendance à l'hébergeur | Tout est sur un seul abonnement | Laravel et MariaDB sont portables ; sauvegardes régulières de la base et du dossier `uploads/` |

### 1.8 Déploiement sur l'hébergement mutualisé

**Organisation sur le serveur** (le dossier racine du site pointe sur `public/` ; à vérifier dans le Manager, sinon placer le code Laravel au-dessus de la racine web et adapter les chemins de `public/index.php`) :

```
(au-dessus de la racine web : non accessible depuis internet)
├─ app/  routes/  database/  vendor/  storage/  .env
(racine web = public/)
├─ index.php              point d'entrée Laravel (routes /api/*)
├─ index.html + assets/   build du front, copié ici à chaque déploiement
├─ .htaccess              règles de réécriture
├─ uploads/               images des utilisateurs
└─ downloads/             installateurs desktop + manifeste de mise à jour
```

**Règles de réécriture (`.htaccess`)**, dans cet ordre : (1) toute adresse commençant par `/api/` va à `index.php` ; (2) un fichier ou dossier existant est servi tel quel ; (3) tout le reste renvoie `index.html` (sinon l'actualisation d'une page `/p/abc123` donne une erreur 404). Conserver les lignes par défaut de Laravel (notamment celle qui transmet l'en-tête `Authorization`). Ajouter la compression gzip et un cache long pour `assets/`.

**Script de déploiement** (`deploy.sh`, puis GitHub Actions) :
1. Compiler le front (`pnpm build`).
2. Copier le résultat dans `apps/api/public/` **sans écraser** `index.php`, `uploads/` ni `downloads/`.
3. Envoyer sur le serveur par SFTP ou rsync via SSH.
4. En SSH sur le serveur : `composer install --no-dev --optimize-autoloader`, `php artisan migrate --force`, `php artisan config:cache`, `php artisan route:cache`.
5. Vérifier que `GET /api/health` répond « ok ».

**Planificateur** : dans le Manager, créer une tâche cron qui exécute `php artisan schedule:run` à la fréquence minimale autorisée.

**Phase 0 : test de déploiement obligatoire.** Avant d'écrire la moindre fonction, déployer une page « Bonjour » et `GET /api/health` (avec une écriture et une lecture en base) sur mon domaine, pour confirmer d'un coup : version de PHP, MariaDB, SSH, Composer, dossier racine, `.htaccess`, cron et connexions sortantes. Si un point échoue, **tu me le signales avant de continuer**.

---

## 2. Mission

Construire **[NOM_APP]**, un espace de travail où tout est composé de **blocs**, organisé en **pages** imbriquées, avec des **bases de données** que l'on peut afficher de plusieurs façons (tableau, kanban, liste, calendrier). Priorités :

1. Un éditeur de blocs fluide (slash menu, glisser-déposer).
2. Des bases de données avec propriétés et vues (c'est ce qui donne la to-do list et l'agenda).
3. Une vue Calendrier, avec **import d'un agenda par lien ICS** (fonction que Notion n'a pas en natif).

Cible : usage personnel d'abord (un seul utilisateur), mais avec compte et données sur l'hébergement mutualisé Infomaniak dès le départ, et une isolation des données par utilisateur, pour permettre plus tard le multi-utilisateurs et le partage.

---

## 3. Principes directeurs (la « philosophie » à respecter partout)

| # | Principe | Ce que ça veut dire concrètement |
|---|---|---|
| P1 | **Tout est un bloc, une page, ou une base** | Une seule structure de données récursive. Pas de cas particuliers pour « une to-do » ou « un événement » : ce sont des pages d'une base avec des propriétés. |
| P2 | **Les contrôles se révèlent au survol** | L'interface au repos est quasi vide (calme visuel). Les poignées, « + », menus « ⋯ » n'apparaissent que quand la souris passe sur l'élément concerné. Sur tactile : visibles en permanence ou au tap. |
| P3 | **Un seul geste pour créer** | Taper `/` n'importe où dans une page ouvre le menu de création. Le « + » est toujours là où l'on regarde déjà (voir « Intention UX » de chaque fonction). |
| P4 | **Manipulation directe** | Tout se réorganise en glissant-déposant (blocs, pages dans la sidebar, cartes de kanban, événements sur le calendrier). Un indicateur visuel (ligne bleue, case surlignée) montre où l'élément va tomber **avant** de relâcher. |
| P5 | **Sauvegarde automatique, jamais de bouton Enregistrer** | Chaque modification est envoyée au serveur avec un debounce (~500 ms) et un petit indicateur discret « Enregistré ». Annuler/rétablir (Ctrl+Z / Ctrl+Maj+Z) fonctionne partout. |
| P6 | **Une vue = une configuration, jamais une copie des données** | Les filtres, tris, regroupements, colonnes visibles et type d'affichage sont stockés dans la vue. Les données vivent une seule fois, dans la base. Changer de vue ne duplique rien. |
| P7 | **Le clavier d'abord, la souris aussi** | Toute action fréquente a un raccourci, et une alternative visuelle. |
| P8 | **Sobriété visuelle** | Peu de bordures, pas d'ombres sauf menus et modales, transitions de 100 à 200 ms, aucune animation décorative. |

---

## 4. Modèle de données

### 4.1 Tables principales (MariaDB / MySQL, créées par des migrations Laravel)

**Isolation des données** : chaque requête est limitée aux `workspaces` de l'utilisateur connecté (portée globale Eloquent + Policies Laravel). Le schéma est défini **uniquement par des migrations** versionnées dans `apps/api/database/migrations`. Les dates sont stockées en UTC.

```sql
-- MariaDB (utf8mb4). Identifiants : ULID (char(26)) générés par Laravel.
-- Les colonnes marquées JSON sont du TEXTE JSON (Eloquent les convertit en tableaux) : on ne les interroge pas en SQL.
users(id, name, email UNIQUE, password, created_at, updated_at)     -- table Laravel standard
personal_access_tokens(...)                                         -- jetons Sanctum
workspaces(id, name, owner_id, created_at)
workspace_members(workspace_id, user_id, role)   -- un seul membre au départ ; prévu pour le partage (phase 11)

pages(
  id, workspace_id,
  parent_page_id NULL,        -- imbrication : page dans une page
  database_id NULL,           -- si non NULL : cette page est une LIGNE de cette base
  title, icon, cover_url,
  content LONGTEXT,           -- JSON : le DOCUMENT BlockNote de la page (une page = un document)
  search_text LONGTEXT,       -- texte brut extrait du contenu à chaque sauvegarde (recherche)
  properties LONGTEXT,        -- JSON : valeurs des propriétés si c'est une ligne de base : { "<property_id>": valeur }
  is_favorite,
  position VARCHAR(64) COLLATE utf8mb4_bin,   -- clé triable (fractional indexing) : collation BINAIRE obligatoire
  version INT,                -- verrouillage optimiste : +1 à chaque sauvegarde, 409 si le client est en retard
  -- pour les événements importés depuis un lien ICS (6.9) :
  calendar_source_id NULL, ics_uid NULL, ics_recurrence_id VARCHAR DEFAULT '',   -- '' et non NULL (voir ci-dessous)
  created_at, updated_at, deleted_at NULL   -- suppression douce (corbeille)
)
-- index unique sur (calendar_source_id, ics_uid, ics_recurrence_id) pour l'upsert ICS
-- index sur (workspace_id, parent_page_id, position) et sur (database_id, deleted_at)
-- index FULLTEXT sur (title, search_text)

databases(
  id, workspace_id, page_id,   -- la base vit dans une page (en ligne ou pleine page)
  title,
  schema LONGTEXT              -- JSON : liste des propriétés : [{id, name, type, options...}]
)

views(
  id, database_id, name, position,
  type,                        -- table | board | list | calendar | gallery
  config LONGTEXT              -- JSON : voir 4.2
)

calendar_sources(              -- agendas importés par lien ICS (section 6.9)
  id, workspace_id, database_id, name, color,
  url_encrypted TEXT,          -- chiffré avec Crypt de Laravel (APP_KEY) : l'URL est un SECRET
  url_host,                    -- domaine seul, pour l'affichage
  mode,                        -- 'subscription' | 'one_shot'
  etag NULL, last_sync_at NULL, status, error_message NULL, events_count
)
```

**Pourquoi `content` est un seul JSON et non une table de blocs** : la sauvegarde automatique devient une seule écriture ; BlockNote lit et écrit ce format directement. On renonce aux requêtes SQL par bloc, ce qui est acceptable (la recherche utilise `search_text`).

**Pourquoi `ics_recurrence_id` vaut `''` et non `NULL`** : dans MariaDB un index unique accepte plusieurs `NULL`, ce qui créerait des doublons à chaque resynchronisation.

### 4.2 Contenu d'une vue (`views.config`)

```json
{
  "filters": { "operator": "and", "rules": [ { "property": "status", "op": "is_not", "value": "done" } ] },
  "sorts":   [ { "property": "due", "direction": "asc" } ],
  "group_by": { "property": "status", "hide_empty": false },
  "visible_properties": ["status", "due", "priority"],
  "calendar_by": "due",            // quelle propriété Date place l'élément sur le calendrier
  "open_pages_in": "side_peek",    // side_peek | center_modal | full_page
  "card_size": "medium"
}
```

### 4.3 Types de propriétés à gérer (par ordre de priorité)
1. Titre, Texte, Nombre, Checkbox, Date (début, fin optionnelle, heure optionnelle), Select, Multi-select, Statut (groupes : À faire / En cours / Terminé).
2. URL, E-mail, Personne, Créé le, Modifié le.
3. Relation et Rollup, Formule (phase avancée).

**Règle d'or** : une propriété est validée par son type (Zod). Une valeur invalide est refusée côté API, pas seulement côté interface.

---

## 5. Disposition générale de l'interface

```
┌───────────────┬──────────────────────────────────────────────────┐
│ SIDEBAR       │ BARRE DU HAUT : [☰] [‹ ›] Fil d'Ariane    [Partager] [⋯] │
│ 240 px        ├──────────────────────────────────────────────────┤
│ (redimension- │                                                  │
│ nable 200-400)│   CANVAS : contenu centré (~700 px)              │
│               │   ou pleine largeur (option par page)            │
│               │                                                  │
└───────────────┴──────────────────────────────────────────────────┘
```

**Intention UX de la disposition** : la navigation (sidebar) est à gauche, stable, toujours au même endroit : on ne se perd pas. Le contenu est au centre dans une colonne étroite parce qu'une ligne trop large est pénible à lire. Les actions de la page (partager, menu) sont en haut à droite, là où l'œil va chercher « ce que je peux faire de cette page ». Les actions de **création dans une base** sont encore ailleurs : dans la barre d'outils de la vue, juste au-dessus des données (section 6.6).

---

## 6. Fonctionnalités : mécanismes et intentions

Format de chaque fonction : **Rôle** (pourquoi elle existe) → **Emplacement** → **Interaction** → **Mécanisme technique** → **Critères d'acceptation**.

### 6.1 Sidebar et arbre de pages

- **Rôle** : être la carte du territoire. L'utilisateur doit toujours savoir où il est et pouvoir aller n'importe où en 2 clics.
- **Emplacement** : colonne de gauche. De haut en bas : sélecteur de workspace ; Recherche (Ctrl+K) ; Accueil ; Boîte de réception ; bouton « Nouvelle page » ; section **Favoris** ; section **Pages** (arbre) ; en bas Templates, Importer, Corbeille.
- **Interaction** :
  - Chaque ligne = icône + titre. Au survol (P2), deux boutons apparaissent **à droite de la ligne** : « ⋯ » (menu : renommer, dupliquer, favori, déplacer, supprimer) et « + » (créer une sous-page **dans cette page**).
  - Le triangle ▸ à gauche de la ligne déplie/replie les sous-pages. L'état déplié est mémorisé.
  - Glisser une ligne : la **position horizontale** du curseur décide de l'imbrication (dépôt sur le milieu d'une ligne = devenir enfant ; dépôt entre deux lignes = frère). Une ligne bleue montre le résultat.
  - Le bord droit de la sidebar est une poignée de redimensionnement. Bouton « « » (ou Ctrl+\) pour masquer/afficher.
- **Intention UX du « + » de la sidebar** : il est à droite de chaque page, **au survol uniquement**, parce que l'action « ajouter dans ceci » doit être à portée de souris de l'élément concerné, sans polluer la liste au repos.
- **Mécanisme** : `parent_page_id` + `position` (utilise le **fractional indexing** pour insérer entre deux éléments sans renuméroter toute la liste). Le déplacement met à jour `parent_page_id` et `position` en une seule requête. Interdire de déplacer une page dans l'un de ses propres descendants (vérifier côté serveur).
- **Critères d'acceptation** : créer 3 niveaux de pages ; réordonner par glisser-déposer ; recharger la page et retrouver exactement l'état ; impossible de créer une boucle.

### 6.2 Page (titre, icône, couverture)

- **Rôle** : le conteneur d'une idée. Elle doit ressembler à un document, pas à un formulaire.
- **Emplacement** : dans le canvas. Ordre : couverture (optionnelle, bandeau ~200 px) → icône (grande, chevauche la couverture) → titre (~40 px, gras) → propriétés (si c'est une ligne de base) → corps (blocs).
- **Interaction** : au survol sous le titre, trois petits boutons discrets apparaissent (« Ajouter une icône », « Ajouter une couverture », « Ajouter un commentaire »). Une fois ajoutés, ils disparaissent. Entrée dans le titre = passe au premier bloc du corps.
- **Mécanisme** : `pages.title`, `icon`, `cover_url`. Le titre de la page se met à jour **en direct** dans la sidebar et le fil d'Ariane (état partagé, pas de rechargement).
- **Critères d'acceptation** : renommer une page met à jour la sidebar immédiatement ; Entrée dans le titre place le curseur dans le corps.

### 6.3 Éditeur de blocs

**Note de mise en œuvre (BlockNote)** : la plupart des comportements ci-dessous (slash menu, poignée de glisser-déposer, barre flottante, imbrication par Tab, to-do, raccourcis Markdown) sont **fournis par BlockNote**. Ton travail est de **les configurer et les personnaliser** (libellés en français, mots-clés de recherche, style, blocs personnalisés comme la vue de base de données), pas de les réécrire. Les critères d'acceptation restent obligatoires. N'utilise aucun paquet `@blocknote/xl-*` (licence, voir 1.3).

#### a) Slash menu
- **Rôle** : créer n'importe quel type de contenu sans quitter le clavier.
- **Interaction** : taper `/` au début d'une ligne vide (ou après un espace) ouvre un menu flottant **sous le curseur**. Continuer à taper filtre la liste (`/tod` → To-do). Flèches + Entrée valident, Échap ferme. Groupes : Basique, Médias, Bases de données, Avancé.
- **Mécanisme** : le menu de suggestion de BlockNote (déclenché par `/`), personnalisé : chaque entrée a un nom, des mots-clés de recherche (en français et en anglais), une icône, et une commande qui **transforme le bloc courant** ou en insère un nouveau. Ajoute les entrées propres à l'application (ex. « Base de données »).
- **Critères d'acceptation** : `/titre` transforme la ligne en titre 1 ; la liste se filtre à chaque lettre ; Échap ferme le menu et le `/` tapé reste dans le texte comme un caractère normal.

#### b) Raccourcis Markdown
`# ` titre 1, `## ` titre 2, `### ` titre 3, `- ` ou `* ` puces, `1. ` numérotée, `[] ` to-do, `> ` toggle, `"` citation, `---` séparateur, ``` bloc de code. Gras `**x**`, italique `*x*`, code `` `x` ``. **Intention** : les gens qui écrivent vite ne veulent pas lâcher le clavier.

#### c) Poignée de bloc (⠿) et « + » de ligne
- **Rôle** : donner à chaque ligne de texte des super-pouvoirs (déplacer, transformer, supprimer) sans encombrer l'écran.
- **Emplacement** : dans la **marge gauche** de chaque bloc, hors de la colonne de texte, visible **au survol** du bloc. Deux icônes côte à côte : « + » (insérer un bloc en dessous) puis « ⠿ » (poignée).
- **Interaction** : glisser « ⠿ » déplace le bloc (ligne bleue horizontale = position cible). Cliquer « ⠿ » ouvre un menu : Supprimer, Dupliquer, Transformer en…, Couleur, Commentaire.
- **Intention UX** : la marge gauche est la zone « outils », la colonne centrale est la zone « contenu ». Ainsi on ne touche jamais au texte par accident quand on veut déplacer un bloc.
- **Mécanisme** : le menu latéral de BlockNote (poignée et « + ») ; le déplacement est une transaction annulable. **Les colonnes ne sont pas dans le MVP** (elles sont dans le paquet XL sous licence GPL/commerciale) : si on les veut plus tard, on les écrira nous-mêmes sur Tiptap.
- **Critères d'acceptation** : déplacer un bloc entre deux autres ; Ctrl+Z annule le déplacement.

#### d) Barre de mise en forme flottante
- **Rôle** : formater sans aller chercher une barre d'outils fixe.
- **Emplacement** : apparaît **juste au-dessus** du texte sélectionné.
- **Contenu** : Transformer en ▾, Lien, Commentaire, **G** *I* U ~~S~~ `</>`, Couleur ▾, Mention.
- **Mécanisme** : la barre de formatage flottante de BlockNote, positionnée par rapport à la sélection.

#### e) Bloc To-do (checklist simple)
- **Rôle** : une checklist rapide **dans** une page de notes, sans créer une base de données. C'est le niveau 1 des tâches.
- **Interaction** : `[] ` ou `/todo` crée une ligne avec case à cocher. Cocher barre et grise le texte (transition 150 ms). Tab indente (sous-tâche), Maj+Tab désindente. Entrée sur une to-do vide la transforme en paragraphe normal (sortie naturelle de la liste).
- **Mécanisme** : bloc natif de liste de cases à cocher de BlockNote (propriété `checked`). Cocher = mise à jour d'un seul champ, enregistrée avec le document de la page.
- **Critères d'acceptation** : cocher/décocher persiste après rechargement ; Entrée sur ligne vide sort de la liste.

### 6.4 Bases de données (le moteur de tout le reste)

- **Rôle** : transformer des pages en données structurées. Une to-do list avancée, un agenda, un CRM sont **la même chose** avec des propriétés et des vues différentes.
- **Création** : `/base de données` insère une base **en ligne** dans la page (visible dans le flux), ou « Nouvelle base » en pleine page. Une base démarre avec : propriété Titre, une vue Tableau, trois lignes vides.
- **Mécanisme** : `databases.schema` définit les propriétés. Chaque ligne est une `page` avec `database_id` et ses valeurs dans `properties`. Ajouter une propriété = modifier le schéma ; les lignes existantes affichent simplement une valeur vide (pas de migration lourde).
- **Ligne = page** : cliquer sur une ligne l'ouvre (selon le réglage de la vue : panneau latéral « peek », modale centrée ou pleine page). En haut de la page ouverte : les propriétés en grille (nom à gauche, valeur éditable à droite), puis le corps libre en blocs.
- **Critères d'acceptation** : ajouter une propriété Date à une base de 5 lignes ; renseigner une date dans la page ouverte ; la voir dans la vue Tableau sans rechargement.

### 6.5 Onglets de vues

- **Rôle** : regarder les mêmes données sous plusieurs angles, sans les dupliquer (P6).
- **Emplacement** : **au-dessus de la base**, à gauche : une rangée d'onglets (`Tableau`, `Par statut`, `Calendrier`…). Tout à droite de la rangée d'onglets : un « **+** » qui ajoute une vue.
- **Interaction** : cliquer un onglet change la vue. Le « + » ouvre un menu avec les types (Tableau, Board, Liste, Calendrier, Galerie) ; choisir crée la vue avec une config par défaut intelligente (Board regroupé par Statut ; Calendrier basé sur la première propriété Date). Double-clic sur un onglet = renommer. Clic droit ou « ⋯ » = Dupliquer, Supprimer.
- **Intention UX du « + » des vues** : il est **dans la rangée des onglets**, juste après le dernier onglet, parce que le geste mental est « j'ai ces vues, j'en veux une de plus » : le bouton se trouve donc là où la liste s'arrête.
- **Critères d'acceptation** : créer 3 vues de types différents sur la même base ; modifier une ligne dans l'une la met à jour dans les autres.

### 6.6 Barre d'outils de vue, et la création d'éléments (le cœur de la to-do list)

- **Rôle** : contrôler ce qu'on voit (filtre, tri, regroupement) et **ajouter** des éléments.
- **Emplacement** : une ligne horizontale **entre les onglets et les données**. À gauche : rien ou le titre. **À droite** : `Filtre` · `Tri` · `🔍 Recherche` · `⋯ Options` · bouton bleu **`Nouveau ▾`**.
- **Intention UX du bouton « Nouveau » en haut à droite** : c'est l'endroit où l'œil et la souris vont naturellement pour « ajouter » dans une application (convention de nombreuses apps). Il reste **toujours visible, même quand on scrolle** (barre collante) : on peut ajouter une tâche quelle que soit la longueur de la liste. La partie principale du bouton crée un élément vide immédiatement ; la petite flèche ▾ ouvre le menu des **modèles** (templates).
- **Autres points d'ajout, volontairement redondants (chacun correspond à une intention différente)** :
  1. **Ligne « + Nouveau » en bas du tableau** : pour qui est déjà dans la liste et veut en ajouter **à la suite**. Cliquer crée une ligne et place le curseur dans la cellule Titre. Entrée valide et crée la ligne suivante (saisie en rafale).
  2. **« + » sur l'en-tête d'un groupe** (kanban ou tableau regroupé) : crée un élément **déjà rangé dans ce groupe** (ex : le statut pré-rempli à « En cours »). Intention : on n'a pas à choisir le statut après coup.
  3. **« + Nouvelle page » en pied de chaque colonne du kanban** : même logique, ciblée sur la colonne.
  4. **« + » au survol d'une case du calendrier** : crée un élément **déjà daté** de ce jour (section 6.8).
  Principe commun : **le « + » hérite du contexte où il se trouve** (groupe, date, filtre actif).
- **Filtre** : bouton qui ouvre un panneau sous le bouton. Chaque règle = `[Propriété ▾] [opérateur ▾] [valeur]`, avec « + Ajouter un filtre » et les connecteurs ET / OU. Un filtre actif colore le bouton (bleu léger) et affiche le nombre de règles, pour que l'utilisateur sache que la vue est filtrée (évite « où sont passées mes tâches ? »).
- **Tri** : liste de règles « Propriété + Ascendant/Descendant », réordonnables.
- **Regroupement** (dans « ⋯ Options » ou menu dédié) : sections repliables avec compteur.
- **Mécanisme** : un **moteur de filtre/tri/regroupement en TypeScript pur** (dans `packages/shared`, testé à part) lit `views.config` et s'applique aux lignes de la base. **MVP : calcul côté client** (les bases personnelles tiennent largement en mémoire). Quand une base dépasse quelques milliers de lignes, le même calcul passe côté serveur via un point d'accès d'API dédié (propriétés et opérateurs en liste blanche, requêtes préparées), avec pagination. Le contrat (config de vue en entrée, lignes en sortie) ne change pas.
- **Critères d'acceptation** : Statut ≠ Terminé ET Échéance ≤ aujourd'hui retourne les bonnes lignes ; « Nouveau » dans une vue filtrée sur Statut = « En cours » crée une tâche avec ce statut ; la ligne « + Nouveau » permet 5 saisies d'affilée au clavier.

### 6.7 La base « Tâches » (modèle de démarrage)

Quand l'utilisateur crée un « Gestionnaire de tâches », génère automatiquement cette base :

| Propriété | Type | Pourquoi |
|---|---|---|
| Nom | Titre | Libellé |
| Statut | Statut (À faire / En cours / Terminé) | Alimente le kanban ; « Terminé » cache/grise la tâche |
| Échéance | Date (heure optionnelle, plage optionnelle) | Alimente le calendrier et le filtre « Aujourd'hui » |
| Priorité | Select (Haute / Moyenne / Basse), couleurs | Tri et repérage visuel |
| Étiquettes | Multi-select | Catégories libres |
| Projet | Relation (phase avancée) | Relier à une autre base |

Vues fournies d'office : **Tableau** (toutes), **Aujourd'hui** (filtre Échéance = aujourd'hui, Statut ≠ Terminé), **Par statut** (Board), **Calendrier** (par Échéance).

**Case à cocher dans le tableau** : la première colonne affiche une case ; la cocher change le Statut à « Terminé » (et inversement). **Intention** : le geste le plus fréquent d'une to-do list (« c'est fait ») doit coûter un clic, pas l'ouverture d'un menu.

**Récurrence** : dans la propriété Date, option « Répéter » (tous les jours, semaines, mois, personnalisé). Quand une tâche récurrente passe à « Terminé », le serveur **crée la prochaine occurrence** avec la date suivante et remet le statut à « À faire ».

### 6.8 Vue Calendrier (agenda d'une base)

- **Rôle** : voir les éléments d'une base **dans le temps**.
- **Emplacement du contrôle** : dans la barre d'outils de la vue, à gauche : `‹ Aujourd'hui ›` + « novembre 2026 » + bascule `Mois | Semaine`. À droite : les contrôles habituels, plus **« + Ajouter ▾ »** (voir ci-dessous).
- **Affichage** :
  - Mois : grille 7 colonnes. Chaque élément = pastille (titre + éventuelle heure) dans la case de son jour. Trop d'éléments : « +3 autres » cliquable.
  - Semaine : colonne d'heures à gauche, ligne rouge pour l'heure actuelle, événements positionnés et dimensionnés selon leurs heures.
  - Plage de dates = barre qui s'étire sur plusieurs jours. Éléments « journée entière » en bandeau supérieur.
  - Éléments **sans date** : petit panneau « Sans date » repliable sur le côté. Intention : ne jamais « perdre » un élément parce qu'il n'est pas planifié.
- **Interactions** :
  - **Créer** : au survol d'une case de jour, un « + » discret apparaît **en haut à droite de la case** ; clic = nouvel élément daté de ce jour, titre en édition immédiate. En vue semaine : cliquer-glisser sur la grille horaire crée un événement avec ces horaires.
  - **Déplacer** : glisser une pastille vers un autre jour change sa date (même heure conservée).
  - **Redimensionner** : tirer le bord d'une barre/événement change la fin.
  - **Ouvrir** : clic = ouvre la page (peek).
- **Bouton « + Ajouter ▾ » en haut à droite de la vue Calendrier**
  - **Intention UX** : c'est le point d'entrée **unique** pour tout ce qui « enrichit » le calendrier, placé en haut à droite parce que c'est là qu'on cherche les actions d'ajout, et qu'il est ainsi toujours à portée de main sans prendre de place dans la grille.
  - **Menu** : `Nouvel événement` · `Importer un agenda depuis un lien (ICS)` · `Importer un fichier .ics` (phase 2).
  - Les agendas importés sont listés dans un **panneau latéral gauche repliable** (« Mes agendas ») avec case à cocher + pastille de couleur pour les afficher/masquer, et un menu « ⋯ » par agenda (Resynchroniser, Modifier, Supprimer).
- **Mécanisme** : la vue lit `config.calendar_by` (quelle propriété Date utiliser). Requête : toutes les lignes dont la date **intersecte** la fenêtre visible (début ≤ fin de fenêtre ET fin ≥ début de fenêtre). Les occurrences des événements importés par ICS sont **pré-générées par le serveur** dans une fenêtre glissante (voir 6.9) et stockées comme des lignes ordinaires : la requête reste donc simple. Le drag & drop met à jour la propriété Date via une requête optimiste (mise à jour immédiate de l'interface, annulation si le serveur refuse).
- **Fuseaux** : stocker en UTC + fuseau d'origine ; afficher dans le fuseau de l'utilisateur ; les dates « journée entière » ne sont **jamais** converties.
- **Critères d'acceptation** : créer un élément en cliquant le « + » d'une case ; le glisser sur un autre jour ; recharger : la nouvelle date est persistée ; un élément sans date apparaît dans « Sans date » ; basculer Mois/Semaine conserve la période.

### 6.9 Import d'un agenda par lien (ICS) : fonction prioritaire

- **Rôle** : récupérer un agenda existant (Google Agenda, Outlook, Apple, emploi du temps scolaire…) **sans compte ni connexion**, juste avec un lien. C'est le moyen le plus simple et le plus universel d'obtenir des événements.
- **Emplacement** : « + Ajouter ▾ » → « Importer un agenda depuis un lien (ICS) » (en haut à droite de la vue Calendrier).
- **Parcours (modale en 2 étapes)** :
  1. **Étape « Lien »** : champ URL (accepte `https://` et `webcal://`, converti en `https://`), champ Nom, sélecteur de couleur, choix **Abonnement** (mise à jour automatique) ou **Import unique**, choix de la base de destination (existante ou « Créer une nouvelle base d'événements »). Sous le champ URL, un texte d'aide avec où trouver le lien : Google Agenda → Paramètres de l'agenda → « Adresse secrète au format iCal » ; Outlook → Calendrier partagé → Publier ; iCloud → Calendrier public (`webcal://`) ; Moodle/Teams/Canvas → « Exporter l'agenda ». Bouton « Prévisualiser ».
  2. **Étape « Aperçu »** : liste des ~20 premiers événements à venir, nombre total, période couverte, avertissements éventuels (événements sans titre, fuseau inconnu). Boutons « Retour » et « Importer ». **Intention** : voir avant d'engager. On évite de polluer sa base avec 2 000 événements par erreur.
  Après import : toast « 142 événements importés », l'agenda apparaît dans « Mes agendas ».
- **Pourquoi un serveur ?** Le navigateur (et les WebViews des applications natives) bloque la lecture d'un lien externe qui n'autorise pas notre origine (CORS), et le lien est un secret qu'on ne veut pas manipuler côté client. Le téléchargement et l'analyse se font donc dans **l'API PHP** (avec sabre/vobject), appelée de la même façon depuis le web, le desktop et le mobile.
- **Mécanisme backend (points d'accès `POST /api/calendar-sources/preview`, `POST /api/calendar-sources`, `POST /api/calendar-sources/{id}/sync`)** :
  1. **Normaliser l'URL** (`webcal://` → `https://`). N'accepter que http(s).
  2. **Protection SSRF (obligatoire)** : résoudre le DNS côté serveur (`dns_get_record`) et **refuser** toute IP privée ou locale (127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, fc00::/7). Ensuite, **forcer la connexion à l'IP validée** (option cURL `CURLOPT_RESOLVE`) pour empêcher qu'une réponse DNS différente soit utilisée au moment de la connexion. Suivre les redirections **à la main** (max 3) en refaisant la vérification à chacune. Timeout 10 s, taille max 10 Mo. Pourquoi : sans cela, un utilisateur pourrait faire lire au serveur des adresses internes.
  3. **Récupérer** le fichier avec le client HTTP de Laravel, avec `If-None-Match` / `If-Modified-Since` aux resynchronisations (si 304 : rien à faire).
  4. **Parser** avec **sabre/vobject**. Pour chaque VEVENT, mapper : `SUMMARY`→Titre ; `DTSTART/DTEND`→Date (`VALUE=DATE` = journée entière) ; `LOCATION`→Lieu ; `DESCRIPTION`→corps de la page ; `URL`→URL ; `STATUS:CANCELLED`→supprimer/masquer ; `UID`+`RECURRENCE-ID`→**clé d'unicité** ; `RRULE/EXDATE/RDATE`→récurrence ; `TZID/VTIMEZONE`→fuseau (mapper les noms Windows type « W. Europe Standard Time » vers les noms IANA).
  5. **Récurrences** : développer les événements récurrents avec la fonction `expand` de sabre/vobject sur une **fenêtre glissante** (1 mois dans le passé, 12 mois dans le futur). Chaque occurrence devient **une ligne** dont `ics_recurrence_id` contient la date de l'occurrence (les exceptions `EXDATE` sont exclues, les occurrences modifiées sont prises en compte). La fenêtre est recalculée à chaque resynchronisation.
  6. **Upsert** : clé `(calendar_source_id, ics_uid, ics_recurrence_id)`. Un événement mis à jour dans la source met à jour la ligne ; un événement disparu de la source (ou sorti de la fenêtre) est supprimé en mode abonnement.
  7. **Événements importés en lecture seule** pour titre/dates (une resynchronisation les écraserait). Les propriétés ajoutées par l'utilisateur (étiquette, notes) restent modifiables et **sont conservées** à la resynchronisation.
  8. **Import par lots** (ex : 200 événements par transaction, avec reprise) car la durée d'exécution PHP est limitée sur un hébergement mutualisé ; la progression est affichée si le flux est gros.
- **Synchronisation (mode abonnement)** : trois déclencheurs : (a) le **planificateur Laravel**, lancé par une tâche cron du Manager (toutes les 30 min par défaut, ou la fréquence minimale autorisée) ; (b) la **synchronisation à l'ouverture** : si un agenda n'a pas été resynchronisé depuis plus de 15 minutes, l'application la déclenche ; (c) le bouton « Resynchroniser ». En cas d'erreur (401/403/404/timeout) : intervalle croissant entre les essais, statut `error` + message clair (« Le lien n'est plus valide ou a été révoqué ») affiché à côté de l'agenda.
- **Sécurité du lien** : l'URL est un **secret** (les liens Google « privés » donnent accès à l'agenda). La stocker **chiffrée** (`Crypt` de Laravel, clé `APP_KEY`), ne jamais la mettre dans les logs ni dans les messages d'erreur, ne jamais la renvoyer en clair au client après création (afficher seulement `url_host`).
- **Doublons** : si la même URL est ajoutée deux fois, proposer de mettre à jour l'existant.
- **Critères d'acceptation** :
  - Un lien ICS public d'exemple s'importe et les événements apparaissent à la bonne date et à la bonne heure (tester un fuseau différent du fuseau local).
  - Un événement récurrent hebdomadaire s'affiche chaque semaine, avec une exception (`EXDATE`) bien exclue.
  - Un événement « journée entière » reste sur le bon jour.
  - Une URL pointant vers `http://127.0.0.1` ou `http://192.168.x.x` est **refusée**.
  - Modifier l'événement dans la source puis resynchroniser met la ligne à jour sans doublon.
  - Supprimer l'agenda supprime ses événements importés après confirmation.

### 6.10 Vue Tableau
- Colonnes redimensionnables et réordonnables par glisser-déposer (en-têtes). Cellules **éditables en place** (clic = édition ; Entrée valide, Échap annule, Tab passe à la cellule suivante). En-tête de colonne : menu (trier, filtrer, masquer, renommer, changer de type, supprimer). Dernière colonne « + » (en-tête, à droite) pour ajouter une propriété. **Intention** : le « + » est au bout de la rangée de colonnes, là où l'on irait naturellement en ajouter une de plus.

### 6.11 Vue Board (kanban)
- Une colonne par valeur du regroupement (par défaut Statut), cartes glissables entre colonnes (le changement de colonne **modifie la propriété** de regroupement). En-tête de colonne : nom coloré, compteur, « ⋯ », « + ». Pied de colonne : « + Nouvelle page ». Dernière colonne à droite : « + Ajouter un groupe ». Colonne « Sans statut » masquable. Cartes : titre + propriétés choisies dans « Propriétés visibles ».
- **Mécanisme** : dnd-kit avec `position` calculée par fractional indexing pour l'ordre dans la colonne ; mise à jour optimiste.

### 6.12 Recherche / palette (Ctrl+K)
- Modale centrée, champ de recherche en haut, **pages récentes** quand le champ est vide, résultats avec extrait surligné. Flèches + Entrée pour ouvrir. Recherche plein texte MariaDB (index `FULLTEXT`) sur `title` et `search_text`, avec une recherche locale instantanée sur les titres déjà chargés. **Intention** : le moyen le plus rapide de naviguer quand on a des centaines de pages.

### 6.13 Corbeille et historique
- Supprimer = `deleted_at` (suppression douce). Corbeille accessible depuis la sidebar, restauration en un clic, purge définitive après 30 jours. Historique de versions : snapshot des blocs d'une page toutes les N minutes de modification (phase avancée).

### 6.14 Raccourcis clavier (minimum)

`Ctrl` sur Windows/Linux, `Cmd` sur macOS (décidé à un seul endroit, voir 1.6). Sur mobile : pas de raccourcis, chaque action doit avoir un équivalent tactile.
`/` menu blocs · Ctrl+K recherche · Ctrl+N nouvelle page · Ctrl+\ masquer sidebar · Ctrl+Z / Ctrl+Maj+Z annuler/rétablir · Tab / Maj+Tab indenter · Échap sélectionner le bloc · Ctrl+/ aide des raccourcis. Dans le calendrier : `D` jour, `W` semaine, `M` mois, `T` aujourd'hui.

### 6.15 Agenda unifié et synchronisation (Nonotion, ICS, Google, iCloud) : phase 9

**Cahier des charges fourni** (texte d'origine, chaque « Notion » remplacé par « Nonotion ») :

```markdown
# Role & Context
You are an expert full-stack systems architect and UI/UX designer. Your task is to expand an existing productivity application's calendar module to support multi-source data ingestion and synchronization:
1. **Nonotion Tasks-to-Calendar Sync:** Importing dated database items from Nonotion pages into the core calendar grid.
2. **ICS File/URL Subscriptions:** Parsing and rendering external `.ics` calendar feeds.
3. **External Account Integration (Google / Apple):** Supporting both direct OAuth bidirectional sync and ICS fallback links.

Below is the detailed technical specification and UX intent required for implementation.

---

## Module 1: Nonotion Database Task Sync
- **Backend Sync Engine:** Implement a polling or webhook listener connected to the Nonotion API to fetch pages/database items containing date properties.
- **UI Mapping & Rendering:**
  - Provide a settings interface where users can select specific Nonotion databases to sync.
  - Render Nonotion tasks on the calendar grid with a distinct visual tag (e.g., a small Nonotion icon badge) to differentiate them from standard meetings.
  - Support inline status toggling (e.g., checking off a task in the calendar updates its status/checkbox in Nonotion instantly).

## Module 2: ICS Feed Import & Management
- **Parser Implementation:** Build a robust `.ics` parser (handling recurring events, timezones, and summary/description fields) that takes a remote URL input.
- **Caching & Refresh Strategy:** Schedule periodic background background jobs to re-fetch and update ICS feeds without blocking the main UI thread.
- **UI Integration:** Add a "Subscribed Calendars" section in the settings sidebar allowing users to add, color-code, or toggle the visibility of external ICS feeds.

## Module 3: Google & Apple Calendar Integration (OAuth & ICS)
- **Dual-Path Connection Flow:**
  - *Path A (OAuth 2.0 / CalDAV):* Establish direct bidirectional sync with Google Calendar and Apple (iCloud) accounts. Handle token refreshes and real-time event updates.
  - *Path B (ICS Alternative):* Allow users to paste a private calendar link (e.g., Apple iCloud webcal link) for read-only ingestion.
- **Unified Grid View:** Ensure the calendar state manager merges events from local sources, Nonotion, ICS feeds, and external accounts smoothly, resolving overlapping conflicts gracefully.

---

## Deliverables Expected
1. **Data Schema & State Architecture:** Database models and state management logic to handle multi-source event synchronization.
2. **API Integration Services:** Modular service layers for Nonotion API, ICS parsing, and Google/Apple calendar connectors.
3. **UI Components:** Settings views for managing integrations, visual badge indicators for event sources, and unified calendar grid rendering.
```

**Mise en œuvre dans Nonotion** (proposée par Claude Code au moment d'ajouter la phase, à valider au début de la phase 9) :

- **Rôle** : voir **toute sa semaine au même endroit** : les tâches et éléments datés de ses bases Nonotion, les agendas abonnés par lien, et ses agendas Google et iCloud, modifiables d'un côté comme de l'autre.
- **Ce que « Nonotion » veut dire ici** : les bases de Nonotion sont déjà dans notre API ; il n'y a donc pas de service extérieur à interroger pour le module 1. Le « moteur de synchronisation » rassemble les lignes datées des bases choisies (`GET /api/workspaces/{id}/agenda?from=…&to=…`), rafraîchi comme le reste (spec 1.3.6 : toutes les 60 s quand l'application est visible, et à l'ouverture).
- **Emplacement** : une page **« Agenda »** de l'espace de travail, entrée fixe de la barre latérale (sous « Accueil »), adresse `/agenda`. Même grille que la vue Calendrier d'une base (6.8 : mois, semaine, jour, raccourcis D W M T, glisser-déposer), mais nourrie par plusieurs sources. Les vues Calendrier de chaque base restent ce qu'elles sont.
- **Réglages « Mes agendas »** (panneau gauche de l'Agenda, repliable ; sur téléphone, sous la grille), en trois groupes, chacun avec case « afficher » et pastille de couleur :
  1. **Bases Nonotion** : chaque base qui a une propriété Date ; on coche celles à afficher.
  2. **Agendas abonnés (ICS)** : ajouter (le panneau de 6.9), couleur, afficher/masquer, resynchroniser, supprimer : la gestion de 6.9, à l'échelle de l'espace de travail.
  3. **Comptes connectés** : « Connecter Google Agenda », « Connecter iCloud » ; pour chaque compte, ses agendas (lesquels synchroniser, couleur, base où ranger les événements), l'état (« Synchronisé il y a 2 min », erreur claire), « Déconnecter ».
- **Pastille de source** : chaque élément de la grille porte une petite icône : Nonotion (l'icône de l'application) pour une ligne de base, lien pour un agenda ICS, Google, iCloud ; au survol, le nom de la base ou de l'agenda. Intention : savoir d'un coup d'œil d'où vient un élément, sans lire.
- **Case de statut dans la grille** : un élément d'une base qui a un Statut ou une Case à cocher montre une case ; la cocher le passe dans le groupe « Terminé » (ou coche la case), tout de suite à l'écran (mise à jour optimiste), avec la répétition de 6.7 (la fois suivante est créée). Intention : traiter sa journée depuis l'Agenda, sans ouvrir chaque tâche.
- **Chevauchements** : en Semaine et Jour, deux éléments qui se recouvrent s'affichent **côte à côte** (colonnes réparties), jamais l'un sur l'autre ; en Mois, ordre stable (journées entières, puis par heure, puis par source) et « +N » quand la case est pleine. Le **même** événement venu de deux sources (par exemple Google et son lien ICS) est reconnu à son UID iCalendar et n'apparaît qu'une fois.
- **Où vivent les événements Google et iCloud** : comme ceux d'un ICS (6.9), ce sont des **lignes d'une base** (P1 : un événement est une page), choisie à la connexion (« Nouvelle base d'événements » par défaut). Ils profitent de tout le reste : vues, recherche, propriétés à soi (notes, étiquettes) qui ne partent pas chez Google.
- **Modèle de données** (migrations) :
  - `calendar_accounts(id, workspace_id, provider 'google'|'icloud', account_email, credentials_encrypted, status, error_message, last_sync_at)` : pour Google, le jeton de rafraîchissement ; pour iCloud, l'identifiant Apple et le mot de passe pour application. Chiffrés avec `Crypt` (APP_KEY), jamais renvoyés au client ni journalisés.
  - `calendar_sources` gagne `kind` ('ics'|'google'|'icloud'), `account_id`, `remote_id` (identifiant d'agenda Google, adresse CalDAV), `sync_token`, `writable`, `push_channel_id`, `push_expires_at`.
  - `pages` gagne, pour les événements synchronisés, `remote_href` (CalDAV), `remote_etag`, `remote_updated_at` : ce qu'on sait de la version distante.
  - `workspaces.agenda` (JSON) : les bases affichées dans l'Agenda, leurs couleurs, les agendas masqués.
- **Services de l'API, un par source** : une interface `CalendarConnector` (`listCalendars`, `pullChanges`, `pushEvent`, `deleteEvent`) et trois implémentations : `IcsConnector` (l'existant de 6.9, lecture seule), `GoogleConnector` (API Google Calendar v3 : `events.list` avec `syncToken`, `insert`, `patch`, `delete`, `watch`), `CalDavConnector` (iCloud : `PROPFIND`, `REPORT sync-collection` (RFC 6578), `PUT` et `DELETE` avec `If-Match`). Un moteur commun (`CalendarSync`) fait l'upsert, les suppressions et les conflits, pour les trois.
- **Connexion des comptes (chemin A)** :
  - **Google** : OAuth 2.0 côté serveur (flux « code d'autorisation », client confidentiel). « Connecter Google Agenda » ouvre la page de Google (dans le navigateur du système pour l'application de bureau) ; le retour arrive sur l'API (`/api/integrations/google/callback`), qui garde le jeton chiffré ; l'application voit le compte apparaître. Portées : `calendar.events` et `calendar.calendarlist.readonly`. Le jeton d'accès (1 h) est rafraîchi tout seul ; un jeton refusé met le compte en erreur avec « Reconnecter ».
  - **iCloud** : Apple n'a pas d'OAuth pour l'agenda ; CalDAV (`caldav.icloud.com`) avec l'identifiant Apple et un **mot de passe pour application** (créé sur account.apple.com, double authentification obligatoire), tapé par l'utilisateur dans Nonotion. Un refus (401) dit : « Ce mot de passe pour application a été révoqué (il l'est aussi quand on change le mot de passe de l'identifiant Apple) ».
  - **Chemin B (ICS)** : inchangé (6.9), en lecture seule.
- **Synchronisation dans les deux sens** :
  - **De Google ou iCloud vers Nonotion** : changements incrémentaux seulement (`syncToken` de Google, `sync-token` CalDAV), par lots, avec reprise. Déclencheurs : à l'ouverture de l'Agenda (si plus de 2 min), le webcron (15 min), « Resynchroniser », et pour Google les **notifications** (`POST /api/webhooks/google`, vérifiées par le jeton du canal, renouvelées avant expiration) si Google les accepte pour le domaine ; sinon, les autres déclencheurs suffisent.
  - **De Nonotion vers Google ou iCloud** : une modification d'un événement synchronisé (titre, dates, lieu, description) part juste après la réponse au navigateur (`afterResponse` de Laravel : pas de file d'attente permanente sur l'hébergement mutualisé), avec `If-Match` (ETag). Un élément créé dans la base d'un agenda, ou dans l'Agenda sur cet agenda, est créé chez Google ou Apple. Mis à la corbeille : supprimé chez eux ; restauré : recréé.
  - **Conflit** (modifié des deux côtés depuis la dernière synchronisation) : la version la plus récente gagne ; l'autre reste dans l'historique de la page (6.13) et un avertissement discret le signale. Jamais de doublon : clé (agenda, UID, RECURRENCE-ID), comme en 6.9.
  - **Récurrences** : une occurrence modifiée dans Nonotion devient une exception de la série (instance Google, `RECURRENCE-ID` CalDAV). Modifier toute la série se fait chez Google ou Apple (première version). Une tâche qui se répète à la manière de 6.7 part comme des événements simples, une fois après l'autre.
- **Sécurité** : jetons et mots de passe chiffrés (la sauvegarde d'APP_KEY devient indispensable : sans elle, il faut reconnecter les comptes) ; seuls les hôtes de Google et d'iCloud sont joints pour ces comptes ; déconnecter révoque le jeton chez Google et efface les identifiants ; isolation par espace de travail et test qui le prouve ; journaux sans aucun secret.
- **Prérequis de ton côté** (aucun ne peut être fait à ta place) :
  1. Un projet Google Cloud (gratuit) avec l'API Google Calendar activée et un écran de consentement « Externe » **publié en production**. En « Test », Google fait expirer les jetons au bout de 7 jours. Tant que Google n'a pas validé l'application, sa page de connexion avertit (« Google n'a pas validé cette application » ; on continue par « Paramètres avancés ») et la limite est de 100 utilisateurs : sans importance pour un usage personnel. La validation pourra se faire plus tard (page d'accueil, politique de confidentialité).
  2. Des identifiants OAuth « Application Web » avec l'adresse de retour `https://nonotion.thomasvandoren.be/api/integrations/google/callback` ; `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans le `.env` du serveur (tu l'édites toi-même).
  3. Peut-être, pour les notifications instantanées, la validation du domaine dans Google Search Console (à confirmer en début de phase).
  4. iCloud : rien à préparer ; un mot de passe pour application au moment de connecter.
- **Critères d'acceptation** (Google et iCloud sont testés contre de faux serveurs dans les tests automatiques ; le dernier critère se fait avec tes vrais comptes) :
  - L'Agenda montre les éléments datés des bases cochées, avec leur pastille Nonotion ; décocher une base les retire ; recharger garde le choix.
  - Cocher la case d'une tâche dans l'Agenda la passe à « Terminé » et crée la fois suivante si elle se répète ; recharger : c'est gardé.
  - Un agenda ICS ajouté depuis « Mes agendas » apparaît avec sa couleur ; le masquer le cache ; changer sa couleur la change partout.
  - Google : connecter, choisir un agenda, ses événements apparaissent ; modifier un événement dans Nonotion le modifie chez Google ; le modifier chez Google le met à jour dans Nonotion sans doublon ; créer et supprimer dans Nonotion crée et supprime chez Google ; un jeton expiré est rafraîchi, un jeton révoqué demande de reconnecter.
  - iCloud : les mêmes parcours ; un mot de passe refusé donne un message clair.
  - Modifié des deux côtés : la version la plus récente gagne, l'autre est dans l'historique.
  - En Semaine, deux éléments qui se recouvrent sont côte à côte ; le même événement venu de deux sources n'apparaît qu'une fois.
  - Un autre utilisateur ne voit ni les comptes ni les événements ; aucune réponse de l'API ne contient de jeton ou de mot de passe.
  - Avec tes vrais comptes : Google Agenda et iCloud connectés, un événement créé de chaque côté apparaît de l'autre.

### 6.16 Hors ligne et gestion des conflits (applications natives) : phase 11

**Demande** (14 novembre, mot pour mot) : « Il faut que quand j'utilise une application native, donc Windows, Mac OS, iOS, Android ou Linux, et que je n'ai pas de connexion Internet, les changements se fassent en local et puis quand la connexion est retrouvée, se fasse en synchronisation avec le serveur. Si il y a un conflit avec le serveur il faut proposer l'option actuelle "Ecraser avec ma version" ou "Recharger" et aussi rajouter la possibilité d'ouvrir le mode "Gestion de conflit". Dans ce mode "Gestion de conflit" où on peut voir les deux versions et on peut choisir encore "Ecraser avec ma version" ou "Recharger". »

**Mise en œuvre proposée** :

- **Rôle** : continuer à écrire dans le train, en avion ou sans réseau, sans perdre une ligne ; tout repart tout seul au retour de la connexion.
- **Où** : les applications pour ordinateur (Tauri) et pour téléphone (Capacitor). Le site web ne change pas : il ne garde rien sur l'appareil (1.6.10).
- **Lecture hors ligne** : l'application garde sur l'appareil (IndexedDB de la vue web) une copie de ce qu'elle a chargé : arbre des pages, pages, bases et leurs vues, réglages de l'Agenda. Une fois en ligne, elle tient cette copie à jour pour **tout l'espace de travail** par un seul appel incrémental (`GET /api/workspaces/{id}/offline?since=…` : les pages et les bases modifiées depuis, et la liste de celles qui existent encore), au démarrage, au retour de la connexion et toutes les 5 minutes. Hors ligne, on ouvre donc n'importe quelle page.
- **Écriture hors ligne** : chaque modification s'applique tout de suite à l'écran et à la copie locale, puis entre dans une **file d'attente gardée sur l'appareil** (elle survit à la fermeture de l'application), envoyée **dans l'ordre** dès que le serveur répond. Deux modifications du même objet attendant ensemble n'en font qu'une (le dernier document d'une page, les champs d'une ligne réunis). Ce qui fonctionne hors ligne : le corps des pages, titre, icône, couverture, favori, créer, déplacer, mettre à la corbeille et restaurer une page ; créer une ligne et changer ses propriétés ; propriétés, vues, filtres et tris d'une base ; réglages de l'Agenda. Les créations hors ligne reçoivent leur identifiant (ULID) sur l'appareil ; l'API les accepte, et le même envoi répété ne crée jamais de doublon.
- **Ce qui demande une connexion** (le bouton le dit : « Indisponible hors ligne ») : envoyer un fichier, aperçu de lien, importer un agenda, connecter Google ou iCloud, publier le lien ICS d'une base, la recherche plein texte (la recherche dans les titres reste possible), créer une base de données.
- **Indicateur** : dans la barre du haut, à la place de « Enregistré » : « Hors ligne · 3 modifications en attente », puis « Synchronisation… », puis « Enregistré ». Intention : savoir sans chercher si son travail est parti.
- **Conflits** :
  - **Corps d'une page** : verrouillage optimiste (1.3.5) comme aujourd'hui. Si la page a changé sur le serveur depuis la version de départ, la fenêtre « Cette page a été modifiée ailleurs » propose **« Recharger »**, **« Écraser avec ma version »** et **« Gestion de conflit »**. Si la page n'est pas ouverte au moment de la synchronisation, le conflit est gardé et signalé (« 1 conflit à résoudre » dans la barre du haut) ; l'ouvrir mène à la page et à la fenêtre.
  - **Mode « Gestion de conflit »** : un écran qui montre **les deux versions côte à côte** (sur téléphone : l'une sous l'autre, ou par onglets « Ma version » / « Version du serveur »), en lecture seule, avec les blocs qui diffèrent surlignés (ajouté, supprimé, modifié), et les deux mêmes choix : « Écraser avec ma version » et « Recharger » (prendre la version du serveur). Intention : décider en voyant, pas à l'aveugle.
  - **Autres modifications** (titre, propriétés, vues…) : la dernière arrivée l'emporte, comme aujourd'hui entre deux appareils en ligne.
  - Une modification refusée par le serveur (objet supprimé entre-temps, valeur devenue invalide) n'est pas rejouée sans fin : elle est retirée de la file avec un message qui la nomme.
- **Sécurité** : la copie locale vit dans le dossier privé de l'application ; se déconnecter l'efface, file d'attente comprise (avec une confirmation si des modifications n'ont pas encore été envoyées).
- **Critères d'acceptation** :
  - Hors ligne, l'application ouvre une page jamais ouverte sur cet appareil (copie de l'espace de travail).
  - Hors ligne, modifier le corps et le titre d'une page, créer une page et une ligne de base, cocher une tâche : tout s'affiche ; fermer et rouvrir l'application hors ligne : tout est encore là.
  - Au retour de la connexion, tout arrive sur le serveur, dans l'ordre, sans doublon ; l'indicateur passe à « Enregistré ».
  - La même page modifiée sur un autre appareil pendant ce temps : la fenêtre propose les trois choix ; « Gestion de conflit » montre les deux versions et les différences ; chacun des deux choix donne le bon résultat sur le serveur.
  - Se déconnecter efface la copie locale.
  - Le site web garde son comportement (rien sur l'appareil).

### 6.17 Planifier (disponibilités et liens de planification) : phase 12

**Cahier des charges fourni** (texte d'origine ; il vaut pour la page Agenda) :

````markdown
# Spécification : section « Planifier » (Scheduling)

Document d'instructions pour implémenter, dans une application de type calendrier, une fonctionnalité de planification inspirée de Notion Calendar. Le texte est volontairement générique : il décrit le comportement, le modèle de données et les algorithmes, sans présupposer de langage ni de framework.

## Légende de fiabilité

- **[Doc]** : comportement documenté publiquement par Notion Calendar.
- **[Déduit]** : mécanisme que la documentation ne détaille pas, reconstruit par logique.
- **[Proposition]** : choix de conception recommandé pour une réimplémentation, non documenté par Notion.

---

## 1. Vue d'ensemble

La section « Planifier » regroupe deux fonctions complémentaires :

1. **Voir les disponibilités des autres** : saisir le nom d'une personne pour superposer son agenda au sien et repérer un créneau commun.
2. **Partager les siennes** : créer des **liens de planification** (page de réservation publique) où un invité choisit un créneau parmi les disponibilités de l'utilisateur.

Une fois un créneau réservé, l'événement apparaît automatiquement dans l'agenda de l'organisateur **[Doc]**.

### Éléments d'interface de la section (barre latérale gauche)

| Élément | Rôle |
|---|---|
| Titre « Planifier » | En-tête de section |
| Icône lien | Accès à la création et à la liste des liens de planification **[Déduit]** |
| Icône œil | Masquer ou afficher le contenu de la section **[Proposition]** : la fonction exacte n'est pas documentée |
| Champ « Entrez le nom d'une personne… » | Recherche d'une personne pour afficher son agenda en superposition |

### Raccourcis clavier associés

| Raccourci | Action |
|---|---|
| `S` | Ouvrir la gestion des liens de planification **[Doc]** |
| `P` | Afficher le calendrier d'une personne (superposition) |
| `Ctrl + K` | Palette de commandes (recherche, actions) |
| `Échap` | Fermer l'agenda d'une personne affichée en superposition **[Doc]** |

---

## 2. Fonction A : voir les disponibilités d'une personne

### 2.1 Comportement attendu

1. L'utilisateur tape un nom ou une adresse e-mail dans le champ de recherche.
2. Une liste de suggestions apparaît (personnes autorisées uniquement, voir 2.3).
3. En sélectionnant une personne, son agenda s'ajoute à la grille en superposition, dans une couleur distincte.
4. L'utilisateur repère visuellement les plages où lui et l'autre sont libres.
5. `Échap` ou la croix à côté de la personne ferme la superposition **[Doc]**.
6. Option **[Doc]** : l'agenda d'une personne peut être épinglé dans la liste de la barre latérale pour rester visible, et retiré ensuite.
7. Option **[Doc]** : glisser une personne sur la grille crée un rendez-vous en tête-à-tête, avec titre, horaire et participant préremplis, et la visioconférence ajoutée selon les préférences de l'utilisateur.

### 2.2 Principe : ne partager que « libre / occupé »

Dans Notion Calendar, voir l'agenda d'un collègue ne nécessite pas qu'il ait partagé son calendrier **[Doc]**. Mécanisme **[Déduit]** : le système lit uniquement l'information libre/occupé de la personne, jamais le titre, la description ni les participants de ses événements.

**Règle à implémenter :** la superposition affiche des blocs « Occupé » anonymes. Aucun détail d'événement ne doit être renvoyé par l'API à un autre utilisateur.

### 2.3 Qui peut voir qui ?

Dans Notion Calendar, cette fonction est liée à l'appartenance à la même organisation Google Workspace **[Doc]**. Pour une réimplémentation **[Proposition]** :

- Définir un périmètre : même espace de travail, même organisation ou contacts explicitement connectés.
- Prévoir un réglage par utilisateur : visibilité libre/occupé (tout le monde dans l'espace de travail / personne).
- La recherche ne doit jamais renvoyer des personnes hors du périmètre.

### 2.4 API suggérée

```
GET  /api/people/search?q=<texte>                     -> liste de personnes autorisées
GET  /api/people/:id/freebusy?from=<ISO>&to=<ISO>     -> [{ start, end }] (blocs occupés, UTC)
```

Le front convertit les blocs UTC dans le fuseau d'affichage de l'utilisateur.

---

## 3. Fonction B : liens de planification

### 3.1 Principe

Un lien de planification est une URL publique. Quiconque ouvre le lien voit les disponibilités de l'organisateur et choisit un créneau. Le rendez-vous est alors créé automatiquement dans l'agenda de l'organisateur **[Doc]**.

Il existe **deux types** de liens **[Doc]** :

| | Lien ponctuel (*one-off*) | Lien récurrent (*recurring*) |
|---|---|---|
| Usage typique | Rencontrer une personne précise à un moment précis | Situations fréquentes avec des personnes différentes (entretiens utilisateurs, ventes, permanences) |
| Définition des plages | Dates et heures précises, tracées sur le calendrier ou saisies | Horaires types par jour de la semaine, qui se répètent |
| Réutilisation | Option « lien à usage unique » | Plusieurs réservations possibles |
| Replanification par l'invité | Impossible si usage unique | Possible |

### 3.2 Création d'un lien : flux utilisateur **[Doc]**

1. Ouvrir « Scheduling » (raccourci `S`).
2. Choisir « Créer un lien récurrent » ou « Créer un lien ponctuel ».
3. Définir les disponibilités :
   - **Récurrent** : saisir les heures disponibles pour chaque jour de la semaine ; un bouton `+` permet d'ajouter plusieurs plages le même jour.
   - **Ponctuel** : glisser sur le calendrier pour tracer des plages, ou saisir les heures manuellement.
4. Retirer des disponibilités :
   - **Récurrent** : menu `•••` puis « Vider le jour ».
   - **Ponctuel** : menu `•••` puis « Supprimer » sur la plage.
5. Personnaliser l'URL (« Personnaliser le lien »).
6. Cliquer sur « Créer ».

### 3.3 Options d'un lien

**Documentées [Doc] :**

- Date d'expiration
- Lieu
- Lien de visioconférence
- Numéro de téléphone
- Fenêtre de réservation : délai minimum et délai maximum (par exemple : pas de réservation à moins de 24 h, ni à plus de 3 semaines)
- Description
- « Avoid conflicts » : mise à jour automatique des disponibilités selon les conflits de l'agenda
- « Autoriser plusieurs réservations »
- « Lien à usage unique » (ponctuel uniquement)

**Nécessaires mais non documentées [Proposition] :**

- **Durée du rendez-vous** (par exemple 15 / 30 / 45 / 60 min) : indispensable pour découper les plages en créneaux.
- **Pas de découpage** (intervalle entre deux débuts de créneau possibles).
- **Marge avant/après** (*buffer*) entre deux rendez-vous.
- **Agenda de destination** : dans quel agenda connecté l'événement est créé.
- **Titre** du lien et de l'événement généré.
- **Fuseau horaire de référence** du lien (important pour le récurrent).

### 3.4 Gestion des liens **[Doc]**

Dans la vue « Scheduling » (`S`), tous les liens actifs sont listés. Pour chacun :

- Icône lien : copier l'URL dans le presse-papiers.
- Menu `•••` : copier ou modifier le lien.
- **[Proposition]** : désactiver, dupliquer et supprimer un lien ; afficher le nombre de réservations.

---

## 4. Modèle de données **[Proposition]**

```
scheduling_link
  id, owner_id
  type              : 'one_off' | 'recurring'
  slug              : unique, personnalisable (URL publique)
  title, description
  duration_minutes
  slot_step_minutes
  buffer_before_minutes, buffer_after_minutes
  timezone          : fuseau IANA de référence
  target_calendar_id
  avoid_conflicts   : bool
  allow_multiple_bookings : bool
  single_use        : bool (one_off uniquement)
  min_notice_minutes, max_advance_days
  location_text, video_provider, video_url, phone
  expires_at        : nullable
  status            : 'active' | 'disabled' | 'expired' | 'consumed'
  created_at, updated_at

availability_rule            (type = recurring)
  id, link_id
  weekday           : 0..6
  start_local_time  : 'HH:MM'  (dans le fuseau du lien)
  end_local_time    : 'HH:MM'

availability_range           (type = one_off)
  id, link_id
  start_at, end_at  : UTC

booking
  id, link_id
  event_id          : événement créé dans l'agenda
  invitee_name, invitee_email
  start_at, end_at  : UTC
  status            : 'confirmed' | 'cancelled'
  manage_token_hash : hash du jeton de replanification/annulation courant
  cancel_reason     : nullable
  created_at
```

Contrainte d'unicité à prévoir pour éviter les doubles réservations (voir 6.2).

---

## 5. Génération des créneaux proposés

La page publique affiche des créneaux calculés dynamiquement, jamais stockés.

### 5.1 Algorithme

```
fonction calculer_creneaux(lien, fenetre_visible):
  1. bornes = [now + min_notice, now + max_advance] ∩ fenetre_visible
     (et avant expires_at si défini)

  2. plages_disponibles =
       si lien.type == 'recurring':
         pour chaque jour de bornes, appliquer les availability_rule du weekday,
         en interprétant les heures dans lien.timezone, puis convertir en UTC
       sinon:
         les availability_range qui intersectent bornes

  3. occupé = []
     si avoid_conflicts:
       occupé += événements de l'agenda de l'organisateur marqués « occupé »
                 (sur tous les agendas pris en compte pour la disponibilité)
     occupé += réservations confirmées de ce lien (et des autres liens du même organisateur)
     étendre chaque bloc occupé de buffer_before / buffer_after

  4. libres = plages_disponibles − occupé   (soustraction d'intervalles)

  5. créneaux = découper chaque intervalle libre en créneaux de duration_minutes,
                avec un début tous les slot_step_minutes

  6. si NON allow_multiple_bookings:
       ne garder qu'un seul créneau réservable au total
       (dès qu'une réservation existe, plus aucun créneau n'est proposé)

  7. retourner créneaux (en UTC)
```

**[Doc]** Avec « Avoid conflicts », les disponibilités se mettent à jour au fil des nouveaux conflits de l'agenda, et tant qu'il reste des plages libres, le même lien peut servir à plusieurs réservations.

### 5.2 Fuseaux horaires

- Stocker et transporter tous les instants en **UTC**.
- Pour le récurrent, stocker les règles en **heure locale + fuseau IANA** (et non en UTC) afin que « lundi 9h » reste « lundi 9h » après un changement d'heure été/hiver.
- La page publique détecte le fuseau du navigateur de l'invité, l'affiche clairement et permet de le changer.
- Les e-mails de confirmation doivent afficher l'heure dans le fuseau de chaque destinataire.

---

## 6. Page de réservation publique

### 6.1 Parcours de l'invité

1. Il ouvre `https://<domaine>/<slug>` (aucun compte requis).
2. Si le lien est expiré, désactivé ou consommé : afficher un message clair, sans proposer de créneau.
3. Il voit le titre, la description, la durée, le lieu et un calendrier de créneaux disponibles dans son fuseau.
4. Il choisit un créneau, saisit nom et e-mail (champs supplémentaires optionnels : **[Proposition]**), puis confirme.
5. Écran de confirmation + e-mail de confirmation avec invitation de calendrier (fichier `.ics`).

### 6.2 Réservation : règles critiques

Au moment de confirmer, le serveur **doit revalider** le créneau (un autre invité a pu le prendre entre-temps) :

1. Ouvrir une transaction.
2. Recalculer que le créneau est toujours libre selon l'algorithme du 5.1.
3. Créer la réservation, créer l'événement dans l'agenda cible, ajouter l'invité comme participant, générer le lien de visioconférence si configuré.
4. Si `single_use` : passer le lien à `consumed`.
5. Valider la transaction.

En cas de conflit, renvoyer une erreur « créneau plus disponible » et rafraîchir la liste.

**Protection contre la concurrence :** contrainte d'unicité ou verrou sur (organisateur, plage horaire), afin que deux requêtes simultanées ne puissent pas réserver le même créneau.

### 6.3 Protection de la page publique **[Proposition]**

- Limitation de débit (*rate limiting*) par IP sur la lecture des créneaux et sur la réservation.
- Validation côté serveur des champs et de l'e-mail.
- Ne jamais exposer, sur la page publique, les titres ou détails des événements de l'organisateur : uniquement des créneaux libres.
- Slugs non devinables par défaut (aléatoire), personnalisables à la demande.

---

## 7. Replanification et annulation

### 7.1 Comportement **[Doc]**

- Si plusieurs réservations sont autorisées, l'invité retrouve dans la **description de l'événement** de son agenda un lien « Replanifier ou annuler cet événement ».
- Il peut choisir un nouvel horaire ou annuler, avec la possibilité d'indiquer un **motif**.
- Les modifications se répercutent automatiquement dans les agendas de tous les participants.
- **Pas de replanification** pour un lien ponctuel à usage unique.
- **Sécurité :** chaque fois qu'un lien de replanification/annulation est utilisé, un **nouveau lien est généré** et ajouté à la description de l'événement.

### 7.2 Implémentation suggérée **[Proposition]**

```
GET  /manage/:token            -> affiche la réservation + créneaux disponibles
POST /manage/:token/reschedule -> { new_start }
POST /manage/:token/cancel     -> { reason? }
```

- Le jeton est aléatoire, long (≥ 128 bits), stocké **haché** en base.
- À chaque utilisation réussie (replanification ou annulation) : invalider l'ancien jeton, en générer un nouveau, mettre à jour la description de l'événement avec le nouveau lien.
- La replanification suit les mêmes règles de revalidation que la réservation initiale (6.2).
- Notifier l'organisateur et l'invité par e-mail après chaque changement.

---

## 8. Synchronisation avec l'agenda

**[Déduit]** La page de réservation lit les événements existants pour calculer la disponibilité, puis crée l'événement dans l'agenda de destination à la réservation. L'événement créé doit contenir :

- Titre, description, lieu
- Lien de visioconférence ou numéro de téléphone si configurés
- L'invité en participant (nom + e-mail)
- Le lien de gestion de la réservation (voir 7)

Les modifications ou suppressions de cet événement côté organisateur doivent être répercutées sur la réservation (statut) et notifiées à l'invité.

---

## 9. Interface : écrans à prévoir

1. **Section « Planifier » de la barre latérale** : champ de recherche de personne, icône lien, icône œil.
2. **Vue « Scheduling » (`S`)** : liste des liens actifs avec copier / modifier / désactiver, et deux boutons de création (récurrent, ponctuel).
3. **Éditeur de lien** :
   - Récurrent : une ligne par jour de la semaine, plages multiples avec `+`, `•••` → « Vider le jour ».
   - Ponctuel : sélection par glisser sur la grille du calendrier, ou saisie manuelle des heures, `•••` → « Supprimer ».
   - Panneau d'options : voir 3.3 ; champ d'URL avec « Personnaliser le lien ».
4. **Superposition d'agenda d'une personne** : calque coloré sur la grille, fermeture par `Échap`, épinglage possible.
5. **Page publique de réservation** (hors application, accessible sans connexion).
6. **Page « Replanifier ou annuler »** (accessible via jeton).

---

## 10. Cas limites à gérer

- Lien expiré, désactivé, ou à usage unique déjà consommé.
- Plage disponible entièrement couverte par des conflits (afficher « aucun créneau disponible »).
- Réservation simultanée du même créneau par deux invités.
- Changement d'heure été/hiver (règles récurrentes).
- Invité dans un fuseau très différent (affichage clair du fuseau).
- Événement de l'organisateur ajouté après la création d'un lien : le créneau disparaît (si `avoid_conflicts`).
- Réservation dont l'événement a été supprimé manuellement par l'organisateur.
- Suppression d'un lien : les réservations existantes restent valides, seule la prise de nouveaux rendez-vous est bloquée.
- Annulation par l'invité d'un lien à usage unique : le lien ne se réactive pas, sauf choix explicite de l'organisateur.

---

## 11. Ordre d'implémentation recommandé

1. Modèle de données et calcul libre/occupé d'un utilisateur (fonction de soustraction d'intervalles, bien testée).
2. Création d'un lien **ponctuel** et page publique simple (liste de créneaux, réservation, création de l'événement).
3. Protection contre les doubles réservations (transaction + contrainte d'unicité).
4. Lien **récurrent** (règles hebdomadaires, gestion des fuseaux).
5. Options : fenêtre de réservation, expiration, lieu, visioconférence, téléphone, description, URL personnalisée.
6. « Avoid conflicts », plusieurs réservations, usage unique, marges.
7. Replanification / annulation avec rotation des jetons.
8. Vue de gestion des liens (`S`) et raccourcis clavier.
9. Recherche de personne et superposition d'agenda (libre/occupé uniquement), épinglage, glisser pour créer un rendez-vous 1:1.
10. E-mails de confirmation / modification / annulation avec `.ics`.

---

## 12. Critères d'acceptation

- [ ] Je peux créer un lien ponctuel avec plusieurs plages datées et un lien récurrent avec des horaires hebdomadaires à plages multiples.
- [ ] Un invité sans compte peut réserver depuis l'URL publique et le rendez-vous apparaît dans mon agenda.
- [ ] Deux invités ne peuvent jamais réserver le même créneau, même simultanément.
- [ ] Avec « Avoid conflicts », un événement que j'ajoute à mon agenda retire les créneaux correspondants.
- [ ] Les fenêtres de réservation (délai min/max) et l'expiration sont respectées.
- [ ] Un lien à usage unique devient inutilisable après une réservation, et n'offre pas de replanification.
- [ ] L'invité peut replanifier ou annuler (avec motif) depuis l'événement, et chaque utilisation régénère un nouveau lien.
- [ ] La superposition d'une personne n'expose que des blocs « occupé » anonymes, et se ferme avec `Échap`.
- [ ] Les heures sont correctes après un changement d'heure été/hiver et pour un invité dans un autre fuseau.
- [ ] `S` ouvre la gestion des liens, `P` ouvre la recherche d'une personne.
````

**Mise en œuvre dans Nonotion** (proposée au moment d'ajouter la phase, à valider au début de la phase 12) :

- **Emplacement** : une section **« Planifier »** dans le panneau gauche de la page Agenda (6.15), sous « Mes agendas » : champ « Entrez le nom d'une personne… », icône lien (gestion des liens, raccourci `S`), icône œil (masquer ou afficher le contenu de la section). `P` place le curseur dans le champ de recherche de personne.
- **Fonction A : voir les disponibilités d'une personne** : Nonotion n'a pas d'organisation commune comme Google Workspace, et un espace de travail n'a qu'un membre. Le périmètre proposé est donc le **consentement explicite** : dans « Planifier », « Qui peut voir mes disponibilités » liste des comptes Nonotion (par adresse e-mail) ; la recherche ne trouve que les personnes qui m'ont autorisé, et seulement en blocs « Occupé » anonymes (`GET /api/people/search`, `GET /api/people/{id}/freebusy`). Épinglage et « glisser une personne pour créer un rendez-vous » : la personne devient participante de l'élément créé (son e-mail dans une propriété Personne ou E-mail).
- **Fonction B : liens de planification** : liens ponctuels et récurrents, options de 3.3 (durée, pas, marges, fenêtre de réservation, expiration, lieu, lien de visioconférence collé, téléphone, description, « éviter les conflits », plusieurs réservations, usage unique), **agenda de destination** = une base de l'Agenda (si elle est reliée à Google ou iCloud, le rendez-vous y part par la synchronisation de 6.15). Les occupations lues pour « éviter les conflits » : tout ce que montre l'Agenda (bases, agendas abonnés, Google, iCloud).
- **Page publique** : `https://nonotion.thomasvandoren.be/rdv/<slug>` (le préfixe évite toute collision avec les pages de l'application), sans compte, fuseau de l'invité détecté et modifiable ; page de gestion `/rdv/gerer/<jeton>` (replanifier, annuler avec motif, jeton haché et renouvelé à chaque usage). Protection : limitation de débit, aucun titre d'événement exposé, slugs aléatoires par défaut.
- **Réservation** : transaction avec verrou sur l'organisateur (`SELECT … FOR UPDATE`) et revalidation du créneau (6.2 du cahier) ; l'élément créé contient titre, description, lieu, visioconférence ou téléphone, l'invité, et le lien de gestion.
- **E-mails** (envoi par l'hébergement, qui fonctionne depuis le 8 novembre) : confirmation, modification, annulation, à l'organisateur et à l'invité, avec le fichier `.ics` et l'heure dans le fuseau de chacun.
- **Modèle de données** : celui du 4 du cahier (`scheduling_links`, `availability_rules`, `availability_ranges`, `bookings`), plus `freebusy_shares(owner_id, viewer_id)` pour la fonction A.
- **Critères d'acceptation** : ceux du 12 du cahier.

---

## 7. Design system

### Jetons de couleur (variables CSS ; thème clair par défaut, sombre via `prefers-color-scheme` + bascule manuelle)

| Jeton | Clair | Sombre |
|---|---|---|
| `--bg` | `#FFFFFF` | `#191919` |
| `--bg-sidebar` | `#F7F7F5` | `#202020` |
| `--text` | `#37352F` | `#EBEBEA` |
| `--text-muted` | `#787774` | `#9B9B9B` |
| `--border` | `#E9E9E7` | `#2F2F2F` |
| `--hover` | `#EFEFED` | `#2B2B2B` |
| `--accent` | `#2383E2` | `#2383E2` |

Couleurs de texte/fond des blocs et des pastilles de Select : 10 teintes (gris, marron, orange, jaune, vert, bleu, violet, rose, rouge, défaut). Une pastille = fond pastel + texte de la même teinte plus foncée, rayon 3 px.

### Typographie et espacements
- Police : `system-ui` / Inter. Corps 16 px, interligne 1.5. Titre de page 40 px gras. Titres 1/2/3 : 30 / 24 / 20 px. Option Serif et Mono par page.
- Rayons 3–6 px. Menus et modales : fond `--bg`, bordure `--border`, ombre douce, items de ~28–32 px de haut avec icône à gauche et raccourci en gris à droite.
- États : survol = `--hover` ; sélection de bloc = bleu translucide ; focus = anneau bleu 2 px (obligatoire pour l'accessibilité).

### Responsive
Sous ~768 px : la sidebar devient un tiroir ; les contrôles « au survol » deviennent visibles en permanence ou au tap ; barre de formatage collée au-dessus du clavier.

---

## 8. Qualité, sécurité, performance

- **Accessibilité** : navigation clavier complète, rôles ARIA sur menus/dialogues, contraste suffisant, focus visible.
- **Performance** : virtualiser les longues listes (tableaux > 200 lignes), charger les blocs d'une page à l'ouverture seulement, debounce de sauvegarde.
- **Sécurité** : isolation des données par workspace (portée globale + Policies Laravel) **avec un test automatique qui prouve qu'un utilisateur ne peut pas lire ni modifier les données d'un autre**, validation de toutes les entrées côté serveur (Form Requests Laravel), requêtes préparées (pas de SQL concaténé), échappement du contenu rendu, limitation des tentatives de connexion, protection SSRF (6.9), liens d'agenda chiffrés, fichier `.env` jamais versionné.
- **Tests** : un test par critère d'acceptation listé ci-dessus ; **Pest** pour l'API (isolation, verrouillage optimiste 409, import ICS avec le fichier `fixtures/sample.ics`) ; Playwright (Chromium, WebKit, Firefox) pour les parcours : créer une page → ajouter une to-do → créer une base de tâches → voir la tâche dans le calendrier → importer un ICS.
- **Données de démonstration** : un script `seed` qui crée un workspace avec quelques pages, une base de tâches et un fichier ICS d'exemple (`fixtures/sample.ics`, avec un événement récurrent, un événement journée entière et un fuseau différent).

---

## 9. Feuille de route par phases (arrête-toi à la fin de chaque phase)

| Phase | Contenu | Terminé quand |
|---|---|---|
| **0** | Plan, arborescence du monorepo, outillage (lint, tests), squelette Laravel + MariaDB en local, migrations, `DECISIONS.md`, **test de déploiement sur mon hébergement Infomaniak (1.8)** | Le projet démarre en local, un test passe, et la page « Bonjour » + `GET /api/health` fonctionnent sur mon domaine |
| **1** | Comptes (Laravel Sanctum, réinitialisation par e-mail), layout (sidebar, barre du haut, canvas), arbre de pages (créer, renommer, glisser-déposer, favoris, corbeille), titre/icône/couverture | Critères 6.1 et 6.2 validés |
| **2** | Éditeur de blocs : paragraphes, titres, listes, to-do, citation, séparateur, code, callout, toggle ; slash menu ; Markdown ; poignée et glisser-déposer ; barre flottante ; sauvegarde auto | Critères 6.3 validés |
| **3** | Bases de données : propriétés (types prioritaires), vue Tableau, ligne = page, peek, onglets de vues, filtre/tri/regroupement, « Nouveau », lignes « + » | Critères 6.4 à 6.6 et 6.10 validés |
| **4** | Base « Tâches » (modèle), case de complétion, vue Board, vue Liste, récurrence simple | Critères 6.7 et 6.11 validés |
| **5** | Vue Calendrier (mois/semaine), création au « + » de case, glisser-déposer des dates, « Sans date », fuseaux | Critères 6.8 validés |
| **6** | **Import ICS** (prévisualisation, import, abonnement, resynchronisation, récurrences, SSRF, chiffrement, cron et synchronisation à l'ouverture) | Critères 6.9 validés |
| **7** | Recherche Ctrl+K, raccourcis, thème sombre, responsive | 6.12 et 6.14 validés |
| **8** | **Applications desktop** : emballage Tauri 2 (Windows, macOS, Linux), couche `platform/`, mises à jour, signature | Application installable et fonctionnelle sur les 3 systèmes |
| **9** | **Agenda unifié et synchronisation** : page Agenda de l'espace (bases Nonotion, agendas ICS, Google, iCloud), « Mes agendas », pastilles de source, case de statut, synchronisation dans les deux sens avec Google (OAuth 2.0) et iCloud (CalDAV), conflits, chevauchements | Critères 6.15 validés |
| **10** | **Applications mobiles** : emballage Capacitor (iOS, Android), interface tactile (appui long, zones sûres), notifications de rappel des tâches | Application installée sur un vrai téléphone, parcours complet validé |
| **11** | **Hors ligne et conflits** (applications natives) : copie locale de l'espace de travail, modifications en file d'attente synchronisées au retour de la connexion, mode « Gestion de conflit » | Critères 6.16 validés |
| **12** | **Planifier** (page Agenda) : disponibilités d'une personne (libre/occupé), liens de planification ponctuels et récurrents, page publique de réservation, replanification et annulation, e-mails | Critères 6.17 validés |
| **13** | (Plus tard) Relations/rollups/formules, partage et permissions, commentaires ; le temps réel collaboratif demandera un serveur hors hébergement mutualisé | À définir ensemble |

**Test précoce obligatoire** : à la fin de la phase 2, construis un **build Capacitor minimal** contenant seulement l'éditeur et installe-le sur un vrai téléphone, pour détecter tôt les problèmes de clavier et de sélection de texte. Fais pareil sur Linux avec Tauri. Ne découvre pas ces problèmes en phase 10.

---

## 10. Première instruction

Commence par la **phase 0** :
1. Résume en 10 lignes ta compréhension du projet et des principes P1 à P8.
2. Propose l'arborescence du monorepo et les dépendances exactes, avec leurs versions (vérifie la licence de chaque paquet : aucun `@blocknote/xl-*`). Liste-moi aussi les **points à vérifier dans mon Manager Infomaniak** (version de PHP, version de MariaDB, accès SSH, Composer, dossier racine du site, tâche cron, connexions sortantes).
3. Liste les 3 décisions techniques qui te semblent les plus risquées et ce que tu recommandes.
4. Attends mon accord avant de créer le moindre fichier.
