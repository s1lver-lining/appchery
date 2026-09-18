# Where the Android toolchain is on this machine. Sourced by build_apk.sh and adb_install.sh, which
# need the same two answers and used to each have their own idea of them.
#
# Nothing here exits or prints: both functions echo a path and return non-zero when there is none,
# so each script keeps its own way of reporting what is missing.

# The Android platform this project builds against.
APPCHERY_PLATFORM="android-36"

# Gradle 8.14 runs on JDK 17 through 24 and the Android plugin wants 17 at the least. A newer JDK is
# not a better one here: Gradle reads its own build scripts with it and fails on the class file
# version before it has said anything useful about the project.
APPCHERY_JAVA_MIN=17
APPCHERY_JAVA_MAX=24

# The major version a JDK actually is, rather than what its directory is called.
java_major() {
	local home="$1" version
	version="$("$home/bin/javac" -version 2>&1)" || return 1
	version="${version#javac }"
	version="${version%%.*}"
	[[ "$version" =~ ^[0-9]+$ ]] || return 1
	echo "$version"
}

# A JDK Gradle can run on. JAVA_HOME is honoured but still checked: a shell pointing at the newest
# JDK is the usual reason this fails, and deferring to it only moves the failure into Gradle.
pick_java() {
	local candidate major
	for candidate in "${APPCHERY_JAVA_HOME:-}" "${JAVA_HOME:-}" \
		/usr/lib/jvm/java-21-openjdk /usr/lib/jvm/java-21-openjdk-amd64 \
		/usr/lib/jvm/temurin-21-jdk /usr/lib/jvm/java-17-openjdk \
		/usr/lib/jvm/java-17-openjdk-amd64 /usr/lib/jvm/temurin-17-jdk \
		/usr/lib/jvm/default; do
		[[ -n "$candidate" && -x "$candidate/bin/javac" ]] || continue
		major="$(java_major "$candidate")" || continue
		(( major >= APPCHERY_JAVA_MIN && major <= APPCHERY_JAVA_MAX )) || continue
		echo "$candidate"
		return 0
	done
	return 1
}

# Why a JDK was refused, for a message worth reading: "install one" is unhelpful advice to somebody
# who has five of them.
java_hint() {
	local candidate major found=""
	for candidate in "${APPCHERY_JAVA_HOME:-}" "${JAVA_HOME:-}"; do
		[[ -n "$candidate" && -x "$candidate/bin/javac" ]] || continue
		major="$(java_major "$candidate")" || continue
		found="$found JDK $major at $candidate;"
	done
	if [[ -n "$found" ]]; then
		echo "a JDK $APPCHERY_JAVA_MIN-$APPCHERY_JAVA_MAX for Gradle. Found:${found% } Set APPCHERY_JAVA_HOME to one Gradle can use, for example /usr/lib/jvm/java-21-openjdk"
	else
		echo "a JDK $APPCHERY_JAVA_MIN-$APPCHERY_JAVA_MAX (install openjdk-21-jdk, or set APPCHERY_JAVA_HOME)"
	fi
}

# An SDK that can actually build, rather than whatever ANDROID_HOME says. A distro package such as
# /opt/android-sdk is often incomplete and not writable, so Gradle fails on unaccepted licences for
# packages it cannot install. Set APPCHERY_ANDROID_HOME to force a particular one.
pick_sdk() {
	local candidate
	for candidate in "${APPCHERY_ANDROID_HOME:-}" "$HOME/Android/Sdk" "${ANDROID_HOME:-}" \
		"${ANDROID_SDK_ROOT:-}" /opt/android-sdk; do
		[[ -n "$candidate" && -d "$candidate/platforms/$APPCHERY_PLATFORM" ]] || continue
		[[ -f "$candidate/licenses/android-sdk-license" ]] || continue
		echo "$candidate"
		return 0
	done
	return 1
}
