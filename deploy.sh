#!/usr/bin/env bash
# Déploiement de Nonotion sur l'hébergement mutualisé Infomaniak (spec 1.8).
#
# Usage : ./deploy.sh [--check]
# Les réglages viennent de deploy.env (non versionné, voir deploy.env.example) ou de l'environnement :
#   DEPLOY_HOST, DEPLOY_USER : accès SSH
#   DEPLOY_PATH : dossier du code Laravel sur le serveur (relatif au dossier personnel, ou absolu).
#                 La racine web du site doit pointer sur DEPLOY_PATH/public.
#   DEPLOY_URL  : adresse publique du site
# Facultatif : DEPLOY_PORT (22), DEPLOY_SSH_KEY (~/.ssh/nonotion_deploy), REMOTE_PHP (php), REMOTE_COMPOSER (composer),
#              DB_HOST, DB_DATABASE, DB_USERNAME (pré-remplis dans le .env du premier déploiement ; jamais le mot de passe).
# --check : lance aussi « php artisan nonotion:hosting-check » sur le serveur (phase 0).
#
# L'accès SSH se fait par clé : le script ne demande ni ne stocke aucun mot de passe.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
[[ -f "$ROOT/deploy.env" ]] && source "$ROOT/deploy.env"

: "${DEPLOY_HOST:?DEPLOY_HOST manquant (hôte SSH)}"
: "${DEPLOY_USER:?DEPLOY_USER manquant (utilisateur SSH)}"
: "${DEPLOY_PATH:?DEPLOY_PATH manquant (dossier Laravel sur le serveur)}"
: "${DEPLOY_URL:?DEPLOY_URL manquant (adresse publique, ex. https://nonotion.example.com)}"
DEPLOY_URL="${DEPLOY_URL%/}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/nonotion_deploy}"
REMOTE_PHP="${REMOTE_PHP:-php}"
REMOTE_COMPOSER="${REMOTE_COMPOSER:-composer}"
RUN_CHECK=false
[[ "${1:-}" == "--check" ]] && RUN_CHECK=true

API="$ROOT/apps/api"
DIST="$ROOT/apps/web/dist"
SSH=(ssh -p "$DEPLOY_PORT" -o BatchMode=yes)
[[ -f "$DEPLOY_SSH_KEY" ]] && SSH+=(-i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes)
SSH+=("$DEPLOY_USER@$DEPLOY_HOST")

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

step "3/5 Vérification du dossier racine, puis envoi sur $DEPLOY_HOST:$DEPLOY_PATH"
# Si la racine web n'était pas public/, le code Laravel (et plus tard le .env) serait lisible sur internet.
marker="nonotion-root-check-$RANDOM$RANDOM.txt"
"${SSH[@]}" "mkdir -p '$DEPLOY_PATH/public' && echo ok > '$DEPLOY_PATH/public/$marker'"
root_status="$(curl -s -o /dev/null -w '%{http_code}' "$DEPLOY_URL/$marker")"
"${SSH[@]}" "rm -f '$DEPLOY_PATH/public/$marker'"
if [[ "$root_status" != "200" ]]; then
  echo "ERREUR : $DEPLOY_URL/$marker renvoie HTTP $root_status." >&2
  echo "Dans le Manager, le dossier racine du site doit pointer sur $DEPLOY_PATH/public. Rien n'a été envoyé." >&2
  exit 1
fi
echo "  la racine du site pointe bien sur public/"

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
mkdir -p storage/app/public storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache public/uploads public/downloads
$REMOTE_COMPOSER install --no-dev --optimize-autoloader --no-interaction
if [ ! -f .env ]; then
  # Premier déploiement : .env préparé avec l'adresse du site et une APP_KEY générée sur le serveur.
  # Les identifiants de la base restent à saisir à la main : ils ne passent jamais par ce script.
  cp .env.production.example .env
  chmod 600 .env
  sed -i "s#^APP_URL=.*#APP_URL=$DEPLOY_URL#; s#^FRONTEND_URL=.*#FRONTEND_URL=$DEPLOY_URL#" .env
  sed -i "s#^DB_HOST=.*#DB_HOST=${DB_HOST:-}#; s#^DB_DATABASE=.*#DB_DATABASE=${DB_DATABASE:-}#; s#^DB_USERNAME=.*#DB_USERNAME=${DB_USERNAME:-}#" .env
  $REMOTE_PHP artisan key:generate --force
  echo "ACTION : .env créé dans $DEPLOY_PATH. Complète DB_PASSWORD (et vérifie DB_HOST, DB_DATABASE, DB_USERNAME ; MAIL_* en phase 1)," >&2
  echo "sauvegarde la ligne APP_KEY hors du serveur, puis relance ./deploy.sh --check." >&2
  exit 2
fi
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
