#!/usr/bin/env bash
# Essai de démarrage sur un émulateur Android (CI, workflow « Applications mobiles ») : installe
# l'APK, lance Nonotion et attend l'écran de connexion, lu dans l'arbre d'accessibilité (la vue
# web y expose son contenu). Laisse une capture d'écran dans le dossier donné.
set -euo pipefail
APK="$1"
OUT="${2:-capture}"
mkdir -p "$OUT"

adb install -r "$APK"
adb shell am start -W -n be.thomasvandoren.nonotion/.MainActivity

for _ in $(seq 1 30); do
  sleep 3
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 || continue
  adb pull /sdcard/ui.xml "$OUT/ui.xml" > /dev/null
  if grep -q 'Se connecter' "$OUT/ui.xml"; then
    adb exec-out screencap -p > "$OUT/android.png"
    echo "Écran de connexion affiché."
    exit 0
  fi
done

adb exec-out screencap -p > "$OUT/android.png" || true
adb logcat -d | grep -iE 'capacitor|chromium|console' | tail -100 || true
echo "L'écran de connexion ne s'est pas affiché." >&2
exit 1
