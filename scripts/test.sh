#!/usr/bin/env bash
# Runs everything that can be checked on this machine. Steps whose tooling is missing are skipped
# rather than failed, so the same script is useful on a laptop without the Android SDK installed.
set -uo pipefail
cd "$(dirname "$0")/.."

PASSED=()
FAILED=()
SKIPPED=()

run() {
	local name="$1"
	shift
	echo
	echo "══ $name"
	if "$@"; then
		PASSED+=("$name")
	else
		FAILED+=("$name")
	fi
}

skip() {
	SKIPPED+=("$1: $2")
	echo
	echo "══ $1 (skipped: $2)"
}

if [[ ! -d node_modules ]]; then
	echo "node_modules is missing. Run npm install first." >&2
	exit 1
fi

run "types" npm run check
run "unit tests" npx vitest run
run "web build" npm run build

# The Android build needs a complete SDK and a JDK the Gradle plugin supports, so both are probed
# before it runs. A missing SDK is a normal state on a machine that only works on the web app.
PLATFORM="android-36"
ANDROID_SDK=""
for candidate in "${APPCHERY_ANDROID_HOME:-}" "$HOME/Android/Sdk" "${ANDROID_HOME:-}" /opt/android-sdk; do
	if [[ -n "$candidate" && -d "$candidate/platforms/$PLATFORM" && -f "$candidate/licenses/android-sdk-license" ]]; then
		ANDROID_SDK="$candidate"
		break
	fi
done

JDK=""
for candidate in "${JAVA_HOME:-}" /usr/lib/jvm/java-21-openjdk /usr/lib/jvm/java-17-openjdk; do
	if [[ -n "$candidate" && -x "$candidate/bin/javac" ]]; then
		JDK="$candidate"
		break
	fi
done

if [[ -z "$ANDROID_SDK" ]]; then
	skip "android build" "no SDK with $PLATFORM and accepted licences"
elif [[ -z "$JDK" ]]; then
	skip "android build" "no supported JDK found"
elif [[ ! -x android/gradlew ]]; then
	skip "android build" "no android project"
else
	export ANDROID_HOME="$ANDROID_SDK"
	export ANDROID_SDK_ROOT="$ANDROID_SDK"
	export JAVA_HOME="$JDK"
	echo "sdk.dir=$ANDROID_SDK" > android/local.properties
	run "android build" bash -c 'npx cap sync android && cd android && ./gradlew --no-daemon assembleDebug'
fi

echo
echo "═══════════════════════════════"
for name in "${PASSED[@]:-}"; do [[ -n "$name" ]] && echo "  pass  $name"; done
for name in "${SKIPPED[@]:-}"; do [[ -n "$name" ]] && echo "  skip  $name"; done
for name in "${FAILED[@]:-}"; do [[ -n "$name" ]] && echo "  FAIL  $name"; done

[[ ${#FAILED[@]} -eq 0 ]] || exit 1
echo
echo "All available checks passed."
