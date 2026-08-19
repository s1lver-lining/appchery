# Camera scoring

How Appchery reads arrows off a target face using the phone camera.

The code lives in `src/lib/vision/`, is pure TypeScript over plain pixel buffers, and has no
dependency on the DOM, on a model file, or on a network. `src/lib/ui/AutoScore.svelte` is the only
part that touches a camera.

## How the archer uses it

The camera is carried. The archer shoots the end, walks up to the boss, and sweeps the phone across
it for a few seconds before scoring. Everything below follows from that, and an earlier version of
this document described a different thing: a phone on a tripod watching arrows land.

That difference is not cosmetic. A tripod gives the single strongest signal there is, a quiet frame
of the boss before the arrows arrived, and the first version of the arrow stage was built entirely on
it. On a walk up there is no such frame: the arrows are already in the paper when recording starts,
so nothing is ever new, and that detector reported exactly zero arrows on fifteen real sessions. What
replaces it is agreement across viewpoints, described under "Deciding it is an arrow" below.

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

The fit moves over centre, axes **and tilt**. Tilt was missing at first, and a seed that started at
the wrong angle could never recover: the axes stretched to cover the error instead, which dragged the
outer rings off the face. A shaft standing in the gold splits it into a crescent whose moments point
along the arrow rather than at the target, so the fit is also tried from a circle of the same area,
and the better of the two is kept. A face photographed anywhere near square on is close to a circle,
which is what makes the second start worth its cost.

Boundaries are scored as well as interiors. A ring is a tenth of the radius wide, so a fit can be out
by nearly half a ring and still land every interior sample in the right colour, and that slack grows
with radius: the gold sits perfectly while the blue and the black creep outwards. Sampling just
inside and just outside each boundary, and asking for both colours at once, is what pins the geometry
to the printed rings.


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

**A boss leans back.** An archer walking up to the target is close enough that near and far rings do
not share a scale, which an ellipse cannot express. The error this causes is not a fit that looks
wrong: it is the centre creeping towards the far side of the face, because the centre of a projected
ellipse is simply not the projection of the circle's centre. Measured against faces fitted by hand,
that put the gold about a twentieth of a face radius too high, consistently, on every recording.

So the fit carries two more numbers for how far the face leans, which makes it a full projection
rather than an affine one. Two things had to be true before that helped:

- **The lean cannot be walked to one number at a time.** Tilting a face about a fixed centre moves
  every ring at once and always scores worse, so a coordinate descent puts the lean straight back.
  The lean and the centre are the same error seen twice and have to move together. Trying a handful
  of fixed leans and letting the centre settle under each one crosses that valley; walking downhill
  never leaves it.
- **The ring check has to look through the lean too.** It did not, and sampled a flat circle instead,
  so the better the fit described a leaning boss the worse it did on the check meant to confirm it.
  That alone was rejecting good faces and cost recall on the annotated set.

The search is skipped when a flat face already explains the paper, which is nearly always true of a
three spot across a hall. Face size looks like the way to decide and is not, because a distant three
spot fills as much of the frame as a boss up close.

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

### One look is not two

Evidence is gathered per place on the face, not per frame, and the passes it is gathered from have to
be genuinely different views of the boss. Sampling faster does not help and actively hurts: at twice
the rate, arrows found fell from 46% to 25% and false ones doubled. Two passes a third of a second
apart are the same picture twice, so a shadow that reads as an arrow reads as one in both and gathers
votes exactly as fast as a real shaft does, while the extra passes dilute the share of them each
candidate has to reach. Three times a second is roughly the rate at which a carried camera actually
presents a new view of the boss.

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

`./scripts/arrow_detector.sh <image> [-o overlay.png]` runs the detector over one photograph and
writes an overlay with the fitted rings, the shafts it followed and the impact it read for each. Any
format the browser can decode works, and `--json` prints the raw result instead.

The overlay is the point. Ring circles drawn back onto a real photograph show a bad fit instantly,
where a percentage does not, and that is how the two worst geometry bugs in this pipeline were found.
It has since done the same for the arrow stage: the overlay is what showed that most of what the
detector called an arrow was a printed ring line, and later that each arrow was being reported three
or four times.

