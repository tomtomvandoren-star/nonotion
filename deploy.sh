#!/usr/bin/env bash
# Déploiement de Nonotion sur l'hébergement mutualisé Infomaniak (spec 1.8).
#
# Usage :
#   DEPLOY_HOST=xxxx.ftp.infomaniak.com DEPLOY_USER=xxxx \
#   DEPLOY_PATH=sites/nonotion.example.com DEPLOY_URL=https://nonotion.example.com \
#   ./deploy.sh [--check]
#
# DEPLOY_PATH : dossier du code Laravel sur le serveur (relatif au dossier personnel, ou absolu).
#               La racine web du site doit pointer sur DEPLOY_PATH/public.
# Facultatif  : DEPLOY_PORT (22), REMOTE_PHP (php), REMOTE_COMPOSER (composer).
# --check     : lance aussi « php artisan nonotion:hosting-check » sur le serveur (phase 0).
#
# L'accès SSH se fait par clé : le script ne demande ni ne stocke aucun mot de passe.
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST manquant (hôte SSH)}"
: "${DEPLOY_USER:?DEPLOY_USER manquant (utilisateur SSH)}"
: "${DEPLOY_PATH:?DEPLOY_PATH manquant (dossier Laravel sur le serveur)}"
: "${DEPLOY_URL:?DEPLOY_URL manquant (adresse publique, ex. https://nonotion.example.com)}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
REMOTE_PHP="${REMOTE_PHP:-php}"
REMOTE_COMPOSER="${REMOTE_COMPOSER:-composer}"
RUN_CHECK=false
[[ "${1:-}" == "--check" ]] && RUN_CHECK=true

ROOT="$(cd "$(dirname "$0")" && pwd)"
API="$ROOT/apps/api"
DIST="$ROOT/apps/web/dist"
SSH=(ssh -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST")

step() { printf '\n==> %s\n' "$1"; }

step "1/5 Compilation du front"
(cd "$ROOT" && pnpm build)

step "2/5 Copie du front dans apps/api/public (index.php, .htaccess, uploads/ et downloads/ préservés)"
shopt -s dotglob nullglob
for entry in "$DIST"/*; do
  name="$(basename "$entry")"
  case "$name" in
    index.php | .htaccess | uploads | downloads) echo "  ignoré : $name" ;;
    *) rm -rf "${API:?}/public/$name" && cp -R "$entry" "$API/public/$name" ;;
  esac
done
shopt -u dotglob nullglob

step "3/5 Envoi sur $DEPLOY_HOST:$DEPLOY_PATH"
# vendor/ est reconstruit sur le serveur ; .env, storage/ et les fichiers des utilisateurs n'y sont jamais écrasés.
tar -C "$API" -czf - \
  --exclude=./.env \
  --exclude=./vendor \
  --exclude=./node_modules \
  --exclude=./storage \
  --exclude=./tests \
  --exclude=./.phpunit.cache \
  --exclude='./bootstrap/cache/*.php' \
  --exclude='./public/uploads/*' \
  --exclude='./public/downloads/*' \
  . | "${SSH[@]}" "mkdir -p '$DEPLOY_PATH' && tar -xzf - -C '$DEPLOY_PATH'"

step "4/5 Installation et migrations sur le serveur"
"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
cd '$DEPLOY_PATH'
if [ ! -f .env ]; then
  echo "ERREUR : .env absent sur le serveur. Crée-le à partir de .env.production.example, puis lance « $REMOTE_PHP artisan key:generate »." >&2
  exit 1
fi
mkdir -p storage/app/public storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache public/uploads public/downloads
$REMOTE_COMPOSER install --no-dev --optimize-autoloader --no-interaction
$REMOTE_PHP artisan migrate --force
$REMOTE_PHP artisan config:cache
$REMOTE_PHP artisan route:cache
if $RUN_CHECK; then
  $REMOTE_PHP artisan nonotion:hosting-check
fi
REMOTE

step "5/5 Vérification de $DEPLOY_URL"
health="$(curl -fsS "$DEPLOY_URL/api/health")"
echo "  /api/health : $health"
grep -q '"status":"ok"' <<<"$health"

# Une route de la SPA doit renvoyer index.html (règle 3 du .htaccess), pas une 404.
curl -fsS "$DEPLOY_URL/p/verification-deploiement" | grep -q 'id="root"'
echo "  routes de la SPA : ok"

printf '\nDéploiement terminé.\n'
