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
| **Arrows** | found, of 84 impacts placed by hand | **55%** |
| | ever proposed, the ceiling | 85% |
| | of those, agreed on rather than guessed | 51% |
| | false proposals | 2.6 per end, of which 2.1 agreed on |
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

The arrows are not solved. About three of a six arrow end come back, with a couple of wrong marks
beside them.

Both rows are measured because only measuring the first one hid a fault for several rounds of work.
Told how many arrows to expect, the tracker stops at that many, and a cap discards whatever was ranked
below the last real arrow before anybody counts it — so the false positive rate looked like it was
improving while it was not. `--uncounted` measures the other case, and the two are quoted together for
that reason.

A wrong mark and a missing one are not equally bad, and the bar is set accordingly. A wrong one has to
be noticed and dropped, and one noticed late is a wrong score. A missing one is placed by hand, which
is what the archer would have done for all six anyway. The archer confirms every one, so a wrong proposal costs a tap rather than a
wrong score, and the ones that are right are placed to within a fifth of a ring. It is a help, not a
scorer.

The ceiling matters as much as the number found: an arrow that no pass ever proposed cannot be
confirmed by any amount of agreement, and about one in seven is never proposed at all. That is the
detector failing to see a shaft, not the tracker discarding one.

Nothing is confirmed for the first second and a half, because five passes at three a second is what
agreement across five genuinely different views costs. Two ways round it were tried and neither
worked: asking for four views instead of five costs six points of arrows and half again as many wrong
marks, and measuring viewpoint spread directly from the fit — so a fast sweep could confirm sooner and
a still phone could not confirm at all — made no difference on any real recording while breaking the
one case where the archer stands still. What is done instead is to show what the first couple of
seconds turned up, marked unsure, so the wait is visible rather than blank: everything the very first
pass proposes, from about eight tenths of a second in, which is as soon as there is a face to read them
against. They are never counted, never scored, and gone the moment anything is confirmed. A false positive, once confirmed, is never
reconsidered — taking arrows back on later evidence was built and measured and cost a fifth of the real
arrows to remove a third of the false ones, because a real arrow genuinely stops being proposed once
the archer has swung past it, so it is not in the code. And an arrow the sweep never agreed on is only
shown when the end's arrow count is known.

**The objective is every arrow found, with proposals an archer can accept almost without thinking.**

The binding constraint is now the tracker alone. Every one of the 84 labelled arrows is proposed at
some point, so nothing is invisible to the detector any more; what is lost is lost in the ranking,
where a real arrow is outvoted by something that is not one.

Two of the three things that lifted the ceiling to 100% were features doing harm rather than thresholds
set wrong, which is worth remembering before reaching for a threshold again:

- **The detector never looked outside the printed face.** An arrow in the backing paper is a miss, and
  a miss is still an arrow of the end. Tracing runs out to 1.3 radii while only believing impacts
  inside 1.1 took the ceiling from 85% to 94%.
- **Arrows were judged by whether they pointed the same way as the longest streak in the frame.** The
  argument was that shafts all lean towards the same lens, which is true of a boss across a field and
  false of one the archer is standing in front of, where the six fan out. It cost a sixth of everything
  the detector saw, and hung the whole frame on whichever run happened to be longest — one bad anchor
  and real arrows were judged against a shadow. Removing it took the ceiling from 94% to 100%.

Ablating each remaining test one at a time: the ridge test is the one that matters — without it, arrows
found fall from 67% to 46% and false marks rise by half. The fill, elongation and radial lean tests are
each worth a point or two. The width comparison is worth three points and only earns them with the
bearing test gone.

**The physics is in, and pays a little.** An arrow comes out of the paper and a crease does not,
which is the one property they do not share. The face already says where the camera is, so this is
checkable without a lens calibration or a motion sensor: a point at height h above the face images at
`H(x, y, 1) + h·v`, where `v` is where the plane's normal vanishes, so read back through the fit into
face coordinates the tail of a standing shaft lies on the line from its impact towards one single
point — where the camera stands, in the face's own coordinates — and that point is shared by every
arrow in the frame. Arrows near a boss do not lean in parallel, as an earlier version of this assumed;
their lines meet. Fitting that meeting place from the marks themselves, with the disagreeing ones
weighted down, and rejecting marks that lean elsewhere removes about five wrong marks for every two
real ones. Better than any appearance test managed, and still not enough to be worth turning on.

Measured against nocks placed by hand, the model holds to about 4° on frames whose face was fitted by
hand — well inside what it needs. What was blocking it was not the geometry but the measurement: the
detector was reporting the end of a dark run as the far end of the shaft, and the search box stops just
past the printing, so 78 of 83 hand placed nocks lay outside it — three face radii out typically, seven
at the worst. The reported shaft was a quarter of the real one, and the bearing of a quarter length
segment is a third of a right angle out.

