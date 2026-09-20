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

# Which of the connected devices is the phone. A watch is very likely paired at the same time, and
# `adb install` with two devices connected fails with "more than one device/emulator" after the build
# has already succeeded: the tail of the output looks like a good run, and the phone silently keeps
# the build it had. Chosen here rather than left to adb, the way watch_adb_install.sh picks the watch.
phone_serial() {
	local serial state characteristics
	while read -r serial state; do
		[[ "$state" == "device" ]] || continue
		# `</dev/null` is load-bearing: `adb shell` reads stdin, and stdin here is the list of devices
		# still to be checked, so without it the first device examined swallows the rest of the list.
		characteristics="$("$ADB" -s "$serial" shell getprop ro.build.characteristics </dev/null 2>/dev/null | tr -d '\r')"
		[[ "$characteristics" == *watch* ]] && continue
		echo "$serial"
		return 0
	done < <("$ADB" devices | awk 'NR>1 && NF==2')
	return 1
}

# An explicit choice wins, for the day two phones are plugged in.
SERIAL="${ANDROID_SERIAL:-}"
if [[ -z "$SERIAL" ]] && ! SERIAL="$(phone_serial)"; then
	echo "No phone among the connected devices. Enable USB debugging and accept the prompt on it." >&2
	"$ADB" devices >&2
	echo "A watch alone is not enough: this installs the phone app. ANDROID_SERIAL=<serial> forces one." >&2
	exit 1
fi
echo "Installing on: $SERIAL"

npm run build
npx cap sync android

echo "Building the debug APK…"
(cd android && ./gradlew --no-daemon assembleDebug)

APK="android/app/build/outputs/apk/debug/app-debug.apk"
echo "Installing $APK"
# Never quietly: a failed install leaves the phone running the build before this one, which looks
# exactly like the change not working.
if ! "$ADB" -s "$SERIAL" install -r "$APK"; then
	echo "Install failed, so the phone is still running the previous build." >&2
	exit 1
fi

# echo "Done. Launching…"
# "$ADB" shell monkey -p com.appchery.app -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
