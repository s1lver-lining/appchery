#!/usr/bin/env bash
# Builds the app and serves the production bundle.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-4173}"
SSL=0

while [ $# -gt 0 ]; do
	case "$1" in
	--ssl) SSL=1 ;;
	-h | --help)
		echo "Usage: $0 [--ssl]"
		echo
		echo "  --ssl  Serve over HTTPS with a self-signed certificate, so the LAN address is a"
		echo "         secure context and the browser database persists to OPFS on a phone."
		exit 0
		;;
	*)
		echo "$0: unknown option $1" >&2
		exit 2
		;;
	esac
	shift
done

npm run build

echo
echo "Serving the production build on port ${PORT}."

if [ "$SSL" = 1 ]; then
	# A self-signed certificate is enough of a secure context for OPFS, but Chrome refuses to treat
	# an origin with certificate errors as installable, so the home screen still gets a bookmark
	# shortcut rather than a WebAPK. A tunnel or a real host is what earns the install prompt.
	echo "Accept the certificate warning on first visit from each device."
	echo "The database will persist, but a self-signed certificate still blocks install prompts."
	echo
	exec env APPCHERY_SSL=1 npx vite preview --host --port "$PORT"
fi

echo "Install prompts and service workers need HTTPS, so a LAN address will run the app but not"
echo "offer to install it. Use --ssl for OPFS, or a tunnel or real host to install it."
echo

exec npx vite preview --host --port "$PORT"
