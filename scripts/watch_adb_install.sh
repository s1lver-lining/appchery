#!/usr/bin/env bash
# Builds the Wear OS app and installs it on a watch over wireless adb.
#
# A watch has no usable cable, so this is the only way to put a build on one. Wireless debugging is
# two separate things and they are easy to confuse: pairing, done once per computer, and connecting,
# done once per session because the watch forgets the connection when it reboots or drops Wi-Fi.
#
#   ./scripts/watch_adb_install.sh --pair 192.168.1.40:41234   # first time only, asks for the code
#   ./scripts/watch_adb_install.sh 192.168.1.40                # every time after that
#   ./scripts/watch_adb_install.sh                             # a watch already connected, or remembered
#
# On the watch: Settings > Developer options > ADB debugging, then Wireless debugging. "Pair new
# device" shows the pairing address and code; the Wireless debugging screen itself shows the address
# to connect to, which is a different port.
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck source=scripts/android-env.sh
source "$(dirname "$0")/android-env.sh"

PACKAGE="com.appchery.watch"
ACTIVITY=".KeypadActivity"
APK="android/wear/build/outputs/apk/debug/wear-debug.apk"
# The port the watch listens on for connections once paired. The pairing port is a different one and
# changes every time, which is why that address has to be given rather than guessed.
DEFAULT_PORT=5555
# Long enough for a watch that is awake on the same Wi-Fi, short enough to be a wrong answer rather
# than a hang: the watch's radio sleeps and the first attempt after that can take a few seconds.
CONNECT_TIMEOUT=20
# Where the address of the last watch is kept, so the usual run needs no arguments at all.
REMEMBERED=".watch-adb"

PAIR=""
ADDRESS=""
LAUNCH=1
while (( $# )); do
	case "$1" in
		--pair) PAIR="${2:-}"; shift 2 || true ;;
		--no-launch) LAUNCH=0; shift ;;
		# The header above, to the first line that is not a comment, so it cannot drift out of step.
		-h|--help) sed -n '2,${/^[^#]/q;p;}' "$0" | sed 's/^# \?//'; exit 0 ;;
		-*) echo "Unknown option: $1" >&2; exit 1 ;;
		*) ADDRESS="$1"; shift ;;
	esac
done

if ! ANDROID_HOME="$(pick_sdk)"; then
	echo "No usable Android SDK found: none of the candidates has $APPCHERY_PLATFORM with accepted licences." >&2
	echo "Checked: \$APPCHERY_ANDROID_HOME, \$HOME/Android/Sdk, \$ANDROID_HOME, \$ANDROID_SDK_ROOT, /opt/android-sdk" >&2
	exit 1
fi
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"

if ! JAVA_HOME="$(pick_java)"; then
	echo "Cannot build: $(java_hint)" >&2
	exit 1
fi
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

ADB="$ANDROID_HOME/platform-tools/adb"
[[ -x "$ADB" ]] || ADB="$(command -v adb || true)"
[[ -n "$ADB" ]] || { echo "No adb found. Install platform-tools." >&2; exit 1; }

# Pairing is its own exchange with its own address and a six digit code, and it is needed once per
# computer. Afterwards the watch trusts this machine and only the connect below is required.
if [[ -n "$PAIR" ]]; then
	echo "Pairing with $PAIR — enter the code shown on the watch."
	"$ADB" pair "$PAIR"
fi

# An address given wins; otherwise the one this script was last given, which is the usual case.
if [[ -z "$ADDRESS" && -f "$REMEMBERED" ]]; then
	ADDRESS="$(cat "$REMEMBERED")"
	[[ -n "$ADDRESS" ]] && echo "Using the watch this script saw last: $ADDRESS"
fi
if [[ -n "$ADDRESS" ]]; then
	# A bare address means the connect port. A watch prints host:port on its own screen, so both
	# forms turn up depending on which screen it was read off.
	[[ "$ADDRESS" == *:* ]] || ADDRESS="$ADDRESS:$DEFAULT_PORT"
	echo "Connecting to $ADDRESS"
	# Bounded, because an address nothing answers at leaves adb waiting on the TCP timeout, which on
	# an unroutable address is minutes of a script that looks like it has hung.
	CONNECTED="$(timeout "$CONNECT_TIMEOUT" "$ADB" connect "$ADDRESS" 2>&1 || echo "failed: no answer within ${CONNECT_TIMEOUT}s")"
	echo "$CONNECTED"
	# adb says "failed to connect" on stdout and still exits 0, so the text is what has to be read.
	if [[ "$CONNECTED" == *"failed"* || "$CONNECTED" == *"refused"* || "$CONNECTED" == *"unable"* ]]; then
		echo >&2
		echo "Could not reach the watch. The usual reasons, in order:" >&2
		echo "  - Wireless debugging is off, or the watch rebooted and turned it off again." >&2
		echo "  - The port changed. It is on the watch's Wireless debugging screen." >&2
		echo "  - This computer was never paired: run with --pair <address from 'Pair new device'>." >&2
		echo "  - The watch is on another network, or has dropped to its phone's Bluetooth only." >&2
		exit 1
	fi
	printf '%s\n' "$ADDRESS" > "$REMEMBERED"
fi

# Which of the connected devices is a watch. A phone is very likely plugged in at the same time, and
# installing a watch build on it would succeed and leave an app that cannot run.
watch_serial() {
	local serial characteristics
	while read -r serial state; do
		[[ "$state" == "device" ]] || continue
		# `</dev/null` is load-bearing: `adb shell` reads stdin, and stdin here is the list of
		# devices still to be checked. Without it the first device examined swallows the rest of the
		# list, so a watch listed after a phone is never seen at all.
		characteristics="$("$ADB" -s "$serial" shell getprop ro.build.characteristics </dev/null 2>/dev/null | tr -d '\r')"
		[[ "$characteristics" == *watch* ]] || continue
		echo "$serial"
		return 0
	done < <("$ADB" devices | awk 'NR>1 && NF==2')
	return 1
}

if ! SERIAL="$(watch_serial)"; then
	echo "No watch among the connected devices." >&2
	"$ADB" devices >&2
	echo >&2
	echo "Give the watch's address: ./scripts/watch_adb_install.sh <ip>[:port]" >&2
	echo "Pair it first if this computer has never seen it: --pair <ip:pairing-port>" >&2
	exit 1
fi
echo "Watch: $SERIAL"

echo "==> Assembling the watch APK"
(cd android && ./gradlew --console=plain :wear:assembleDebug)
[[ -f "$APK" ]] || { echo "Gradle reported success but $APK is not there." >&2; exit 1; }

echo "==> Installing on $SERIAL"
# Kept as its own step: a failure here is about the watch, and the message adb gives is the useful
# one. The usual is a signature clash with a build installed from somewhere else.
if ! "$ADB" -s "$SERIAL" install -r "$APK"; then
	echo >&2
	echo "If that failed on signatures, the watch has a build signed with another key:" >&2
	echo "  $ADB -s $SERIAL uninstall $PACKAGE" >&2
	exit 1
fi

if (( LAUNCH )); then
	echo "==> Starting it"
	"$ADB" -s "$SERIAL" shell am start -n "$PACKAGE/$ACTIVITY" >/dev/null
fi

printf '\nInstalled %s on %s.\n' "$PACKAGE" "$SERIAL"
printf 'Logs:  %s -s %s logcat -s AppcheryWatch:I\n' "$ADB" "$SERIAL"
