#!/usr/bin/env bash
# Runs the app in development with hot reload.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-5173}"

# OPFS needs cross-origin isolation, which vite.config.ts adds. --host exposes the LAN address so
# the same server can be opened on a phone.
./scripts/sync-sqlite.sh
exec npx vite dev --host --port "$PORT"
