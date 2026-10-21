# Scorer versions

The arrow scorer is versioned so a result can always be compared with an older one. The archer picks a
version in Settings, the labelling page picks one for its scorecard and its player, and the harnesses
take `--scorer <id>`.

| Version | Kind | What it is |
| --- | --- | --- |
| Aphaia 1.0 | classical | The written detector as of October 2026, with gravity for which way is up. |
| Aphaia ML 1.0 | learned | The same scanner with arrows proposed by `scorers/aphaia-ml-1.0.json`. |
| Aphaia 1.1 | classical | 1.0 with the face held to its paper (`paperLock`). |
| Aphaia 1.2 | classical and learned | 1.1 with marks proposed on fewer than a quarter of the passes left out (`sweep.minShare`), a face kept through one pass it was missed on (`holdBlink`), a fit from the search turned onto the followed one from any angle (`alignWhole`), and on one pass in four the shafts read as lines by `shafts.ts`, with a learned tip, alongside the dark runs. What "Latest model", the default, runs today. It was tried as 1.2alpha, which a stored choice follows to it. |

## Aphaia 1.2: shafts read either way, with a learned tip

The written proposer looks for pixels darker than the paper. Against the nocks placed by hand on 456
shafts, it found 81% of them as a run, kept 42%, and read the tip within 0.05 radii on 23%. A light grey
shaft is lighter than the black and blue rings it crosses and as light as worn paper, so it comes back
in pieces and fails the ridge test: that is October, where 1.2alpha found 16 of 66 arrows.

`shafts.ts` reads a shaft as a line that stands out from both its sides, darker or lighter. Ridges come
from the Hessian, vote along their own bearing, and are walked; a frame's thirty best lines hold 85 to
90% of the labelled shafts. A network of about two thousand weights then reads a straightened strip of
pixels along each line and says whether it is a shaft and where along it the arrow enters the paper.
It is trained on the nock lines, and on lines where a dark run and the line finder agree through a
labelled tip, which are right 86% of the time and are what teach it the sessions with no nocks.

Its marks are added to the dark runs' wherever none of them lies on the same shaft, on one pass in
four, and a mark has to be proposed on a quarter of the passes. Measured with `--slower 0`, each
recording day by a model trained without it (the sum is what a new day can expect), and over three
training seeds:

| | found | spurious |
| --- | --- | --- |
| 1.2alpha | 227/374 | 55 |
| 1.2, held out, three seeds | 228, 236, 231 | 26, 31, 27 |
| 1.2 as shipped, every day in its training | 244/374 | 29 |

By month as shipped: August 99 to 101 of 161 found and 20 to 8 spurious, September 112 to 113 of 147 and
15 to 11, October 16 to 30 of 66 and 20 to 10.

What did not work, or was not worth it:

- The shafts alone, without the dark runs: 192 found and 100 spurious. With only August's nocks, the
  network had not seen the dark shafts of August and September.
- Both proposers on every pass: 257 found but 116 spurious. A shaft only one proposer reads is kept
  only if proposed on enough passes, and reading shafts on one pass in two, three or four is what keeps
  the extra marks out; one in four did as well as one in two.
- Matching the two proposers' marks by distance only: one shaft read at two places along it became two
  marks. Matching by the shaft's line took 22 of 91 spurious marks out.
- A higher confidence for a shaft no dark run agrees with (`shaftsSure`), the network judging the dark
  runs too (`shaftsJudge`), holding the shafts to leaning together (`shaftsStand`), and two networks
  taking turns (`shaftsAlso`): none measured better than the noise between training seeds, about ten
  arrows.
- A strip half as long (1.5 radii): better per strip, worse end to end over two seeds.
- `minShare` 0.2 finds more, 242 on average held out, with 52 spurious; 0.3 drops to 215 found.

The cost is the limit. A pass costs 47 ms on average for 1.2alpha on this machine and about 60 for 1.2,
a shaft pass about 100. Run three times slower, as a phone might, 1.2alpha takes 4,522 passes over the
recordings and the width 16 network of the trials took 2,390; the width 8 one that shipped took 2,974,
found 228 against 236 and had 36 spurious against 51. Measure on a phone before trusting either number.

Training: `scripts/train-shafts/run.sh`, on the GPU when there is one (forty seconds a model). The day
held out models it writes are what `eval-arrows-video.mjs --shafts` measures a day with.

## Aphaia 1.2alpha: marks have to keep being seen

The preview that became 1.2, kept for its numbers.

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
| with `holdBlink` and `alignWhole` (1.2alpha now) | 227 | 55 |
| and `sweep.shortAsUnsure` | 234 shown, 227 scored | 79 shown, 49 scored |

`alignWhole` fixes the turns of about a quarter that four recordings took: every one landed on a pass
with a face search (every 15th), whose fit comes out of an ellipse at any quarter turn, and was turned
back onto the followed fit within 15° only, so it kept the wrong quarter.

### Why the scorer misses arrows

Per pass, over 5600 steady passes, a real arrow is proposed within 0.05 radii on a median of 39% of them
(44% with each pass's drift taken out), and 2.4 of the 4.9 proposals a pass are false. The tracker can
only work with that. By month:

| | August | September | October |
| --- | --- | --- | --- |
| median share of passes proposing an arrow, within 0.05 r | 0.40 | 0.45 | 0.12 |
| within 0.12 r | 0.62 | 0.59 | 0.26 |

1.2alpha finds 211 of the 308 arrows of August and September and 16 of the 66 of October. October is
other kit on a worn face: light grey shafts grouped in a gold full of holes and torn paper. Its
proposals fall along the shafts below the tips, so the proposer sees the shafts and loses where they
end. Face size looked like a cause and is not: the crop reads every face at 120 to 150 px of radius,
and the small faces are all October ones. `contrast: 'colour'` found 18 of the 66 against 16.

So the limit is the proposer's reading of where a shaft ends on a busy face, not orientation or
tracking: orientation fixed in full added 3 arrows, and drift taken out per pass 0.05 of share.

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
