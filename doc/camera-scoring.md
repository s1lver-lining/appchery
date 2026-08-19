# Camera scoring

How Appchery reads a target face and the arrows in it through the phone camera.

The code lives in `src/lib/vision/`, is pure TypeScript over plain pixel buffers, and depends on no
DOM, no model file and no network. `src/lib/ui/AutoScore.svelte` is the only part that touches a
camera.

## How it is used

The archer shoots the end, walks up to the boss, and sweeps the phone across it for a few seconds
before scoring. Everything here follows from that. The camera is carried, never still; the arrows are
already in the paper before the camera ever sees it; and the same arrows are seen from a few dozen
viewpoints in the space of a couple of seconds.

That last point is what the detector is built on. It is also what makes a phone on a tripod, watching
arrows arrive, a different problem that this does not attempt.

## Where it stands

Measured, not asserted. The two stages are measured apart, because one number hides which of them
lost the arrow.

| | measure | result |
| --- | --- | --- |
| **Face** | found, on 27 faces fitted by hand | 27 / 27 |
| | ring radius error | **0.7%** of face radius median, 1.1% at p90 |
| | off centre | 0.9% median, 1.5% at p90 |
| | found, on 2048 annotated three spots | 98.3% |
| | false faces | 0.01 per image |
| | overlay tremble, drawn steadied | 0.10% of radius, from 0.24%, never more than 0.1 ring behind |
| | cost | 2.8x realtime on a laptop core |
| **Arrows** | found, of 84 impacts placed by hand | **51%** |
| | ever proposed, the ceiling | 85% |
| | false proposals | 2.1 per end |
| | impact error | **2.0%** of face radius median |

A ring is a tenth of the radius, so the face is placed to within a fifteenth of a ring, and it keeps
up with the camera with room to spare on a slow phone. That part is solved.

One thing the rings cannot say is which way round the face is, because a target face is the same face
turned through any angle. The fit takes that freedom and wanders with it, which leaves the geometry
and the drawn rings right — rings being circles — while everything measured in face coordinates turns
slowly underneath the paper. That showed as arrows drifting round a circle centred on the gold a few
seconds into a sweep. `alignFace` in `face.ts` fixes the angle to the previous frame's before the fit
is used, which cannot say what the true angle is and does not need to. It was worth thirteen points of
arrows found on its own.

What is left of the face fit is not error but movement. The fit is measured afresh every frame, so it lands a
fraction of a pixel differently each time, and the eye sees a line move far more readily than it sees
where a line is. `steady.ts` damps that in the drawing alone, by how fast the fit is actually
travelling, so a sweep is followed outright and a held phone draws a held overlay. Nothing measured
or reported goes through it.

The arrows are not solved. About three arrows of a six arrow end come back, along with a couple of
proposals that are wrong. The archer confirms every one, so a wrong proposal costs a tap rather than a
wrong score, and the ones that are right are placed to within a fifth of a ring. It is a help, not a
scorer.

The ceiling matters as much as the number found: an arrow that no pass ever proposed cannot be
confirmed by any amount of agreement, and about one in seven is never proposed at all. That is the
detector failing to see a shaft, not the tracker discarding one.

**The objective is every arrow found, with proposals an archer can accept almost without thinking.**
The gap to it is data rather than method: fourteen recorded sweeps is fourteen arrangements of
arrows, and that is what currently limits both detectors.

## Finding the face

### 1. Downscale (`pixels.ts`)

Detection runs on a box filtered image, a quarter of the camera's width. Every stage is per pixel and
the loop has to keep up with the video, and nothing here needs the full resolution: measured against
faces fitted by hand, a quarter scale fit is as accurate as a full scale one and four times cheaper.

### 2. Find every gold (`face.ts`)

Pixels go to HSV and are kept inside a yellow hue window with enough saturation and brightness. Hue
and saturation rather than RGB, because they separate gold from red far more stably as the light
changes through a day.

Every connected component is a candidate, largest first, up to twelve. **Not** just the largest: an
indoor three spot puts three faces in one frame, and a real gold is often not the biggest yellow
thing in the picture.

### 3. Seed an ellipse (`face.ts`)

The blob's second moments give the ellipse that best matches it, in closed form. The gold is rings 9
and 10 of ten equal rings, so it reaches 2/10 of the face radius, and dividing by that gives the whole
face. This is only a seed: it says roughly where and roughly how big, and nothing else is asked of it.

### 4. Fit to the rings (`refine.ts`)

**A face is four points, not an ellipse.** The geometry carried around is the four points at the ends
of two perpendicular diameters of the boundary between the black and the white, which ten equal rings
put at r = 0.8. Four point correspondences are exactly what a projection takes, so those four say
everything about how the face is being seen: where, how big, which way round, how foreshortened by
standing off to one side, and how much nearer the bottom of the boss is than the top.

