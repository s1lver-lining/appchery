# Camera scoring

How Appchery reads arrows off a target face using the phone camera.

The code lives in `src/lib/vision/`, is pure TypeScript over plain pixel buffers, and has no
dependency on the DOM, on a model file, or on a network. `src/lib/ui/AutoScore.svelte` is the only
part that touches a camera.

## Why there is no neural network

A learned detector needs labelled examples: thousands of photographs of arrows in bosses, across
face sizes, distances, light, and arrow types. We have none, and collecting them is a project in
itself.

A target face is not an arbitrary object though. It is a **specified** one. World Archery publishes
the geometry, and every WA face, at every size, obeys the same proportions. That turns detection
into measurement rather than recognition, and measurement needs no training set.

The one property the whole pipeline rests on:

> A WA face has ten equal width rings. The gold is rings 9 and 10, so it reaches **2/10 = 20% of the
> face radius**. Always, at every face diameter.

Find the gold, and the geometry gives you the rest of the face for free. This ratio also matches the
zone map in `domain/rounds/seed.ts`, where the 9 ring sits at `r = 0.2`: the same number drives both
drawing and detection, so they cannot drift apart.

Measured on three photographs of real competition faces, the colour transitions land at r = 0.20,
0.41 and 0.62, against the 0.2, 0.4 and 0.6 the geometry predicts.

## The pipeline

Each video frame goes through seven stages. Stages 1 to 5 answer "where are the targets, and are
they really targets"; stages 6 and 7 answer "what has landed on them".

```
frame ─▶ downscale ─▶ find every gold ─▶ seed an ellipse ─▶ fit to the rings ─▶ verify ─▶ faces
                                                                                          │
              background model ─▶ difference ─▶ blobs ─▶ face coords ─▶ tracker ─▶ arrows
```

### 1. Downscale (`pixels.ts`)

Detection runs on a box-filtered image, by default a quarter of the camera's width. Every stage is
per pixel, and the loop has to keep up with the video. Nothing here needs the full resolution: an
arrow is several pixels wide even at a quarter scale.

### 2. Find every gold (`face.ts`)

Pixels are converted to HSV and kept when they fall inside a yellow hue window (38° to 70°) with
enough saturation and brightness. Hue and saturation are used rather than RGB because they separate
gold from red far more stably as the light changes through a day.

Every connected component of that mask is a candidate, largest first, up to twelve of them.
**Not** just the largest: an indoor three spot puts three faces in one frame, and a real gold is
often not the biggest yellow thing in the picture. Raising this cap from four to twelve moved recall
on the annotated set from 87% to 93% on its own.

### 3. Seed an ellipse (`face.ts`)

The blob's second moments give the ellipse that best matches it. For a filled ellipse the covariance
eigenvalues are `(semi-axis)² / 4`, which recovers both axes and the tilt in closed form, with no
iteration.

An ellipse rather than a circle because a camera beside the shooting line never looks at the boss
square on. Dividing the gold's axes by 0.2 gives the whole face.

**A degenerate case worth knowing about.** A circle has no orientation, and the moment fit will
happily invent one: with the two variances equal, `atan2` lands on 45° and rotates the entire
coordinate frame, so an arrow at 3 o'clock is reported at 12. A face viewed square on is exactly
that case, which is to say the most common one. A near-circular fit is therefore snapped to a true
circle with zero rotation. This was caught by a unit test, not by inspection.

This is only a seed. It is what the next stage starts from, not what gets used.

### 4. Fit to the ring structure (`refine.ts`)

The gold blob alone is fragile. Arrows standing in the ten split it into pieces, torn paper eats its
edge, and both the centroid and the area drift with them. Drawing the detected geometry back over
real photographs made this obvious in a way the aggregate numbers did not: a fit can be "within 15%
of the true size" and still visibly off centre.

A target face is far more than its gold though. It is a known sequence of coloured annuli, so the
fit can be scored directly against that: sample many rings, count how many samples show the colour
the geometry predicts, and move the estimate to maximise it. A few arrows cost a few samples, which
is exactly why this survives where a blob measurement does not. The search is a coordinate descent
over centre and both axes with a halving step, kept local because the seed is already close.

Two layouts are scored and the better one taken:

- **Full face**: gold, red, red, blue, blue, black, black, white, out to r = 0.85.
- **Three spot**: printed only to the 6 ring, so blue is the outermost colour and everything past
  r = 0.5 is backing paper.

Both matter. Scoring a three spot against the full layout dragged the fit inward by about 9%, trying
to move the expected white onto the real white. And the three spot layout needs bands on *both*
sides of the spot edge, at 0.48 and 0.54: with only one band outside it, a fit a seventh too large
still scored perfectly, because every sample it took still landed in the right colour.

