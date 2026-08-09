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

> On a WA face, the gold spans rings 9 and 10, which is **40% of the face radius**. Always, at every
> face diameter.

Find the gold, and the geometry gives you the rest of the face for free.

## The pipeline

Each video frame goes through five stages. Stages 1 and 2 answer "where is the target"; stages 3 to
5 answer "what has landed on it".

```
frame ─▶ downscale ─▶ find the gold ─▶ fit an ellipse ─▶ FaceLocation
                                                              │
        background model ─▶ difference ─▶ blobs ─▶ face coords ─▶ tracker ─▶ arrows
```

### 1. Downscale (`pixels.ts`)

Detection runs on a box-filtered image, by default a quarter of the camera's width. Every stage is
per pixel, and the loop has to keep up with the video. Nothing here needs the full resolution: an
arrow is several pixels wide even at a quarter scale.

### 2. Find the gold (`face.ts`)

Pixels are converted to HSV and kept when they fall inside a yellow hue window (35° to 70°) with
enough saturation and brightness. Hue and saturation are used rather than RGB because they separate
gold from red far more stably as the light changes through a day.

The largest connected component of that mask is the gold. Anything smaller than a fraction of the
frame is rejected as noise.

### 3. Fit an ellipse (`face.ts`)

The blob's second moments give the ellipse that best matches it. For a filled ellipse the covariance
eigenvalues are `(semi-axis)² / 4`, which recovers both axes and the tilt in closed form, with no
iteration.

An ellipse rather than a circle because a camera beside the shooting line never looks at the boss
square on. Dividing the gold's axes by 0.4 gives the whole face.

**A degenerate case worth knowing about.** A circle has no orientation, and the moment fit will
happily invent one: with the two variances equal, `atan2` lands on 45° and rotates the entire
coordinate frame, so an arrow at 3 o'clock is reported at 12. A face viewed square on is exactly
that case, which is to say the most common one. A near-circular fit is therefore snapped to a true
circle with zero rotation. This was caught by a unit test, not by inspection.

The result is a `FaceLocation`, and with it a pair of transforms between image pixels and normalised
face coordinates. Those normalised coordinates are the *same space the scoring rules already use*,
so a detected point is scored by the very same `scoreAt` that scores a tap.

### 4. Detect what is new (`impacts.ts`)

Arrows are not recognised by shape. They are recognised by **being new**.

A `Background` keeps a per-pixel running mean of the grey scene, updated slowly (2% per frame). The
boss does not move, so anything that departs from that reference has arrived. The learning rate is
deliberately slow: fast adaptation would quietly absorb a newly landed arrow into the background
before it could be reported.

The absolute difference against the reference is thresholded, and connected components over it give
candidate blobs with a centroid and an area. Blobs whose centre falls outside the face are dropped,
which is what ignores a person walking past, the stand, or grass moving in the wind.

### 5. Decide it is an arrow (`tracker.ts`)

A single frame is never trusted. A shadow, a camera nudge, or a hand in front of the boss all
produce a blob once. An arrow, having landed, stays exactly where it is.

So the `ImpactTracker` requires **agreement across consecutive frames**. Candidates accumulate
evidence; a candidate not seen in a frame decays rather than disappearing, so one dropped detection
does not restart the count. After enough consistent frames a candidate is promoted to a confirmed
arrow. Detections within a small radius of an existing arrow are treated as that arrow, not a new
one, so a confirmed arrow is never reported twice however long it stays in the boss.

Position is refined as evidence accumulates: each new observation is averaged into the candidate,
which settles the estimate rather than trusting whichever frame happened to be last.

### Between ends

When the archer accepts an end, `Scanner.accept()` writes the current frame straight into the
background reference and clears the tracker. The arrows now in the boss become the new normal, so
the next end is measured against a face that already holds them.

## Nothing is scored silently

Every detection is a **proposal**. The archer sees each one as a chip with the value it would score,
drops any that are wrong, and taps to keep the rest. A wrong score written silently is worse than no
score at all, so there is no path from the camera to the database that does not pass through a
person.

## What it cannot do

Stated plainly, because the limits are real:

- **No gold, no face.** A field or 3D target, a face with the gold obscured, or a badly lit boss will
  not be located. This is a target archery feature.
- **Affine rectification only.** A camera off to one side is handled. A camera close to a steeply
  angled boss is not: with real perspective, near and far rings differ in scale and an ellipse fit
  cannot express that. A full homography would need four ring correspondences rather than one blob.
- **Touching arrows read as one.** Two arrows close enough to merge into a single blob are a single
  detection.
- **A robin hood is invisible.** An arrow into the nock of another changes almost no pixels.
- **The camera must hold still.** A bumped tripod changes every pixel and looks like the whole face
  arriving at once. The tracker's frame agreement suppresses the resulting burst, but the background
  needs a moment to resettle.
- **Distance limits resolution.** At 70m on a phone camera, the gold may be a few dozen pixels
  across, and an X ring is a fraction of that. The detection still works; the precision does not
  justify trusting the ring it reports.

## Testing it

`src/lib/vision/vision.test.ts` runs the whole pipeline on synthetic frames: an ellipse of target
gold drawn onto flat grey, with dark discs added to play the part of arrows. That covers hue
selection, component labelling, the ellipse fit and its degenerate case, the round trip through the
coordinate transforms, background differencing, blob extraction, the tracker's promotion and decay
rules, and an end-to-end scan that lands an arrow at a known position and checks where it is
reported.

No camera and no fixtures are needed, so these run in the normal unit test suite.
