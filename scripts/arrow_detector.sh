#!/usr/bin/env bash
# Runs the target face detector over a picture and reports what it found.
#
#   ./scripts/arrow_detector.sh photo.jpg
#   ./scripts/arrow_detector.sh photo.jpg -o overlay.png
#   ./scripts/arrow_detector.sh photo.png --json
#   ./scripts/arrow_detector.sh photo.jpg --ml               # the learned detector
#   ./scripts/arrow_detector.sh photo.jpg --ml --threshold 0.5
#
# Any format the browser can decode works: png, jpg, webp, gif, bmp, avif.
#
# Both detectors answer in the same coordinates and draw the same way, so running one after the other
# over the same picture shows exactly where they disagree.
#
# The arrows either reports are candidates, not a score. Live scoring recognises an arrow by it being
# new against a reference frame of the quiet boss, which a single picture cannot provide. Without that,
# the classical detector looks for the shape of a shaft, and the learned one for what an impact looked
# like in the pictures it was trained on. Holes, tears and pencil marks qualify for both.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ $# -eq 0 ]]; then
	echo "usage: $(basename "$0") <image> [--ml] [-o overlay.png] [--json] [--scale 2] [--threshold 0.4]" >&2
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
