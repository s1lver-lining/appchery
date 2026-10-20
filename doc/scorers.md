# Scorer versions

The arrow scorer is versioned so a result can always be compared with an older one. The archer picks a
version in Settings, the labelling page picks one for its scorecard and its player, and the harnesses
take `--scorer <id>`.

| Version | Kind | What it is |
| --- | --- | --- |
| Aphaia 1.0 | classical | The written detector as of October 2026, with gravity for which way is up. |
| Aphaia ML 1.0 | learned | The same scanner with arrows proposed by `scorers/aphaia-ml-1.0.json`. |
| Aphaia 1.1 | classical | 1.0 with the face held to its paper (`paperLock`). What "Latest model", the default, runs today. |
| Aphaia 1.2alpha | classical, preview | 1.1 with marks proposed on fewer than a fifth of the passes left out (`sweep.minShare`), and a face kept through one pass it was missed on (`holdBlink`). |

## Aphaia 1.2alpha: marks have to keep being seen

A preview: chosen by hand only, and free to change until it is renamed 1.2. Across the labelled sweeps a
real arrow is proposed on a median of 47% of the passes and a false mark on 17%, so a mark is shown and
scored only once it has been proposed on at least a fifth of the passes so far. Measured on 72
recordings (runs vary by a few arrows, since passes are dropped by the clock):

| | 1.1 | 1.2alpha |
| --- | --- | --- |
| arrows found | 264/374 | 239/374 |
| spurious arrows | 125 | 45 |
| misses plus spurious | 235 | 180 |
| median drift (39 recordings with 2+ tied frames) | 3.5° | 3.0° |

0.15 found 251 with 77 spurious and 0.1 found 262 with 108, so 0.2 makes the fewest mistakes; it is the
best share in the August and September recordings and in the October ones taken apart.

Measure with `--slower 0` when comparing settings: with passes dropped by this machine's own clock, two
runs of the same version differed by nine arrows. With it, on the labels of 20 October:

| | found | spurious |
| --- | --- | --- |
| 1.1 | 251 | 143 |
| 1.2alpha, share only | 221 | 56 |
| with `holdBlink` (1.2alpha now) | 224 | 53 |
| with `edgeUp: 0.1` | 223 | 61 |
| with `edgeUp: 0.05` | 220 | 59 |
| with both | 227 | 60 |
| with `holdBlink` and `sweep.shortAsUnsure` | 246 shown, 224 scored | 130 shown, 47 scored |

Where 1.1 misses arrows (111 misses on these recordings): 41 are marked 0.05 to 0.15 radii off, mostly
along the ring, so the face has turned; 32 are hardly ever proposed; 23 are proposed often and never
accepted; 15 are shown for a while and then dropped. Recordings drifting more than 5° miss 49% of their
arrows, the others 25%.

## Aphaia 1.1: holding the face to its paper

The rings say nothing about which way round a face is, so the fit's orientation drifts during a sweep and
an arrow's looks spread along an arc instead of piling up. Gravity pins the face when it is found; after
that, every third pass unrolls the paper from 0.22 to 1.25 radii (holes, tears, print, and past the edge
the corners, logos and bale, which a brand new face still has) and turns the face back onto how it looked
when first steady. A turn is taken only when the match is clear and between a quarter degree and 30°.

Measured with `eval-arrows-video.mjs --slower 0 --drift`, against 1.0:

| | 1.0 | 1.1 |
| --- | --- | --- |
| arrows found | 221/374 | 247/374 |
| spurious arrows | 178 | 146 |
| median drift over a sweep (22 recordings with 3+ tied frames) | 9.5° | 4.5° |
| a pass costs | 75ms | 83ms |

## Tried and left off

`contrast: 'colour'` reads shafts by how far their colour is from the paper's, not only by darkness, so a
white or red shaft on a light ring is seen. On these recordings, nearly all dark shafts, it found 216 and
210 arrows (hue gain 0 and 1) against 221, so no version uses it yet. It is the option to try once
recordings of light shafts are labelled.

`paperRegain` keeps the paper through a short loss of the face and turns the face found again onto it at
any angle; `chainThroughLoss` turns it onto the way round the last face had instead. A loss followed by
a gravity pin is what turns a face by 80° or more in the middle of a sweep, but neither fix measured
better on the whole: 233 found and 60 spurious, and 242 and 45, against 240 and 49 under 1.2alpha.

Straight edges round the face (the paper's border, the bale, corner prints) as a helper for which way is
up, tried offline on 384 labelled frames: where the edges are strong, a sixth of the frames, their angle
holds to about 5° within a recording; elsewhere straw and shafts blur it to 7° or 8°. As `edgeUp`, the
strength at which they correct gravity's answer by up to 20° on a new face, it measured no better at 0.1
or 0.05, so it stays off; reading only long lines and leaving the shafts out is what it would need next.

## The interface

A version is an entry in `src/lib/vision/scorers.ts`: an id, a name, the scanner options it runs with
(`settings`) and, for a learned one, a weights file in `src/lib/vision/scorers/`. Everything that runs
a scorer loads it into the same `LoadedScorer`, `{ id, model, settings }`, and hands that to the scanner:
the app through `scorer-load.ts`, the scripts through `scripts/lib/scorers.mjs`.

## Adding one

1. Put new behaviour behind a scanner option whose default is the old behaviour, so the shipped versions
   keep doing what they did. A change to the default is a change to every version at once.
2. Train new weights into `src/lib/vision/scorers/next.json` (the default output of `train-arrows.py`),
   then rename the file after the version.
3. Add the entry to `SCORERS` and measure it against the one it replaces:
   `node scripts/eval-arrows-video.mjs --slower 0 --scorer <id>`.
4. While it is being tried, mark it `preview` and give it an `alpha` name: "Latest model", the default
   choice, follows the last entry of `SCORERS` that is not a preview. Once it measures better, drop the
   flag and the suffix, and add the old id to `RENAMED` so a stored choice follows it.

A shipped version is never edited. Fixing one is a new version.
