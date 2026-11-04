# Nonotion

Un espace de travail inspiré de Notion : des pages faites de blocs, des bases de données
à plusieurs vues, et un agenda qui importe des liens ICS. La spécification complète est
dans [PROMPT_CLAUDE_CODE_Nonotion.md](PROMPT_CLAUDE_CODE_Nonotion.md), les choix
techniques dans [DECISIONS.md](DECISIONS.md).

## Structure

```
apps/web/         front React + Vite (SPA, plus tard PWA, Tauri et Capacitor)
apps/api/         API Laravel 13 + MariaDB
apps/desktop/     Tauri 2 (phase 8)
apps/mobile/      Capacitor (phase 9)
packages/shared/  code TypeScript partagé (schémas Zod, moteur de vues)
e2e/              tests Playwright (Chromium, Firefox, WebKit)
deploy.sh         déploiement sur l'hébergement Infomaniak
```

## Prérequis

- Node 24 et pnpm 12.16.1 : `corepack enable` (dans un terminal administrateur), ou `npm install -g pnpm@12.16.1`
- PHP 8.4 (extensions curl, fileinfo, intl, mbstring, openssl, pdo_mysql) et Composer 2
- MariaDB (en local : celle de XAMPP)

## Démarrer en local

```bash
pnpm install
composer install --working-dir=apps/api
cp apps/api/.env.example apps/api/.env
php apps/api/artisan key:generate
php apps/api/artisan migrate
php apps/api/artisan db:seed   # compte de démonstration local (voir database/seeders)
```

Puis, dans deux terminaux :

```bash
pnpm dev:api   # API sur http://127.0.0.1:8000
pnpm dev       # front sur http://localhost:5173 (relaie /api vers l'API)
```

## Vérifier

```bash
pnpm lint        # ESLint, Prettier, Pint
pnpm typecheck
pnpm test        # Vitest et Pest (base MariaDB nonotion_test)
pnpm test:e2e    # Playwright sur les trois moteurs
```

## Déployer

Copier `deploy.env.example` en `deploy.env` et le remplir (voir l'en-tête de [deploy.sh](deploy.sh)),
puis lancer `./deploy.sh --check` pour déployer et vérifier l'hébergement (PHP, MariaDB, cron,
connexions sortantes). Au premier envoi, le script crée le `.env` du serveur et demande d'y saisir
les identifiants de la base.

Planificateur : l'hébergement mutualisé n'autorise pas `crontab`. Dans le Manager (site › Outils
avancés › Planificateur de tâches), programmer à la fréquence la plus courte proposée (toutes les
heures sur l'abonnement actuel) l'URL
`https://<domaine>/api/cron`, protégée par mot de passe avec `CRON_USER` et `CRON_PASSWORD` du `.env`
du serveur.