The result is a `FaceLocation`, and with it a pair of transforms between image pixels and normalised
face coordinates. Those normalised coordinates are the *same space the scoring rules already use*,
so a detected point is scored by the very same `scoreAt` that scores a tap.

### 5. Confirm it is really a face (`rings.ts`)

Finding yellow is not enough, and this was the single biggest source of false positives: a bag, a
jacket, a hazard sign or sunlit grass all produce a large saturated yellow region, and a false face
means every blob on it is reported as an arrow.

So the candidate face is probed at four radii, 32 samples around each circle, and each sample is
classified into a target colour. A face is accepted only when the sequence matches a real one:

| radius | expected |
| ------ | -------- |
| 0.15   | gold |
| 0.25   | red, or black on a two colour face |
| 0.45   | blue |
| 0.65   | black |

Probes sit in the **middle** of a ring, never on a boundary. Ring N ends at r = (11 − N)/10, so 0.15
is inside the 9, 0.25 inside the 8, 0.45 inside the 6 and 0.65 inside the 4. This is not a detail:
probing at 0.5 straddled the outer edge of a three spot's paper and sampled half blue, half backing,
which alone failed nearly half of them. Fixing it took recall from 55% to 87%.

Acceptance needs the gold *plus* either the full colour sequence (red, then blue or black further
out) or a plain gold-inside-black face. Agreement of 62% per ring is enough, because an arrow shaft
crossing a ring costs a few samples. Samples falling outside the image are skipped rather than
counted as failures, so a camera zoomed in on the boss still passes on the rings it can see.

Mid grey is deliberately classified separately from black. Lumping them together let a grey wall
behind a yellow object read as the dark surround of a face, which is exactly the false positive this
stage exists to stop.

### 6. Detect what is new (`impacts.ts`)

Arrows are not recognised by shape. They are recognised by **being new**.

A `Background` keeps a per-pixel running mean of the grey scene, updated slowly (2% per frame). The
boss does not move, so anything that departs from that reference has arrived. The learning rate is
deliberately slow: fast adaptation would quietly absorb a newly landed arrow into the background
before it could be reported.

The absolute difference against the reference is thresholded, and connected components over it give
candidate blobs with a centroid and an area. Blobs whose centre falls outside the face are dropped,
which is what ignores a person walking past, the stand, or grass moving in the wind.

### 7. Decide it is an arrow (`tracker.ts`)

A single frame is never trusted. A shadow, a camera nudge, or a hand in front of the boss all
produce a blob once. An arrow, having landed, stays exactly where it is.

So the `ImpactTracker` requires **agreement across consecutive frames**. Candidates accumulate
evidence; a candidate not seen in a frame decays rather than disappearing, so one dropped detection
does not restart the count. After enough consistent frames a candidate is promoted to a confirmed
arrow. Detections within a small radius of an existing arrow are treated as that arrow, not a new
one, so a confirmed arrow is never reported twice however long it stays in the boss.

Position is refined as evidence accumulates: each new observation is averaged into the candidate,
which settles the estimate rather than trusting whichever frame happened to be last.

### Two guards against a flood of proposals

Detection is gated on the face having **held still** for several frames. A face that jumps between
detections is a new detection rather than the same one, and the settle counter restarts. Without
this, a face whose fit wobbles produces coordinates that move every frame, so every frame's blobs
look like new arrows.

Promotion is also **capped at the end's remaining arrows**. The cap is applied inside the tracker,
during promotion, not after: checking it beforehand still let a single frame confirm several arrows
at once.

### Between ends

When the archer accepts an end, `Scanner.accept()` writes the current frame straight into the
background reference and clears the tracker. The arrows now in the boss become the new normal, so
the next end is measured against a face that already holds them.

## Nothing is scored silently

Every detection is a **proposal**. The archer sees each one as a chip with the value it would score,
drops any that are wrong, and taps to keep the rest. A wrong score written silently is worse than no
score at all, so there is no path from the camera to the database that does not pass through a
person.

## Inspecting a single picture

`./scripts/detect_arrows.sh <image> [-o overlay.png]` runs the face stage over one photograph and
writes an overlay with the detected rings and candidate arrows drawn on it. Any format the browser
can decode works, and `--json` prints the raw result instead.

The overlay is the point. Ring circles drawn back onto a real photograph show a bad fit instantly,
where a percentage does not, and that is how the two worst geometry bugs in this pipeline were
found.

