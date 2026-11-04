# Mobile (Capacitor)

Emballage Capacitor du front `apps/web` pour iOS et Android : phase 9.

## Test précoce de la phase 2 : l'éditeur sur un vrai téléphone Android

Pour l'instant, l'application ne contient que le **bac à sable de l'éditeur** (`apps/web/sandbox.html`,
sans compte ni serveur) : il sert à repérer tôt les soucis de clavier et de sélection dans la vue
web Android (spec 9).

L'APK est construit par GitHub Actions (workflow « Builds natifs de test »), car il faut Java 21 et
le SDK Android. Le projet Android (`android/`) y est généré par `cap add android` ; il sera versionné
en phase 9, quand l'application complète sera emballée.

Pour le construire soi-même (Java 21 et SDK Android installés) :

```bash
pnpm --filter @nonotion/web build:sandbox
cd apps/mobile
pnpm add:android        # une seule fois
pnpm sync:android
cd android && ./gradlew assembleDebug
```

L'APK de test est dans `android/app/build/outputs/apk/debug/app-debug.apk`.
