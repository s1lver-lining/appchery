#!/usr/bin/env bash
# Copies SQLite's worker, wasm and OPFS proxy into static/ so they keep their own relative paths.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="node_modules/@sqlite.org/sqlite-wasm/dist"
DEST="static/sqlite"

# SQLite resolves sqlite3.wasm and its OPFS proxy relative to the worker script at runtime. Those
# paths do not survive the bundler's asset hashing, so the files are served verbatim instead.
mkdir -p "$DEST"
cp "$SRC/sqlite3.wasm" "$SRC/sqlite3-opfs-async-proxy.js" "$SRC/sqlite3-worker1.mjs" "$DEST/"