`followOut` now tracks the shaft outwards past the face, looking a pixel or two either side of where it
expects at each step and re-reading the bearing over everything walked so far. That takes the reported
far end from 0.28 to 0.87 of the hand measured shaft and its bearing from 33° out to **1° out, 5° at
p90**. The tracked end is kept separately from the run's own end, because deciding whether two readings
are the same shaft wants the evidence inside the box and deciding how an arrow leans wants all of it.

With that, the meeting place test earns its keep, though not by much: it removes about eight wrong marks
for every two real ones, which on a sweep with no arrow count is 2.8 wrong marks an end down to 2.4, at
a cost of two or three arrows found. Turning `standTolerance` up past π switches it off.

Three further ideas were built, measured and removed, which is worth as much as the ones that stayed:

- **Weighing a place's votes by how strong a ridge it showed.** Exactly neutral as a ranking, and as a
  gate it trades arrows for wrong marks about one for one at every setting. Real shafts and the things
  mistaken for them have overlapping ridge scores, so there is no separation there to take.
- **Reading the impact at half a pixel rather than a whole one**, on the theory that a quarter scale
  frame quantises the impact by about a tenth of a ring. It did not improve placement at all, which
  says the error is in what counts as the end of the ridge rather than in how finely it is measured.
- **Sampling that walk between pixels instead of at the nearest one.** Worth four points uncounted and
  minus three counted, and no better placed. Not a clear enough win to keep.

Two ways out of that were tried against the recordings and neither worked. Taking arrows back when the
rest of the sweep stops agreeing with them cost a fifth of the real arrows to remove a third of the
false ones, because a real arrow stops being proposed once the archer has swung past it. Telling a
standing shaft from a flat mark by whether its bearing swings with the viewpoint — which ought to work,
since only one of the two is standing in the paper — found bearings scattering by 90 degrees and more
on marks that never moved, so there was nothing to measure against.

What is left is the proposer itself, and more recorded ends to work on: fourteen sweeps is fourteen
arrangements of arrows, and that is what limits both detectors.

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

### 6b. Where the shaft ends (`impacts.ts`)

Shape alone finds shafts well and places them badly, and the second half is where most of the loss
sits. Measured on the frames the archer labelled outright, with the archer's own fit so that nothing
but the proposer is in the answer:

| | |
| --- | --- |
| a crest of a dark ridge sits on the labelled impact | 96% of arrows |
| a candidate line passes through the impact | 93% |
| the run's own extent reaches that far in | 90% |
| a proposal comes back within a twentieth of a radius | 42% |

So the shaft is nearly always seen, and the mark is nearly always put somewhere else along it. Of the
runs that do cover an arrow, under a third place the mark on it; the rest stop short of it or walk past
it, in roughly equal numbers.

The picture is not the ambiguous part. Sampled along the shaft's own line and lined up on the labelled
impacts, the ridge reads about twenty luma outwards and about minus three one step inwards: a shaft
does not fade into the paper, it stops, and it stops in one pixel. What is fragile is the grouping,
because the extent of a Hough run is decided by gap bridging over a mask that speckles.

`impacts.ts` turns the question round. It scores that step everywhere first, proposes an arrow at each
place the ridge steps up on the way out, and grows a shaft out of the proposal to confirm it. Two
things fall out of it:

- **A ridge, not a threshold.** The middle against the weaker of its two flanks answers zero at a step
  between two rings however hard the step is, because one flank is always as dark as the middle. The
  dark side of a ring frontier is where a threshold on darkness plants its wrong marks.
- **One shaft, one impact.** A shaft steps up wherever it comes out of something dark, and the black
  ring is exactly that, so an arrow crossing it answers at the hole *and* at the frontier. The wrong
  answers are collinear with the right one and further out along it, which is what makes them
  answerable: the group is the arrow, and its innermost member is where the arrow went in, as long as
  what lies between them is either shaft or paper too dark to have shown one.

It is not what runs. It sees more and it is noisier, and end to end over the labelled recordings the
tracker cannot convert the difference:

| proposer | arrows found | ever proposed | scored right | scored wrong | right of all shown |
| --- | --- | --- | --- | --- | --- |
| shape (`still.ts`, what runs) | **109/169** | 145/169 (86%) | **103** | **37** | **50%** |
| impacts | 85/169 | 150/169 (89%) | 84 | 113 | 33% |
| both pooled | 98/169 | 155/169 (92%) | 98 | 114 | 35% |