An ellipse cannot say the last of those. A boss leans back on its stand and the archer walks right up
to it, so near and far rings genuinely do not share a scale. Describing the rest as a centre, two
axes and an angle has a worse problem: seen square on the axes are equal and the angle means nothing
at all, so a pixel of noise sends it anywhere and the overlay lurches as the phone turns.

**The fit is scored on the colour change across each ring boundary.** Each boundary is read just
inside and just outside, across a band barely wider than the printed line, and what is measured is
how much of the change there is the change that boundary should show: gold gives way to red, red to
blue, blue to black, black to white. Nothing else on a boss makes those particular moves in those
particular places. An arrow crossing the ring, a torn edge or a patch of shade moves the colour some
other way and scores nothing, rather than scoring against.

Asking instead whether the colour is *right* on each side, which is what this used to do, has a flat
answer: the fit can sit a good fraction of a ring out and every sample still lands well inside the
correct colour, so nothing tells it which way to move. The band is never allowed narrower than about
a pixel, or on a face across a hall both reads land on the same pixel and measure nothing.

Colour agreement over the ring interiors is still scored alongside, at half the weight. The
boundaries are sharp enough to say exactly which geometry is right but blind to whether the thing is a
target face at all; the interiors say that, over a broad range of geometries that are all nearly
right. Neither is enough alone.

**The search moves the four points together before it moves them singly.** Translation, scale,
stretch and rotation can only ever produce a face that could really be seen, so the fit is nearly
right before it is given the freedom to be strange, and that freedom is then used only for the little
that is left. Four free points warped one corner at a time will otherwise find a shape that scores
well by accident.

Two starts are always tried, the blob's own moments and a circle of the same area. When an arrow
splits the gold, the largest surviving piece is a crescent whose moments give an ellipse stretched
along the shaft, and four points let a start that bad settle somewhere worse than an ellipse could.

### 5. Confirm it is really a face (`rings.ts`)

Finding yellow is not enough, and this is the single biggest source of false positives: a bag, a
jacket, a hazard sign or sunlit grass all produce a large saturated yellow region, and a false face
means every blob on it is reported as an arrow.

The candidate is probed at four radii, 32 samples around each, and each sample is classified into a
target colour. A face is accepted only when the sequence matches a real one:

| radius | expected |
| ------ | -------- |
| 0.15 | gold |
| 0.25 | red, or black on a two colour face |
| 0.45 | blue |
| 0.65 | black |

Probes sit in the **middle** of a ring, never on a boundary. Ring N ends at r = (11 − N)/10, so 0.15
is inside the 9, 0.25 inside the 8, 0.45 inside the 6 and 0.65 inside the 4. Probing at 0.5 straddled
the outer edge of a three spot's paper and sampled half blue, half backing, which alone failed nearly
half of them.

The probes go through the face's own projection. Sampling a flat circle instead probes the wrong
pixels on a face that is not flat, so the better the fit described a leaning boss the worse it did on
the check meant to confirm it.

Mid grey is classified separately from black, or a grey wall behind a yellow object reads as the dark
surround of a face.

### Following between detections

The full search runs a few times a second. In between, every frame, the face already found is refitted
from where it was, which is a local descent over a few hundred pixel reads, so the rings track the
camera at the display's own rate.

Following uses a finer step than searching. A camera panning slowly moves the face less than a pixel
between frames, and a step floor of a pixel cannot express that: the fit sat still for several frames
and then jumped, which is the overlay stepping rather than following. It starts from the last frame's
answer, so the finer steps cost few rounds.

**The overlay draws each ring through the projection, not as an ellipse.** The ellipse that matches a
projection near the middle does not match it at the edge: drawn that way the gold sits perfectly while
the outermost ring lands a couple of rings inside where it belongs, which looks like a fit that cannot
hold its scale and is really just the wrong curve.

## Finding the arrows

### 6. What a shaft looks like (`still.ts`)

Every detection pass proposes arrows from shape alone. A shaft sticking out of a face is a long, thin,
dark streak, and nothing printed on a face looks like that: the numbers are compact, the ring lines
are circles, and creases are faint.

Four things have to be true for this to work at all:

- **Lines are voted for, not grown.** Arrows in a group cross each other on the way out of the boss,
  so region growing returns three shafts as one blob whose axis belongs to none of them. A Hough vote
  over bearings separates crossing lines by construction.
- **The impact is the inner end of the streak.** An arrow leans out of the face towards the lens, so
  the buried end is the one nearer the centre.
- **A shaft is a ridge**, darker than the paper on both sides. A boss rim, a shadow and the edge of a
  scoreboard graphic are dark on one side only.
- **A shaft crosses rings; a printed line does not.** A ring line keeps its radius along its whole
  length, so requiring a streak to spend some of its length climbing outwards removes almost every
  false positive at once.

The paper it is compared against is modelled per radius *and* per bearing, as a median, so arrows
cannot drag down their own baseline and one side of a boss being better lit than the other is not
mistaken for an arrow.

### 7. Deciding it is an arrow (`sweep.ts`)

Evidence is gathered per place on the face, not per frame.

