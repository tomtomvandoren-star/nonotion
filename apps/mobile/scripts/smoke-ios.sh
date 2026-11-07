#!/usr/bin/env bash
# Essai de démarrage sur un simulateur iOS (CI, workflow « Applications mobiles ») : installe
# l'application, la lance et vérifie qu'elle tourne encore après 20 secondes. Laisse une capture
# d'écran (l'écran de connexion) dans le dossier donné.
set -euo pipefail
APP="$1"
OUT="${2:-capture}"
BUNDLE=be.thomasvandoren.nonotion
mkdir -p "$OUT"

# Un iPhone du système iOS le plus récent installé.
UDID=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
print(next(d["udid"] for runtime in sorted(devices, reverse=True) if "iOS" in runtime
           for d in devices[runtime] if d["name"].startswith("iPhone")))')

xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID"
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" "$BUNDLE"
sleep 20
xcrun simctl io "$UDID" screenshot "$OUT/ios.png"

if ! xcrun simctl spawn "$UDID" launchctl list | grep -q "$BUNDLE"; then
  echo "Nonotion s'est arrêté au démarrage." >&2
  exit 1
fi
echo "Nonotion tourne sur le simulateur."
