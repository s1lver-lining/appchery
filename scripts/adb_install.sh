#!/usr/bin/env bash
# Builds the web app, syncs it into the Android project, and installs it on the connected device.
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck source=scripts/android-env.sh
source "$(dirname "$0")/android-env.sh"

if ! ANDROID_HOME="$(pick_sdk)"; then
	echo "No usable Android SDK found: none of the candidates has $APPCHERY_PLATFORM with accepted licences." >&2
	echo "Checked: \$APPCHERY_ANDROID_HOME, \$HOME/Android/Sdk, \$ANDROID_HOME, \$ANDROID_SDK_ROOT, /opt/android-sdk" >&2
	exit 1
fi
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
echo "Using Android SDK: $ANDROID_HOME"

# Gradle reads local.properties before the environment, so pin it to the SDK chosen here.
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

# Gradle and the Android plugin do not support the newest JDKs. A JAVA_HOME already pointing at one
# is the usual reason this fails, so it is checked rather than trusted.
if ! JAVA_HOME="$(pick_java)"; then
	echo "Cannot build: $(java_hint)" >&2
	exit 1
fi
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"
echo "Using JDK: $JAVA_HOME"

ADB="$ANDROID_HOME/platform-tools/adb"
[[ -x "$ADB" ]] || ADB="$(command -v adb)"

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

# echo "Done. Launching…"
# "$ADB" shell monkey -p com.appchery.app -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
