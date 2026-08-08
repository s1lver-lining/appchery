#!/usr/bin/env bash
# Builds the app and serves the production bundle.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-4173}"

npm run build

echo
echo "Serving the production build on port ${PORT}."
echo "Install prompts and service workers need HTTPS, so a LAN address will run the app but not"
echo "offer to install it. Use a tunnel or a real host for that."
echo

exec npx vite preview --host --port "$PORT"