### Finding arrows without a reference frame

The video path recognises an arrow by it being *new*, which needs a quiet frame of the boss to
compare against. A single picture has no such frame, so the signal has to come from the arrow's own
shape. A shaft sticking out of a face is a long, thin, dark streak, and nothing printed on a face
looks like that: the numbers are compact, the ring lines are circles, and creases are faint.

Four things had to be true before this worked at all, each one found by measuring, and each one
having been wrong first:

- **Lines are voted for, not grown.** Region growing was the obvious approach and it fails on exactly
  the picture that matters: arrows in a group cross each other on their way out of the boss, so three
  shafts come back as one blob whose axis belongs to none of them. A Hough vote over bearings
  separates crossing lines by construction.
- **The impact is the inner end of the streak.** An arrow leans out of the face towards the lens, so
  on a camera anywhere near the target's axis the buried end is the one nearer the centre.
- **A shaft is a ridge.** It is darker than the paper *on both sides*. A boss rim, a shadow, and the
  edge of a broadcast scoreboard graphic are dark on one side only, and those were what survived every
  test based on shape alone.
- **A shaft crosses rings; a printed line does not.** A ring line keeps its radius along its whole
  length. Requiring a streak to spend some of its length climbing outwards removed almost every false
  positive at once.

The paper it is compared against is modelled per radius *and* per bearing, as a median, so arrows
cannot drag down their own baseline and one side of a boss being better lit than the other is not
mistaken for an arrow. The number of radial bins is capped to the face's radius in pixels: a bin
thinner than a pixel holds so little that its median becomes whatever lies there, which on a face with
an arrow in it is the arrow.

One arrow answers several times, since the two edges of a shaft are separate lines, a ring crossing
splits it into fragments, and the run often carries on past the hole to the far side of the face.
Every repeat sits on the arrow's own line, so duplicates are removed by collinearity rather than by
distance, and the longest run wins.

`--scale 1` samples finer and finds more, at the cost of noise and time.

## What it cannot do

Stated plainly, because the limits are real:

- **No gold and the right rings around it, no face.** A field or 3D target, a face with the gold
  obscured, or a badly lit boss will not be located. This is a target archery feature, and the ring
  check makes that deliberate rather than incidental.
- **Affine rectification only.** A camera off to one side is handled. A camera close to a steeply
  angled boss is not: with real perspective, near and far rings differ in scale and an ellipse fit
  cannot express that. A full homography would need four ring correspondences rather than one blob.
- **Touching arrows read as one.** Two arrows close enough to merge into a single blob are a single
  detection, and in a still, two arrows lying on nearly the same line are deliberately merged.
- **A still is not a score.** See the measured numbers below. Scoring from a single photograph is a
  reviewing aid, not a scorer.
- **Two arrows shot from very different places may not both be found.** Weak candidates are judged
  against the strongest arrow in the picture, which assumes they are the same shaft at the same lens.
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

## Following the face between detections

Detection is far too slow to run on every video frame, and running it there made the overlay visibly
lag behind whatever the archer was pointing at. The two jobs are therefore separated:

- **Every frame**, the faces already found are refitted from where they were. That is a local descent
  over a few hundred pixel reads, so the rings track the camera at the display's own rate.
- **Three times a second**, the full search runs: new faces, the ring check, and the arrow pass. Far
  more often than an arrow actually arrives.

The frame is reduced to detection scale by drawing the video straight onto a smaller canvas, which
hands the scaling to the GPU. Doing it in a loop over every pixel, which is what the code used to do,
cost more than the detection it was feeding.

A face that moves while being tracked resets the settling counter, so arrows are never taken from a
camera that is being carried.

## Not trusting a single moment

Two things stop the live path inventing arrows, both of which were added because they were needed:

- **A frame that lights up everywhere is movement, not shooting.** Arrows arrive one at a time. A
  hand across the boss, or a phone gripped harder, changes half the face at once, so a frame with too
  many detections rolls back the evidence it would otherwise have added.
