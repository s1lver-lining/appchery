#!/usr/bin/env bash
# Runs the app in development with hot reload.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-5173}"
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

# OPFS needs cross-origin isolation, which vite.config.ts adds. --host exposes the LAN address so
# the same server can be opened on a phone.
./scripts/sync-sqlite.sh

if [ "$SSL" = 1 ]; then
	# The certificate is self-signed, so each device has to accept it once before the app loads.
	echo "Serving over HTTPS. Accept the certificate warning on first visit from each device."
	exec env APPCHERY_SSL=1 npx vite dev --host --port "$PORT"
fi

exec npx vite dev --host --port "$PORT"
