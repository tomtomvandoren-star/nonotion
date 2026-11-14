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
  # Une application du système de l'émulateur qui ne répond pas (« Pixel Launcher isn't
  # responding ») cache l'écran : on touche « Wait », comme on le ferait, et on relance Nonotion.
  if grep -q "isn't responding" "$OUT/ui.xml"; then
    # bounds="[x1,y1][x2,y2]" du bouton « Wait » devient « x1 y1 x2 y2 ».
    bounds="$(grep -o 'text="Wait"[^>]*bounds="[^"]*"' "$OUT/ui.xml" | grep -o 'bounds="[^"]*"' \
      | head -1 | sed 's/bounds="//; s/"$//; s/\]\[/,/; s/[][]//g; s/,/ /g' || true)"
    if [ -n "$bounds" ]; then
      read -r x1 y1 x2 y2 <<<"$bounds"
      echo "Fenêtre système « ne répond pas » : on attend."
      adb shell input tap $(((x1 + x2) / 2)) $(((y1 + y2) / 2)) || true
    else
      adb shell input keyevent KEYCODE_BACK || true
    fi
    adb shell am start -W -n be.thomasvandoren.nonotion/.MainActivity > /dev/null || true
  fi
done

adb exec-out screencap -p > "$OUT/android.png" || true
adb logcat -d | grep -iE 'capacitor|chromium|console' | tail -100 || true
echo "L'écran de connexion ne s'est pas affiché." >&2
exit 1
