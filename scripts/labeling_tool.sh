#!/usr/bin/env bash
# Starts the labelling tool: browse the corpus, place the labels, and see what the detector makes of it.
#
#   ./scripts/labeling_tool.sh                 # serve the page
#   ./scripts/labeling_tool.sh --open          # and open a browser at it
#   ./scripts/labeling_tool.sh --port 9000     # somewhere other than 8787
#   ./scripts/labeling_tool.sh --prepare       # find the faces in any new recordings first
#   ./scripts/labeling_tool.sh --prepare --video 2026-08-29   # only that session
#
# A recording has to be prepared before it can be labelled: the faces are found on every frame and
# fifteen frames are chosen to label, which takes a couple of minutes a recording and is why it is not
# done every time the tool starts. Recordings dropped into the corpus since the last run simply will
# not appear until --prepare has seen them, so that is the thing to reach for when one is missing.
#
# Nothing here saves: the page writes each label to the workspace a moment after it is placed.
#
# The page also runs the app's own detector, over the frame being labelled or over any photograph in
# the corpus, drawn dashed in magenta on top of the labels. That is the comparison a score cannot make:
# not how many arrows were found but which ones, how far out, and whether the fault was the arrows or
# the face they are measured against.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8787}"
PREPARE=0
OPEN=0
VIDEO=()

while [ $# -gt 0 ]; do
	case "$1" in
	--prepare) PREPARE=1 ;;
	--open) OPEN=1 ;;
	--port)
		PORT="$2"
		shift
		;;
	--video)
		VIDEO=(--video "$2")
		shift
		;;
	-h | --help)
		echo "Usage: $0 [--prepare] [--video <name>] [--open] [--port 8787]"
		echo
		echo "  --prepare  Find the faces in any recordings not prepared yet, which is what makes"
		echo "             them appear in the tool. Takes a couple of minutes each."
		echo "  --video    Narrow --prepare to the recordings whose name contains this."
		echo "  --open     Open a browser at the page once it is serving."
		exit 0
		;;
	*)
		echo "$0: unknown option $1" >&2
		exit 2
		;;
	esac
	shift
done

if [ ! -d node_modules ]; then
	echo "node_modules is missing. Run npm install first." >&2
	exit 1
fi

# Decoding the frames out of a recording is ffmpeg's job, and only preparing needs it.
if [ "$PREPARE" = 1 ]; then
	if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
		echo "ffmpeg and ffprobe are needed to prepare a recording. Install them first." >&2
		exit 1
	fi
	node scripts/label-arrows.mjs prepare "${VIDEO[@]+"${VIDEO[@]}"}"
fi

if [ "$OPEN" = 1 ]; then
	# Given a moment to bind the port first, and never allowed to take the script down with it: a
	# machine with no desktop browser should still serve the page.
	(sleep 1 && (xdg-open "http://localhost:$PORT" >/dev/null 2>&1 || true)) &
fi

exec node scripts/label-arrows.mjs serve --port "$PORT"
