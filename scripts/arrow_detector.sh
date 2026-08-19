#!/usr/bin/env bash
# Runs the target face detector over a picture or a recorded session and reports what it found.
#
#   ./scripts/arrow_detector.sh photo.jpg
#   ./scripts/arrow_detector.sh photo.jpg -o overlay.png
#   ./scripts/arrow_detector.sh photo.png --json
#   ./scripts/arrow_detector.sh photo.jpg --ml               # the learned detector
#   ./scripts/arrow_detector.sh photo.jpg --ml --threshold 0.5
#
#   ./scripts/arrow_detector.sh session.webm                 # writes session-overlay.mp4
#   ./scripts/arrow_detector.sh session.webm --watch         # and plays it
#   ./scripts/arrow_detector.sh session.webm --json          # just the numbers, no video written
#   ./scripts/arrow_detector.sh session.webm --limit 300     # only the first 300 frames
#   ./scripts/arrow_detector.sh session.webm --pretty        # steady the drawn overlay
#
# --pretty smooths the lines the overlay draws, and nothing else. The fit is measured from the picture
# afresh every frame, so it lands a fraction of a pixel differently each time, and a line that moves is
# far easier to see than a line that is slightly misplaced. What is smoothed is how far each frame's
# fit misses a prediction of it, so a sweep is followed with no lag while the wobble on top of it is
# averaged out, and the drawn lines are never let further than a tenth of a ring from the fit. Nothing
# measured, scored or reported goes through it, so the numbers are the same either way.
#
# Any format the browser can decode works: png, jpg, webp, gif, bmp, avif. A video is anything ffmpeg
# decodes, and is replayed through the live scanner rather than analysed frame by frame: the
# background reference, the settle counter and the tracker's evidence all build up over time, so
# frames considered independently would measure a detector the app does not ship.
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
	echo "usage: $(basename "$0") <image|video> [--ml] [-o out] [--json] [--watch] [--pretty] [--scale 2] [--threshold 0.4]" >&2
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

# A video is decoded and re-encoded by ffmpeg, so it has to be there before anything starts.
case "${1,,}" in
	*.webm | *.mp4 | *.mov | *.mkv | *.avi | *.m4v)
		if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
			echo "ffmpeg and ffprobe are needed to replay a video. Install them first." >&2
			exit 1
		fi
		;;
esac

CHROMIUM="$CHROMIUM" exec node scripts/arrow_detector.mjs "$@"