- **A confirmed arrow stays on probation.** A confirmed position used to be skipped on every later
  frame, so it was never asked for evidence again and a single bad moment left a score on the screen
  for the rest of the end. A real arrow goes on differing from the background for seconds after it
  lands, until the running mean absorbs it; one that stops immediately is retired.

## Multiple faces at once

Each face carries its own coordinate frame, so an arrow in the gold of one face and an arrow in the
gold of another are *both* at the origin. Impacts therefore record which face they landed on, and
the tracker will not merge two detections unless they share it. Face indices are kept stable between
detections by matching each new face to the nearest previous one, so arrows already being tracked
are never reattributed.

This is what makes an indoor three spot work, where the end is one arrow on each of three faces.

## How reliable is it

Measured, not asserted, and the two stages are measured apart because a single number hides which one
lost the arrow. Both datasets are large and third party, so neither is in the repository; the scripts
explain the layout they expect.

### Finding the face

`scripts/eval-vision.mjs`, against 2048 annotated faces (650 photographs of indoor three spots, phone
cameras, club lighting):

| measure | result |
| ------- | ------ |
| faces found and accepted | **97.0%** |
| false faces | 0.02 per image |
| centre error | 2.3% of the spot radius (median) |
| size error | −1.0% (median), 4.8% at p90 |

For scale, the same harness measured **55%** recall before this work began, and 96.2% before the fit
was taught to use ring boundaries.

### Finding the face on a recording

`scripts/eval-faces.mjs`, against 27 faces fitted by hand across the fifteen recordings. The archer
drags four anchors onto the black to white edge, which is the strongest circle on a WA face, and four
points fix a projection exactly. Only what those labels actually assert is measured: that each of
those four points sits at r = 0.8. Whole coordinate frames are not compared, because a target face is
rotationally symmetric and the handles are not 90 degrees apart on the face anyway.

| measure | before | after |
| ------- | ------ | ----- |
| faces found | 27/27 | 27/27 |
| ring radius error, median | 1.2% of face radius | **1.2%** |
| ring radius error, p90 | 6.2% | **1.7%** |
| off centre, p90 | 8.8% | **2.6%** |

The median was never the problem; the tail was. What fixed it is described under "A boss leans back"
above. On the 2048 annotated three spots the same change took recall from 98.5% to 99.0% with false
faces unchanged at 0.01 per image.

### Finding the arrows on a recording

`scripts/eval-arrows-video.mjs`, against 84 impacts placed by hand across fourteen recordings. This is
the question the archer asks: they swept the camera over the boss for three seconds either side of a
moment, and there were six arrows in the paper.

| detector | arrows found | ever proposed | false proposals |
| -------- | ------------ | ------------- | --------------- |
| differencing, as first built | **0%** | 0% | 0 |
| shape, per frame agreement | 35% | 71% | 1.3 per end |
| shape, viewpoint agreement | 46% | 71% | 1.9 per end |
| learned, viewpoint agreement | 36% | 74% | 3.9 per end |
| both proposing together | **52%** | **87%** | 2.9 per end |

"Ever proposed" is the ceiling: an arrow no pass ever proposed cannot be confirmed by any amount of
agreement. Reporting it separately is what showed that the tracker, not the detector, was throwing
away half of what was found, and tuning the tracker to that was worth eleven points on its own.

**This is not good enough to score with, and it is not presented as if it were.** Half the arrows are
found, and of the six proposals an end is offered, two or three are wrong. The archer confirms every
one, so a wrong proposal costs a tap; but an archer who has to place half the end by hand is not being
helped very much.

The learned detector does not beat the written one, and the reason is the dataset rather than the
idea. Fourteen recordings is fourteen arrangements of arrows, however many frames each one lasts, and
no amount of rotating and flipping a crop makes a fifteenth. Held out by recording, which is the only
honest split, it reaches 39% recall per frame. It is worth keeping because its mistakes are not the
same mistakes: pooling both detectors' proposals lifts the ceiling from 71% to 87%, which is the
largest single gain measured here and the one thing that clearly needs more data rather than more
cleverness.

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