Arrow detection there is **weaker than the video path and is not a score**. A still has no quiet
reference frame, so being new is not a signal that exists; the fallback looks for patches whose
colour does not match the ring they sit in. That alone flagged the numbers printed on the face as
the largest anomalies on every photograph tried, so a candidate must also be *darker* than the paper
of its own ring: an arrow and the hole it makes are physically darker, while the printed numbers are
lighter. Holes, tears, creases and shadows still qualify. Use the camera for actual scoring.

`--scale 2` samples finer and finds more, at the cost of more noise.

## What it cannot do

Stated plainly, because the limits are real:

- **No gold and the right rings around it, no face.** A field or 3D target, a face with the gold
  obscured, or a badly lit boss will not be located. This is a target archery feature, and the ring
  check makes that deliberate rather than incidental.
- **Affine rectification only.** A camera off to one side is handled. A camera close to a steeply
  angled boss is not: with real perspective, near and far rings differ in scale and an ellipse fit
  cannot express that. A full homography would need four ring correspondences rather than one blob.
- **Touching arrows read as one.** Two arrows close enough to merge into a single blob are a single
  detection.
- **Perspective is the sharpest limit in practice.** A face photographed from well off to one side,
  or lying at an angle to the camera, fits an ellipse that drifts: the near rings and the far rings
  do not share a scale, and an affine fit cannot express that. The ring fit hides some of it by
  splitting the error, which makes it more dangerous, not less. Shoot the camera square on.
- **A robin hood is invisible.** An arrow into the nock of another changes almost no pixels.
- **The camera must hold still.** A bumped tripod changes every pixel and looks like the whole face
  arriving at once. The tracker's frame agreement suppresses the resulting burst, but the background
  needs a moment to resettle.
- **Distance limits resolution.** At 70m on a phone camera, the gold may be a few dozen pixels
  across, and an X ring is a fraction of that. The detection still works; the precision does not
  justify trusting the ring it reports.

## Multiple faces at once

Each face carries its own coordinate frame, so an arrow in the gold of one face and an arrow in the
gold of another are *both* at the origin. Impacts therefore record which face they landed on, and
the tracker will not merge two detections unless they share it. Face indices are kept stable between
detections by matching each new face to the nearest previous one, so arrows already being tracked
are never reattributed.

This is what makes an indoor three spot work, where the end is one arrow on each of three faces.

## How reliable is it

Measured, not asserted. `scripts/eval-vision.mjs` runs the face stage over a labelled dataset and
reports recall, false faces, and how accurate the fit is. The imagery is large and third party, so
it is not in the repository; the script explains the layout it expects.

Against 2048 annotated faces (650 photographs of indoor three spots, phone cameras, club lighting):

| measure | result |
| ------- | ------ |
| faces found and accepted | **95–97%** |
| false faces | 0.01 per image |
| centre error | 2.5% of the spot radius (median) |
| size error | −1.5% (median), 3.6% at p90 |

For scale, the same harness measured **55%** recall before this round of work.

Two things are worth saying about how that number was reached. Every change was kept or discarded on
what the harness reported, and one plausible idea was discarded that way: fitting an ellipse to the
gold's *outer boundary* by ray casting, instead of to its area, sounded obviously more robust to
arrow holes. It measured worse (89% against 91% geometry, and far worse once the ring check ran),
so it is not in the code.

The aggregate number also hid a real failure. Drawing the detected rings back onto photographs
showed faces that scored well on the metric but were visibly off centre, which is what motivated
fitting to the ring structure. **Look at the overlays, not only at the percentages.**

## Testing it

Two layers. `src/lib/vision/vision.test.ts` runs the whole pipeline on synthetic frames: an ellipse of target
gold drawn onto flat grey, with dark discs added to play the part of arrows. That covers hue
selection, component labelling, the ellipse fit and its degenerate case, the round trip through the
coordinate transforms, background differencing, blob extraction, the tracker's promotion and decay
rules, and an end-to-end scan that lands an arrow at a known position and checks where it is
reported.

No camera and no fixtures are needed, so these run in the normal unit test suite. They also earn
their keep: the three spot scale problem and the arbitrary rotation of a circle were both found by a
test, not by inspection.

`scripts/eval-vision.mjs` is the second layer, over real photographs. Synthetic frames prove the
maths; only photographs say anything about real paper, real light and real backgrounds. Run it after
any change to the face stage:

```
node scripts/eval-vision.mjs --limit 300
node scripts/eval-vision.mjs --limit 300 --tune '{"detect":{"limit":4},"rings":{}}'
```

The `--tune` flag overrides thresholds without a code edit, which is how the current defaults were
chosen.