All three through the same tracker, so what the rows differ by is the proposer and nothing else.

Pooling the two moves the ceiling from 86% of arrows ever proposed to 92%, and the score falls: three
times the wrong marks, and ten fewer arrows found. That says where the next work is, and it is not more
recall. The tracker counts every proposal as one vote, so a wrong place proposed from the same spot
every pass gathers agreement exactly as a shaft does. Per proposal, length, ridge strength, step size
and straightness barely separate the right marks from the wrong ones, so the weight would have to come
from somewhere other than the proposal's own shape, and nothing here has found where.

Turn it on with `proposer: 'impacts'` or `'both'` on the scanner, and measure with
`node scripts/eval-proposer.mjs --tune '{"proposer":"impacts"}'`.

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

**Two close marks are two arrows when one pass said so.** Whether a second mark may be offered beside
one already standing used to be decided by distance alone, and no distance is right: six arrows in a
gold are closer together than one shaft read at two points along itself. It was the tracker's largest
own loss, seven arrows of a hundred and thirty nine missed because a neighbouring *real* arrow was
marked first.

The proposer can answer it directly. Two proposals in one pass that did not merge are two things it
told apart in a single look at the boss, which is evidence about how many arrows are there; distance
is not. So two places closer than the spacing distance are still both offered once enough passes have
proposed both of them: at least two, and at least half the looks the fainter of the two got.

Twice rather than once, because a shaft crossing a ring line can be read at two points on one unlucky
pass, which is exactly the mistake the spacing rule exists to catch. A share as well as a count,
because a count alone can be reached by luck over a long sweep and the luck is expensive.

Measured over 27 labelled sweeps, against the same recorded proposals:

| | arrows found | wrong marks | scored right | scored wrong | right of all shown | double marks |
| --- | --- | --- | --- | --- | --- | --- |
| by distance alone | 106/163 | 60 | 101/163 | 38 | 49% | 3 |
| **three looks, and half of them** | **109/163** | **57** | **103/163** | **37** | **50%** | **4** |

Three costs one extra mark put twice on one shaft, which is the wrong mark that reads worst, and buys
an arrow found and scored, an ordinary wrong mark, and a wrong mark off the scoresheet. Two looks was
right while the proposer read the frame the face was found on; the sharper crop offers more places a
pass, so two of them landing together by chance is likelier and the bar rose with it.

Promotion is capped at the end's remaining arrows, inside the tracker rather than after it. Sorted by
evidence, so the best supported candidate takes the last free slot.

**The count is a hint, and optional.** Given it, the tracker also works the other way: once the sweep
has had a few seconds and the end is still short, the best places that fell short of the bar are
offered to make the number up, marked unsure and drawn dashed. That is worth doing because of what it
replaces — an arrow the detector missed is one the archer places by hand, so the choice is between a
mark that may be wrong and no mark at all, and a wrong one costs a tap to drop. Measured, it turns 51%
of arrows found into 55%, for half a wrong proposal more per end.

It stays optional because the count is not always known: brace height tuning shoots ends of no fixed
length, and a team may put two archers' arrows into one boss. Without a count nothing is capped and
nothing is guessed, because an end has no number to be short of. `-a/--arrows` passes one to the
replay tool; the app knows it from the round.

### Counting a look rather than a mention, which is worse

The loop that gathers evidence adds a vote per proposal, and a pass can propose the same place twice: a
shaft read at two points along itself lands as two. That looks like a plain fault, since the bar a
candidate has to clear is counted in looks and those are one look. Counted once a pass, the sweeps find
110 arrows of 169 rather than 111 and write down 103 right rather than 105.

So it stays as it is. A place a single pass puts forward twice is a place that pass was surer of, and
counting it twice turns out to be evidence rather than an accident.

Worth recording because it is the sort of change that is obviously right and is not, and because the
first measurement said it was: a replay against recorded proposals had it a point ahead, and a replay
whose recording predates a change to the proposer is measuring last week's detector. The real harness
disagreed and the real harness was right.

**Two proposers agreeing is the only weight available that is not the proposal's own shape.** Nothing
about a proposal by itself separates the right marks from the wrong ones, but the shape detector and
the impact detector fail on different things, and over the labelled sweeps both speak for 72% of the
arrows and for 10% of everything else. Asked as a bar, it is worth a great deal to the pooled proposer:
requiring three passes of agreement takes it from 98 arrows of 163 with 113 wrong marks to 108 with 68.

That is still not as good as the shape detector alone, so pooling stays off. It is `agreeVotes` when it
is wanted, and it is the shape of the answer if the proposer work resumes: weight from a second opinion
rather than from a better threshold.