A shaft is a real object standing in the paper. It looks like an arrow from every angle, and because
the face gives a rectified frame it reports the *same face coordinate* from every angle. An old hole,
a pencil mark or a crease can look like a shaft from one particular viewpoint, but it does not keep
agreeing with itself as the camera moves, and a shadow moves when the camera does.

So what promotes a candidate is agreement across viewpoints, not persistence across consecutive
frames. That distinction is the whole thing: consecutive frames of a carried camera are nearly the
same picture, so agreeing with the previous frame proves very little, while agreeing with a frame
taken from two steps to the left proves a great deal.

**One look is not two.** Sampling faster does not help and actively hurts: at twice the rate, arrows
found nearly halved and false ones doubled. Two passes a third of a second apart are the same
picture twice, so a shadow that reads as an arrow reads as one in both and gathers votes exactly as
fast as a real shaft does, while the extra passes dilute the share of them each candidate must reach.
Three times a second is roughly the rate at which a carried camera presents a genuinely new view.

Promotion is capped at the end's remaining arrows, inside the tracker rather than after it. Sorted by
evidence, so the best supported candidate takes the last free slot.

### Between ends

The arrows stay standing in the boss after an end is taken, and nothing here can tell an arrow of this
end from one of the last by looking. So accepting an end remembers those places as scored, and
anything proposed there afterwards is ignored rather than offered again.

## Nothing is scored silently

Every detection is a **proposal**. The archer sees each one as a chip with the value it would score,
drops any that are wrong, and taps to keep the rest. A wrong score written silently is worse than no
score at all, so there is no path from the camera to the database that does not pass through a person.

## Detection never stalls the camera

Detection runs in a worker (`detector.worker.ts`). The render thread follows the face every frame and
draws, and it never waits for a detection: a frame offered while the worker is busy is dropped rather
than queued, because a queue only answers questions about a boss the camera has stopped pointing at.

What comes back is in face coordinates, and that is what makes the split safe. An arrow is at the same
place on the face however far the camera has moved since the frame it was found in, so a result that
arrives late is still drawn in the right place. Inline, a pass taking 600ms was 600ms in which the
video did not repaint.

## Multiple faces at once

Each face carries its own coordinate frame, so an arrow in the gold of one face and an arrow in the
gold of another are *both* at the origin. Impacts therefore record which face they landed on, and the
tracker will not merge two detections unless they share it. Face indices are kept stable between
detections by matching each new face to the nearest previous one.

This is what makes an indoor three spot work, where the end is one arrow on each of three faces.

## What it cannot do

- **No gold and the right rings around it, no face.** A field or 3D target, or a face with the gold
  obscured, will not be located. This is a target archery feature, and the ring check makes that
  deliberate rather than incidental.
- **Touching arrows read as one.** Two arrows close enough to merge are a single detection.
- **A robin hood is invisible.** An arrow into the nock of another changes almost no pixels.
- **Distance limits resolution.** At 70m the gold may be a few dozen pixels across, and an X ring a
  fraction of that. The detection still works; the precision does not justify trusting the ring.
- **Half the arrows are missed.** See the numbers at the top.

## Recorded sessions

Turning recording on in settings keeps each camera scoring session as a video on the device, with a
sidecar of how the phone was held, one sample per frame (`motion.ts`). Nothing reads the motion yet.
It is captured because it cannot be added afterwards, and because gravity fixes which way up the phone
is without drift, which is the one thing about the face the fit cannot see when it is nearly round.

Nothing is uploaded. The files go to the app's documents directory and out through the system share
sheet.

## Tools

`./scripts/arrow_detector.sh <image|video>` runs the detector and draws what it found.

Given a recording it replays it through the live scanner and writes the video back with the overlay
burnt in, at the rate the app detects at, dropping passes when the detector is still busy exactly as
the worker does. The overlay is the point: rings drawn back onto real footage show a bad fit instantly
where a percentage does not, and that is how the two worst geometry faults in this pipeline were
found.

`--watch` plays it, `--json` reports the numbers only.

## Measuring it

Three layers, and the numbers at the top of this document come from the last two.

`src/lib/vision/vision.test.ts` runs the whole pipeline on synthetic frames: a WA face drawn onto flat
grey with dark streaks for shafts. No camera and no fixtures, so it runs in the normal suite. It earns
its keep: the arbitrary rotation of a circle and the three spot scale problem were both found by a
test rather than by inspection.

`scripts/eval-vision.mjs` measures the face stage against 2048 annotated three spots, and
`scripts/eval-faces.mjs` against faces fitted by hand on the recordings. Both are needed: the annotated
set is photographs of a boss across a hall, and says nothing about an archer walking up to one.

`scripts/eval-arrows-video.mjs` asks the question the archer asks. They swept the camera over the boss
for a few seconds, and there were six arrows in the paper: how many came back, how many things came
back that were not arrows, and would the score have been right.

Ground truth for both comes from `scripts/label-arrows.mjs`, where the four anchors are dragged onto
the black to white edge by hand and each impact is clicked once.
