#!/usr/bin/env bash
# Copies MapLibre's worker into static/ so the map can find it after bundling.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="node_modules/maplibre-gl/dist"
DEST="static/maplibre"

# MapLibre works out its worker's address from its own module's address, which is right while it is
# served as the package and wrong the moment a bundler rewrites it: the app asked for a worker under
# its own hashed chunks and got a 404, so the map drew a grey box and no tiles. Served verbatim
# here, with setWorkerUrl in RunMap.svelte pointing at it.
mkdir -p "$DEST"
# The worker imports the shared half beside itself, so the pair travels together.
cp "$SRC/maplibre-gl-worker.mjs" "$SRC/maplibre-gl-shared.mjs" "$DEST/"
