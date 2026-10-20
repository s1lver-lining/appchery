# Scorer versions

The arrow scorer is versioned so a result can always be compared with an older one. The archer picks a
version in Settings, the labelling page picks one for its scorecard and its player, and the harnesses
take `--scorer <id>`.

| Version | Kind | What it is |
| --- | --- | --- |
| Aphaia 1.0 | classical | The written detector as of October 2026, with gravity for which way is up. |
| Aphaia ML 1.0 | learned | The same scanner with arrows proposed by `scorers/aphaia-ml-1.0.json`. |
| Aphaia 1.1 | classical | 1.0 with the face held to its paper (`paperLock`). The default. |

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
4. Change `DEFAULT_SCORER` only once it measures better.

A shipped version is never edited. Fixing one is a new version.
