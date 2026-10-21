#!/bin/bash
# Trains the shaft reader of src/lib/vision/shafts.ts from the labelled frames. See doc/scorers.md.
#
#   scripts/train-shafts/run.sh [work folder]
#
# 1. Exports every labelled frame as the app's crop sees it (--crop --scale 2), with its fit, tips and nocks.
# 2. Dumps the written proposer's runs, which give a shaft's line where no nock was placed.
# 3. Builds strips along candidate lines: true nock lines, lines a run and the line finder agree on through a
#    labelled tip, and lines near no arrow.
# 4. Trains one model per recording day held out, and one on everything: the day models are only for
#    measuring, through scripts/eval-arrows-video.mjs --shafts, on the day each one never saw.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
export SHAFTS_WORK=${1:-/tmp/appchery-shafts}
mkdir -p "$SHAFTS_WORK/frames"
cd "$ROOT"
OUT="$SHAFTS_WORK/frames" node "$HERE/export-frames.mjs" --crop --scale 2
node scripts/eval-proposer.mjs --crop --scale 2 --dump "$SHAFTS_WORK/classical-dump.json" > /dev/null
cd "$SHAFTS_WORK"
PYTHONPATH="$HERE" python3 "$HERE/build.py"
# Three at a time: each holds every strip twice over, and six at once ran a 32 GB machine out of memory.
for day in 0818 0829 0902 0905 1019 ''; do
	HOLD=$day TAG=shafts PYTHONPATH="$HERE" python3 "$HERE/train.py" > "train-${day:-all}.log" 2>&1 &
	while [ "$(jobs -r | wc -l)" -ge 3 ]; do wait -n; done
done
wait
cat train-*.log
echo "weights: $SHAFTS_WORK/shafts-all.json"
