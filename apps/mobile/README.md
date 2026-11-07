# Mobile (Capacitor)

Nonotion pour Android et iOS (phase 10) : le front `apps/web`, construit en mode `mobile`
(`apps/web/.env.mobile` : l'API de production), emballé par Capacitor 8. Les projets natifs
`android/` et `ios/` sont versionnés ; les fichiers que `cap sync` y copie (l'application web, la
configuration) ne le sont pas.

Ce que l'application ajoute au site (`apps/web/src/platform/capacitor.ts`) :

- la session gardée dans le coffre du téléphone (Keystore Android, trousseau iOS) ;
- les liens externes ouverts dans le navigateur intégré, le partage du système (lien ICS d'une base) ;
- le bouton Retour d'Android (page précédente, puis sortie) ;
- les **rappels des tâches** : une notification à l'heure de l'échéance d'une tâche (9 h le jour
  même pour une journée entière), pour les tâches pas faites des bases affichées dans l'Agenda,
  sur les 30 prochains jours (50 au plus). Toucher la notification ouvre la tâche.

## Android : installer l'APK sur un téléphone

L'APK est construit par GitHub Actions (workflow « Applications mobiles », il faut Java 21 et le
SDK Android) : dans le dernier passage du workflow, télécharger l'artefact **nonotion-android**,
le dézipper, copier `nonotion.apk` sur le téléphone et l'ouvrir (autoriser l'installation
d'applications de cette source). Il faut une vue web Android à jour (Chrome 111 ou plus, mise à
jour par le Play Store).

Sans clé de l'application dans les secrets du dépôt, l'APK est un APK de débogage, signé par une
clé différente à chaque construction : pour installer une nouvelle version, désinstaller d'abord
l'ancienne (les données sont sur le serveur, il suffit de se reconnecter). Avec une clé fixe, les
mises à jour s'installent par-dessus. Créer la clé (une fois, Java ou OpenSSL) et l'ajouter aux
secrets :

```bash
keytool -genkeypair -v -keystore nonotion.keystore -alias nonotion -keyalg RSA -keysize 4096 -validity 10000 -storetype pkcs12
gh secret set ANDROID_KEYSTORE_BASE64 < <(base64 -w0 nonotion.keystore)
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS --body nonotion
```

Garder `nonotion.keystore` et son mot de passe en lieu sûr, hors du dépôt : sans eux, plus de mise
à jour possible par-dessus l'application installée.

## iOS

Le workflow construit l'application pour le simulateur et la lance. Pour un vrai iPhone, il faut
un Mac avec Xcode et un compte Apple Developer (environ 99 $/an) : ouvrir `ios/App/App.xcodeproj`
(`pnpm ios`), choisir son équipe dans « Signing & Capabilities », brancher l'iPhone et lancer.

## Construire soi-même

Java 21 et le SDK Android (Android Studio), ou un Mac avec Xcode 26 pour iOS :

```bash
pnpm --filter @nonotion/mobile build     # application web + cap sync
pnpm --filter @nonotion/mobile android   # ouvre Android Studio (ou: cd android && ./gradlew assembleDebug)
pnpm --filter @nonotion/mobile ios       # ouvre Xcode
```

Les icônes viennent de `apps/desktop/app-icon.svg` : après l'avoir changé,
`pnpm --filter @nonotion/mobile icons`. L'icône adaptative d'Android
(`android/app/src/main/res/drawable/ic_launcher_foreground.xml`) et la petite icône des
notifications (`ic_stat_nonotion.xml`) sont dessinées à la main avec les mêmes formes.

L'API autorise les origines des applications (`https://localhost` sur Android,
`capacitor://localhost` sur iOS) dans `apps/api/config/cors.php`.
