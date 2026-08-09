#!/usr/bin/env bash
# Runs the target face detector over a picture and reports what it found.
#
#   ./scripts/arrow_detector.sh photo.jpg
#   ./scripts/arrow_detector.sh photo.jpg -o overlay.png
#   ./scripts/arrow_detector.sh photo.png --json
#
# Any format the browser can decode works: png, jpg, webp, gif, bmp, avif.
#
# The arrows it reports are candidates, not a score. Live scoring recognises an arrow by it being
# new against a reference frame of the quiet boss, which a single picture cannot provide, so this
# falls back to finding patches whose colour does not match the ring they sit in. Holes, tears and
# pencil marks qualify too.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ $# -eq 0 ]]; then
	echo "usage: $(basename "$0") <image> [-o overlay.png] [--json] [--scale 2]" >&2
	exit 2
fi

if [[ ! -d node_modules ]]; then
	echo "node_modules is missing. Run npm install first." >&2
	exit 1
fi

# Detection runs in a headless browser, which is what decodes and re-encodes the picture.
CHROMIUM="${CHROMIUM:-}"
if [[ -z "$CHROMIUM" ]]; then
	for candidate in /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome-stable; do
		[[ -x "$candidate" ]] && CHROMIUM="$candidate" && break
	done
fi

if [[ -z "$CHROMIUM" ]]; then
	echo "No Chromium found. Install one, or set CHROMIUM to its path." >&2
	exit 1
fi

CHROMIUM="$CHROMIUM" exec node scripts/arrow_detector.mjs "$@"
