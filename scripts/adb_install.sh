#!/usr/bin/env bash
# Builds the web app, syncs it into the Android project, and installs it on the connected device.
set -euo pipefail
cd "$(dirname "$0")/.."

# Pick an SDK that can actually build, rather than trusting ANDROID_HOME. A distro package such as
# /opt/android-sdk is often incomplete and not writable, so Gradle fails on unaccepted licences for
# packages it cannot install. Set APPCHERY_ANDROID_HOME to force a particular one.
PLATFORM="android-36"
pick_sdk() {
	local candidate
	for candidate in "${APPCHERY_ANDROID_HOME:-}" "$HOME/Android/Sdk" "${ANDROID_HOME:-}" /opt/android-sdk; do
		[[ -n "$candidate" && -d "$candidate/platforms/$PLATFORM" ]] || continue
		[[ -f "$candidate/licenses/android-sdk-license" ]] || continue
		echo "$candidate"
		return 0
	done
	return 1
}

if ! ANDROID_HOME="$(pick_sdk)"; then
	echo "No usable Android SDK found: none of the candidates has $PLATFORM with accepted licences." >&2
	echo "Checked: \$APPCHERY_ANDROID_HOME, \$HOME/Android/Sdk, \$ANDROID_HOME, /opt/android-sdk" >&2
	exit 1
fi
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
echo "Using Android SDK: $ANDROID_HOME"

# Gradle reads local.properties before the environment, so pin it to the SDK chosen here.
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

# Gradle and the Android plugin do not support the newest JDKs, so pin one that works.
if [[ -z "${JAVA_HOME:-}" && -d /usr/lib/jvm/java-21-openjdk ]]; then
	export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
fi

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
