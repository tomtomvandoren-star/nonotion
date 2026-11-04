# Desktop (Tauri 2)

Emballage Tauri 2 du front `apps/web` pour Windows, macOS et Linux : phase 8.

## Test précoce de la phase 2 : l'éditeur sous Linux (WebKitGTK)

Pour l'instant, l'application ne contient que le **bac à sable de l'éditeur** (`apps/web/sandbox.html`,
sans compte ni serveur). Sous Linux, Tauri affiche la page avec WebKitGTK, moins répandu que
Chromium : c'est ce qu'on vérifie tôt (spec 1.7).

GitHub Actions (workflow « Builds natifs de test ») construit l'AppImage et le paquet `.deb`, lance
l'application dans un écran virtuel et en garde une capture. Les icônes (`src-tauri/icons/`) sont
générées depuis `app-icon.svg` par `pnpm icons`.

Pour le construire soi-même sous Linux (Rust et les paquets de
[prérequis Tauri](https://v2.tauri.app/start/prerequisites/) installés) :

```bash
pnpm --filter @nonotion/web build:sandbox
cd apps/desktop
pnpm icons
pnpm build:linux
```