### Displacing a mark that turned out to be wrong

Confirming used to be for ever: nothing ever took a mark off the sheet, so a wrong place that cleared
the bar early held its slot for the whole sweep and turned away every real arrow within a ring of it,
however much evidence arrived afterwards. It was the largest thing left in the tracker, nine arrows of
163 against three blocked by a neighbouring real one.

A confirmed mark now gives up its place to the candidate it is blocking once that candidate carries a
quarter more support. A margin rather than a bare majority, because the two are not symmetrical: the
mark being displaced has been on the archer's screen and may already have been read, while the one
displacing it has been refused all along and has had fewer chances to gather anything. Anywhere from a
tenth more to half again measures the same; it is worth 111 arrows of 163 against 109, with three fewer
wrong marks and two fewer of those on the scoresheet.

### Where the rest of the loss is

Of 163 arrows over 27 labelled sweeps, 87% are proposed at least once and 76% are proposed five times
or more. The tracker keeps 111. What is left is mostly not its to keep: 33 arrows were never proposed
or proposed once or twice, which no tracker can safely use among the several hundred spurious one-offs
a sweep also produces. Of the rest, a handful are still blocked, a handful never clear the bar, and one
loses its slot to a full list.

So the tracker is within about fifteen arrows of what its own inbox allows, and the work is upstream of
it.

### Three things that sound right and are not

Measured, and recorded here so they are not tried again.

**Believing the proposer more.** Lowering the bar is the obvious reading of "the tracker is too strict",
and it is wrong: at four votes instead of seven the sweeps find 101 arrows rather than 109 and the
wrong marks go from 57 to 88, most of them onto the scoresheet, because what is seen three times is
mostly what one flattering viewpoint gives. Raising it trades the other way and no better. The bar is
close to where it should be; what was wrong was the spacing rule beside it.

**Spending passes on the sharper frames.** A sweep is made by a walking archer, so its frames are not
equally good, and sharpness is known before a pass is taken. But it barely predicts: keeping the
sharpest quarter of passes gives 43% of proposals right against 41% for every pass. Only the extreme
bites, and it is worth knowing for that alone: the blurriest seventh of passes get 19% of their
proposals right against 44% in the middle, and see a fourteenth of the arrows. A gate on the worst
frames is arguable; a ranking of the rest is not. Measure with `scripts/eval-passes.mjs`.

**Holding a good frame.** The labelling tool's player goes on scanning after a recording ends, because
the video element goes on handing out its last frame, and watching it the marks appear to settle and
improve. They do not. Held for 120 extra passes over the labelled recordings, the arrows found fall
from 108 of 169 to 103 while the wrong marks on the scoresheet go from 37 to 79: what a held frame does
is let the tracker confirm everything that one frame supports, right and wrong alike. On a held frame
the proposals stop moving at all, so nothing it gains can be agreement across viewpoints. What looks
like settling is faint unsure marks turning into confirmed ones while candidates from earlier
viewpoints time out. Reproduce with `scripts/eval-arrows-video.mjs --hold 120`, or watch one frame pass
by pass with `scripts/eval-hold.mjs`.

**Asking a sweep's marks to stand together.** The frame detector keeps only marks that lean the way a
thing standing in the paper must, and a sweep has far more evidence for that test than one frame does:
the same place is seen dozens of times, so its direction is an average rather than a single reading,
and the readings are steady (0.95 of a unit vector, summed and normalised). It still separates nothing.
Sorting places by how far their lean is from the fitted meeting place puts an arrow below a non arrow
51.3% of the time, which is chance. The wrong places that survive to three votes lean outwards too.

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

### Which of the two fits a number is read through

The split costs one thing, and it took a while to see because nothing measured it. There are two fits
of the face, not one. The worker keeps its own, and the page follows a second on every frame for the
overlay; the page takes the worker's only when the *number* of faces changes, which after the first
acquisition is almost never. So the page's fit is a chain hundreds of frames long, and unlike the
worker's it never searches for the face again, never checks the rings against it, and never refits from
a blob. It walks.

Measured at the moment the page actually rebases, against the worker's fit of the frame it was given:

| the worker answers after | a mark moves by, median | p90 |
| --- | --- | --- |
| 40ms, this laptop | 1.6% of a face radius | 13.2% |
| 120ms, a phone three times slower | 4.0% | 24.2% |

A ring is 10% of a radius, and the impact error the detector is measured to have is 1.7%. So on a phone
the frame a mark is read through mattered more than the detector's own accuracy did.

Put in the unit the archer cares about, read through the page's fit instead of the worker's:

| the worker answers after | the scored ring changes on | by two rings or more |
| --- | --- | --- |
| 40ms, this laptop | **14.2%** of readings | 1.8% |
| 120ms, a phone three times slower | **29.9%** | 4.6% |

About one arrow in seven on a laptop, and nearly one in three on a phone, written down a ring out for
no reason to do with seeing it. The replay never pays any of this, because it drives one fit.

Three things follow, and all three now hold.

**A mark is scored in the frame it was found in.** Every harness in this document measures the worker's
frame; the page's is the one the archer's overlay is drawn in. Those are different questions and they
had one answer. `LiveImpact` already carried `source`, the worker's own coordinates, and `reject`
already used it for exactly this reason; scoring did not. It does now, and the mark is still *drawn*
through the page's fit so that it lands where the drawn rings say.

**The rebase reads the fit the frame was offered under.** Converting out of one fit into the picture and
back into another is a change of coordinates only if both describe the same frame. The page's had moved
on by however long the pass took. It keeps its fit at the moment of offering and reads the answer back
through that.

**The page takes the worker's fit back when it has plainly lost the boss.** Adopting every pass is what
made the rings jump and stays out, but a fifth of a radius apart is not drift, it is one of the two
being somewhere else, and the worker is the half that searches.

Measure with `scripts/eval-split.mjs`, which drives the page's side by `LiveScanner`'s own rules
alongside a real sweep. It is the only harness here that exercises the split at all.

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
It is captured because it cannot be added afterwards.

### What the motion sensors are for

Three things the pictures alone are bad at, in the order they would be worth doing.

**Which way round the face is.** The rings are circles, so nothing in the picture says where zero
degrees on the face is; `alignFace` only holds the angle steady from one frame to the next, and what
it holds it at is whatever the first fit happened to choose. Gravity says which way up the phone is,
exactly and without drift, and a target face is hung the same way up all day. Between them that is a
real angular origin rather than an arbitrary one, which would let arrows found in one end be recognised
in the next, and would survive the face being lost and found again — which today restarts the angle
from scratch.

**Holding the fit through a bad frame.** The turn rate says how the camera moved between two frames
before any pixel is read. Handed that, the follow could start its descent from where the face must
have gone rather than from where it was, which is both faster and steadier, and could tell a face that
has genuinely left the frame from one hidden for a moment by an archer walking past — today the second
looks like the first and the fit is thrown away.

**Steadying the overlay.** `steady.ts` guesses how fast the drawn points are travelling from the fits
themselves, which is a noisy estimate of exactly the quantity the gyroscope measures directly. Feeding
it the measured rate instead would let the smoothing be stronger without costing lag, because the part
it has to guess is the part that limits it.

What none of them give is position. Acceleration integrated twice drifts to metres within seconds, so
how far the archer has walked is not recoverable this way and the pictures remain the only source of
where the boss is.

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

`scripts/dump-passes.mjs` writes down what the proposer offered on every pass of every labelled sweep,
and `scripts/eval-tracker.mjs` replays that file through the tracker. Record it again after anything
that touches the proposer, and check the two still agree before believing either: a recording that
predates a change is measuring the detector as it was, and it says so in numbers that look exactly like
numbers about the tracker. That has already sent one change the wrong way. Everything the tracker decides is
downstream of those proposals, so this answers a question about the tracker in milliseconds instead of
in the eight minutes a full replay costs, and the two agree exactly when given the same settings. Every
tracker number in this document was found that way and confirmed against the recordings afterwards.

`scripts/eval-passes.mjs` asks whether some frames of a sweep are worth more than others.
`scripts/eval-hold.mjs` holds one frame in front of the scanner and reports what it makes of it pass by
pass.

Ground truth for both comes from `scripts/label-arrows.mjs`, where the four anchors are dragged onto
the black to white edge by hand and each impact is clicked once.

The four anchors may be dragged in any rotational order, so on loading a recording the tool puts each
frame's hand fit into the same order round the circle as that frame's automatic one, and turns anything
expressed in that frame's coordinates to match. The turn used to go the wrong way. A half turn is its
own opposite so it survived, but a frame reordered by one or three quarters had every arrow on it left
exactly half a turn from where it was clicked, and no amount of dragging could put it right: the next
load reordered the handles again and turned the arrows wrongly again, so the correction appeared to
save and came back undone. Four recordings of one session were corrupted that way and were corrected by
hand once the direction was fixed.

Anything measured against this corpus is worth re-checking after a fix like that. Turning the labels of
those four back put 21 of their 24 arrows onto the shafts, and every number in this document was taken
again afterwards.
