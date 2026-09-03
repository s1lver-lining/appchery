#!/usr/bin/env bash
# Builds an unsigned debug APK: web build -> capacitor sync -> gradle assembleDebug.
#
# Everything it needs is checked up front and reported together, so a machine that is missing two
# tools says so once instead of failing again after each fix.
set -euo pipefail
cd "$(dirname "$0")/.."

PLATFORM="android-36"
MISSING=()

note() { printf '%s\n' "$*" >&2; }
miss() { MISSING+=("$1"); }

command -v node >/dev/null 2>&1 || miss "node (https://nodejs.org, or your distro's nodejs package)"
command -v npm  >/dev/null 2>&1 || miss "npm (ships with node)"
[[ -d node_modules ]] || miss "node_modules — run: npm install"

# A JDK: Gradle needs 21 for the Android plugin used here. Honour JAVA_HOME when it already points
# at one, otherwise look where the common distros put it.
pick_java() {
	local candidate
	for candidate in "${APPCHERY_JAVA_HOME:-}" "${JAVA_HOME:-}" \
		/usr/lib/jvm/java-21-openjdk /usr/lib/jvm/java-21-openjdk-amd64 \
		/usr/lib/jvm/temurin-21-jdk /usr/lib/jvm/default; do
		[[ -n "$candidate" && -x "$candidate/bin/javac" ]] || continue
		echo "$candidate"
		return 0
	done
	return 1
}
if JAVA_HOME="$(pick_java)"; then
	export JAVA_HOME
	export PATH="$JAVA_HOME/bin:$PATH"
else
	miss "a JDK 21 (install openjdk-21-jdk, or set APPCHERY_JAVA_HOME)"
fi

# Pick an SDK that can actually build rather than trusting ANDROID_HOME: a distro package such as
# /opt/android-sdk is often incomplete and not writable, so Gradle fails on unaccepted licences for
# packages it cannot install. Set APPCHERY_ANDROID_HOME to force a particular one.
pick_sdk() {
	local candidate
	for candidate in "${APPCHERY_ANDROID_HOME:-}" "$HOME/Android/Sdk" "${ANDROID_HOME:-}" \
		"${ANDROID_SDK_ROOT:-}" /opt/android-sdk; do
		[[ -n "$candidate" && -d "$candidate/platforms/$PLATFORM" ]] || continue
		[[ -f "$candidate/licenses/android-sdk-license" ]] || continue
		echo "$candidate"
		return 0
	done
	return 1
}
if ANDROID_HOME="$(pick_sdk)"; then
	export ANDROID_HOME
	export ANDROID_SDK_ROOT="$ANDROID_HOME"
else
	miss "an Android SDK with $PLATFORM and accepted licences (Android Studio, or sdkmanager --licenses; or set APPCHERY_ANDROID_HOME)"
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
