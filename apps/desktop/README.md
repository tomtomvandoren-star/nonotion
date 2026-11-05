# Nonotion pour ordinateur (Tauri 2)

Le site `apps/web`, emballé pour **Windows, macOS et Linux** (phase 8). Le même code React, compilé
avec l'adresse complète de l'API (`apps/web/.env.desktop`), parle au même serveur que le site.

## Ce que l'application ajoute au site

Tout passe par la couche `apps/web/src/platform/` (spec 1.6.2) : `tauri.ts` est le seul fichier à
importer `@tauri-apps/*`, et n'est chargé que dans l'application.

| Quoi               | Comment                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jeton de connexion | Trousseau du système (crate `keyring`) : Trousseau d'accès de macOS, Gestionnaire d'identification de Windows, Secret Service sous Linux. Sans trousseau, le stockage de la vue web prend le relais. |
| Liens externes     | Navigateur du système (`tauri-plugin-opener`), y compris `webcal:` pour le Calendrier Apple. Un lien ne remplace jamais l'application dans sa fenêtre.                                               |
| Mises à jour       | `tauri-plugin-updater` : l'application propose la nouvelle version, enregistre ce qui attend, installe et redémarre. Paquets signés (clé minisign), vérifiés avant installation.                     |
| Fenêtre            | Taille et position retenues (`tauri-plugin-window-state`). Glisser-déposer laissé à la page (blocs de l'éditeur, images).                                                                            |

Le serveur admet les origines des vues web Tauri (`config/cors.php`) : `tauri://localhost` (macOS,
Linux) et `http://tauri.localhost` (Windows).

## Installateurs et essai sur les 3 systèmes

Le workflow GitHub Actions « Applications pour ordinateur » (`.github/workflows/desktop.yml`)
construit sur chaque système, **installe** comme le ferait un utilisateur, puis **lance**
l'application installée avec `NONOTION_SMOKE_TEST=1` : elle attend l'écran de connexion, note si
le trousseau et l'API répondent, et se ferme (code 0 si tout va bien).

| Système | Fichiers                                                            |
| ------- | ------------------------------------------------------------------- |
| Windows | `Nonotion_x.y.z_x64-setup.exe` (sans droits administrateur), `.msi` |
| macOS   | `Nonotion_x.y.z_universal.dmg` (Intel et Apple Silicon)             |
| Linux   | `.AppImage`, `.deb`                                                 |

## Publier une version

1. Changer `version` dans `src-tauri/tauri.conf.json` (et `Cargo.toml`).
2. Pousser, puis lancer le workflow « Applications pour ordinateur » à la main avec **publier**.
3. Il crée la version `vX.Y.Z` sur GitHub avec les installateurs et `latest.json`, que les
   applications installées lisent pour se mettre à jour.

Il faut pour cela la clé de signature des mises à jour, générée une fois par le propriétaire du dépôt :

```bash
pnpm --filter @nonotion/desktop tauri signer generate -w ~/.tauri/nonotion.key
```

- la clé **privée** (et son mot de passe) en secrets du dépôt : `TAURI_SIGNING_PRIVATE_KEY`,
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` ;
- la clé **publique** en variable du dépôt : `TAURI_UPDATER_PUBKEY`.

Perdre la clé privée, c'est ne plus pouvoir mettre à jour les applications déjà installées : la
sauvegarder comme `APP_KEY`.

## Signature des installateurs

- **Windows** : sans certificat de signature de code, SmartScreen avertit au premier lancement
  (« Informations complémentaires » puis « Exécuter quand même »).
- **macOS** : signature ad hoc seulement ; sans compte Apple Developer (environ 99 $/an) pour la
  notarisation, ouvrir la première fois par clic droit puis « Ouvrir » (ou Réglages système →
  Confidentialité et sécurité → « Ouvrir quand même »).

## Développer

Rust et les [prérequis Tauri](https://v2.tauri.app/start/prerequisites/) installés :

```bash
pnpm --filter @nonotion/desktop icons
pnpm --filter @nonotion/desktop dev
```

`tauri dev` lance le serveur Vite (qui relaie `/api` vers `php artisan serve`). `pnpm build`
construit l'application de production pour le système courant.
