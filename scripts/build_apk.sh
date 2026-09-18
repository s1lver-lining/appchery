#!/usr/bin/env bash
# Builds an unsigned debug APK: web build -> capacitor sync -> gradle assembleDebug.
#
# Everything it needs is checked up front and reported together, so a machine that is missing two
# tools says so once instead of failing again after each fix.
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck source=scripts/android-env.sh
source "$(dirname "$0")/android-env.sh"

MISSING=()

note() { printf '%s\n' "$*" >&2; }
miss() { MISSING+=("$1"); }

command -v node >/dev/null 2>&1 || miss "node (https://nodejs.org, or your distro's nodejs package)"
command -v npm  >/dev/null 2>&1 || miss "npm (ships with node)"
[[ -d node_modules ]] || miss "node_modules — run: npm install"

if JAVA_HOME="$(pick_java)"; then
	export JAVA_HOME
	export PATH="$JAVA_HOME/bin:$PATH"
else
	miss "$(java_hint)"
fi

if ANDROID_HOME="$(pick_sdk)"; then
	export ANDROID_HOME
	export ANDROID_SDK_ROOT="$ANDROID_HOME"
else
	miss "an Android SDK with $APPCHERY_PLATFORM and accepted licences (Android Studio, or sdkmanager --licenses; or set APPCHERY_ANDROID_HOME)"
fi

[[ -x android/gradlew ]] || miss "android/gradlew — the Android project is missing; run: npx cap add android"

if (( ${#MISSING[@]} )); then
	note "Cannot build the APK. Missing:"
	printf '  - %s\n' "${MISSING[@]}" >&2
	exit 1
fi

# local.properties is what Gradle actually reads for the SDK path; keep it in step with the SDK we
# picked so a checkout on another machine does not build against a stale path.
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties

note "==> Building the web app"
npm run build

note "==> Syncing into the Android project"
npx cap sync android

note "==> Assembling the debug APK"
(cd android && ./gradlew --console=plain assembleDebug)

APK="$(find android/app/build/outputs/apk/debug -name '*.apk' -newermt '-1 hour' 2>/dev/null | head -1)"
[[ -n "$APK" ]] || APK="android/app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -f "$APK" ]]; then
	note "Gradle reported success but no APK was found under android/app/build/outputs/apk/debug."
	exit 1
fi

printf '\nAPK written to: %s\n' "$(realpath "$APK")"
printf 'It is signed with the debug key (not release-signed). Install with:\n  adb install -r %s\n' "$(realpath "$APK")"
