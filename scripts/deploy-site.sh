#!/usr/bin/env bash
# Builds the landing page and uploads it to the hosting behind appchery.com.
#
# Its own script rather than a target of deploy.sh: this page has no database, no migrations and no
# ordering to respect, and it goes to a different host by a different protocol. The two deploys
# share nothing but the repository they are run from.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=build-site

usage() {
	echo "Usage: $0 [--dry-run] [--build-only]"
	echo
	echo "  --dry-run     Build and list what would be uploaded, without connecting."
	echo "  --build-only  Build and stop, for serving ${OUT}/ yourself."
	echo
	echo "Credentials are read from .env, which is gitignored:"
	echo "  APPCHERY_FTP_HOST   the FTP server, e.g. ftp.cluster0XX.hosting.ovh.net"
	echo "  APPCHERY_FTP_USER   the FTP login"
	echo "  APPCHERY_FTP_PASS   its password"
	echo "  APPCHERY_FTP_DIR    the directory the domain serves, default /www"
	echo "Set APPCHERY_FTP_SFTP=1 to use sftp instead, where the host offers it."
}

DRY_RUN=0
BUILD_ONLY=0
while [ $# -gt 0 ]; do
	case "$1" in
	--dry-run) DRY_RUN=1 ;;
	--build-only) BUILD_ONLY=1 ;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "$0: unknown option $1" >&2
		exit 2
		;;
	esac
	shift
done

# Read from .env rather than prompted for, the same as the app deploy: a deploy that stops halfway
# to ask is one somebody answers in a hurry. Never echoed, and .env is not in the repository.
env_value() {
	[ -f .env ] || return 0
	grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"'"'"'\r' || true
}

HOST="${APPCHERY_FTP_HOST:-$(env_value APPCHERY_FTP_HOST)}"
USER="${APPCHERY_FTP_USER:-$(env_value APPCHERY_FTP_USER)}"
PASS="${APPCHERY_FTP_PASS:-$(env_value APPCHERY_FTP_PASS)}"
DIR="${APPCHERY_FTP_DIR:-$(env_value APPCHERY_FTP_DIR)}"
DIR="${DIR:-/www}"
SFTP="${APPCHERY_FTP_SFTP:-$(env_value APPCHERY_FTP_SFTP)}"

npm run build:site

# The page is what the app looks like today, so a stale bundle uploaded by mistake is worth
# catching: the entry the HTML names must be one this build actually wrote.
ENTRY="$(grep -oE 'assets/[A-Za-z0-9._-]+\.js' "$OUT/index.html" | head -1)"
if [ -z "$ENTRY" ] || [ ! -f "$OUT/$ENTRY" ]; then
	echo "$0: ${OUT}/index.html does not name a script this build produced; refusing to upload." >&2
	exit 1
fi

FILES="$(cd "$OUT" && find . -type f | sed 's|^\./||' | sort)"

if [ "$BUILD_ONLY" = 1 ]; then
	echo "Built ${OUT}/, not uploaded."
	du -sh "$OUT"
	exit 0
fi

if [ "$DRY_RUN" = 1 ]; then
	echo "Dry run: would upload to ${HOST:-<no host set>}:${DIR}"
	echo "$FILES" | sed 's/^/  /'
	exit 0
fi

if [ -z "$HOST" ] || [ -z "$USER" ] || [ -z "$PASS" ]; then
	echo "$0: no credentials for the landing page host." >&2
	echo >&2
	usage >&2
	exit 2
fi

if [ "$SFTP" = 1 ]; then
	# Batched rather than one call per file: sftp opens a session per invocation, and a handful of
	# logins in a row is what a host reads as somebody trying passwords.
	{
		echo "cd ${DIR}"
		echo "$FILES" | while IFS= read -r file; do
			case "$file" in */*) echo "-mkdir $(dirname "$file")" ;; esac
			echo "put ${OUT}/${file} ${file}"
		done
	} | SSHPASS="$PASS" sshpass -e sftp -oBatchMode=no -b - "${USER}@${HOST}"
else
	echo "$FILES" | while IFS= read -r file; do
		curl --silent --show-error --fail --ftp-create-dirs \
			--user "${USER}:${PASS}" \
			--upload-file "${OUT}/${file}" \
			"ftp://${HOST}${DIR}/${file}"
		echo "  uploaded ${file}"
	done
fi

echo
echo "Deployed to https://appchery.com"
echo "Old hashed files under assets/ are left behind: they cost nothing and an open tab may still ask for one."
