#!/usr/bin/env bash
# Compile les binaires signés d'une version (appelé par semantic-release, étape « prepare ») :
#   release/voidpulse-vX.Y.Z.apk          flavor github (mises à jour in-app)
#   release/voidpulse-vX.Y.Z.apk.sha256   empreinte (« <hex>  <fichier> »)
#   release/voidpulse-vX.Y.Z.aab          flavor play (Google Play)
# Secrets requis : ANDROID_KEYSTORE_BASE64 (ou ANDROID_KEYSTORE_PATH), ANDROID_KEYSTORE_PASSWORD,
# ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD. Toujours le même keystore : sinon les mises à jour
# ne s'installent plus par-dessus la version existante.
set -euo pipefail

VERSION="${1:?usage: build-android.sh <version>}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/release"
cd "$ROOT"

for v in ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
  if [ -z "${!v:-}" ]; then
    echo "::error::Secret $v manquant : impossible de signer la version $VERSION." >&2
    exit 1
  fi
done

if [ -z "${ANDROID_KEYSTORE_PATH:-}" ]; then
  if [ -z "${ANDROID_KEYSTORE_BASE64:-}" ]; then
    echo "::error::Secret ANDROID_KEYSTORE_BASE64 manquant." >&2
    exit 1
  fi
  ANDROID_KEYSTORE_PATH="${RUNNER_TEMP:-$(mktemp -d)}/voidpulse-release.jks"
  printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$ANDROID_KEYSTORE_PATH"
  trap 'rm -f "$ANDROID_KEYSTORE_PATH"' EXIT
fi
export ANDROID_KEYSTORE_PATH

CODE="$(npx tsx scripts/release/version-code.ts "$VERSION")"
echo "Voidpulse $VERSION (versionCode $CODE)"

# Web : version affichée et comparée par l'updater, sans cartes de sources.
VITE_APP_VERSION="$VERSION" npm run android:sync

(cd android && ./gradlew --no-daemon assembleGithubRelease bundlePlayRelease \
  -PversionName="$VERSION" -PversionCode="$CODE")

rm -rf "$OUT" && mkdir -p "$OUT"
APK="voidpulse-v$VERSION.apk"
AAB="voidpulse-v$VERSION.aab"
cp android/app/build/outputs/apk/github/release/app-github-release.apk "$OUT/$APK"
cp android/app/build/outputs/bundle/playRelease/app-play-release.aab "$OUT/$AAB"

# Contrôles : APK signé avec le keystore de publication, bonne version.
BUILD_TOOLS="$(ls -d "${ANDROID_HOME:?ANDROID_HOME non défini}"/build-tools/* | sort -V | tail -1)"
"$BUILD_TOOLS/apksigner" verify --print-certs "$OUT/$APK" | grep -E "Signer #1 certificate (DN|SHA-256)"
"$BUILD_TOOLS/aapt2" dump badging "$OUT/$APK" | grep -F "versionCode='$CODE' versionName='$VERSION'" > /dev/null \
  || { echo "::error::Version incorrecte dans l'APK." >&2; exit 1; }

(cd "$OUT" && sha256sum "$APK" > "$APK.sha256" && cat "$APK.sha256")
ls -la "$OUT"
