#!/usr/bin/env bash
# Builds the web app, syncs it into the Android project, and installs it on the connected device.
set -euo pipefail
cd "$(dirname "$0")/.."

# A user-local SDK, so nothing needs root. Override if yours lives elsewhere.
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

# Gradle and the Android plugin do not support the newest JDKs, so pin one that works.
if [[ -z "${JAVA_HOME:-}" && -d /usr/lib/jvm/java-21-openjdk ]]; then
	export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
fi

ADB="$ANDROID_HOME/platform-tools/adb"
[[ -x "$ADB" ]] || ADB="$(command -v adb)"

if [[ ! -d "$ANDROID_HOME/platforms" ]]; then
	echo "No Android SDK at $ANDROID_HOME." >&2
	echo "Install one, or set ANDROID_HOME to an existing SDK." >&2
	exit 1
fi

if ! "$ADB" devices | awk 'NR>1 && $2=="device"' | grep -q .; then
	echo "No device connected. Enable USB debugging and accept the prompt on the phone." >&2
	"$ADB" devices >&2
	exit 1
fi

npm run build
npx cap sync android

echo "Building the debug APK…"
(cd android && ./gradlew --no-daemon assembleDebug)

APK="android/app/build/outputs/apk/debug/app-debug.apk"
echo "Installing $APK"
"$ADB" install -r "$APK"

echo "Done. Launching…"
"$ADB" shell monkey -p com.appchery.app -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
