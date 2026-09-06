# The split between page and worker

The archer reported two things. The live scorer on the phone does not agree with the labelling tool,
and the arrows sometimes turn as a set around the gold. Both were true. This is what caused it, what
was changed, and what was tried and did not work.

## Why no harness could see it

`eval-arrows-video.mjs`, `video_detector.mjs` and the labelling tool's player all drive `Replay` from
`video-entry.ts`. That holds one `Scanner`, on one thread, and feeds it every frame.

The app does not work that way. `AutoScore.svelte` follows a fit of the face on the render thread at
the camera's own rate. It hands a frame to `detector.worker.ts` every `DETECT_EVERY_MS`. The worker
holds a second `Scanner` with a second fit, and `LiveScanner.rebase` carries every confirmed arrow from
one fit into the other.

So the tool and the phone ran different programs, and every harness measured the one nobody uses.

## The fault: the worker's fit was frozen between searches

`Scanner.pushReduced` searched for the face on every fifteenth call. On the other fourteen it left
`this.faces` alone.

That was harmless for `Replay`, which calls `track()` on every frame in between and so keeps the fit
current. It was not harmless for the worker, which calls `pushReduced` and nothing else. In the app
that runs about every 150ms, so between searches the worker's fit was frozen for over two seconds while
the archer swept the camera across the boss.

Every arrow proposed in that window was read through a fit of where the face used to be. The tracker
then gathered evidence in a frame that was sliding. On `2026-08-18T17-51-08` the first arrow went from
a plausible 9 to a mark at image x = -96, off the picture entirely, scored as a miss.

The fix is one line at the top of `pushReduced`: follow the faces onto the frame just handed over,
before anything looks at them.

## The second fault: the worker's follow reached too far

Even when it follows, the worker's fit is a chain with a step of 150ms. That is eight frames of camera
movement in one descent, and the follow's step sizes are tuned for one. The page has no such problem.
It follows every frame, so its fit is current by construction, and it had no way to say so.

`LiveScanner.offer` now sends the page's fit with the frame, and `Scanner.adopt` takes it on. There is
one estimate of where the boss is, made where the frames are. The search in the worker goes on doing
the one job a follow cannot, which is noticing a face that was not there before.

The two fixes overlap. Adopting the page's fit is following the face by proxy, so either alone recovers
most of the fault. Both are kept because they cover different passes. The follow works before the first
face is found, when the page has nothing to send. Adopting works after that, when the follow's step is
too long to converge.

## What it was worth

Measured by `eval-camera.mjs`, which drives the app's own `LiveScanner`, the app's own worker, and a
copy of `AutoScore`'s tick, in a real browser, against impacts placed by hand. The same six recordings
each time, all labelled before this work started.

| | frozen fit | followed | followed and adopted |
| --- | --- | --- | --- |
| arrows right at the close | 0/36 | 9/36 | 10/36 |
| arrows ever right | 12/36 | 21/36 | 22/36 |
| wrong marks per recording | 3.3 | 2.8 | 3.3 |
| **arrows moved by the rebase** | **18.3%** | **0.3%** | **0.1%** |

The last row names the fault. A rebase is a change of coordinates between two descriptions of the same
face, so it should move nothing at all. Moving an arrow by a fifth of a face radius means the two fits
disagreed about where the boss was by two whole rings. That disagreement is what the archer saw as the
arrows turning.

## Does the app match the labelling tool now

As near as this corpus can tell, yes.

Counting arrows as right means within a twentieth of a face radius, which is half a ring. Counted that
way the app scored 10/36 against the single scanner's 14/36, which reads as the split still costing a
quarter of the recall. It does not. A count over a bar cannot tell a mark just outside the bar from a
mark on the wrong side of the boss, and those want different work. So the harness reports how near the
nearest mark got to every impact. Same six recordings, 36 impacts:

| nearest mark within | the app's split | single scanner | frozen fit |
| --- | --- | --- | --- |
| 5% of a radius, counted right | 14 | 16 | 8 |
| 10%, about one ring | 22 | 22 | 19 |
| 20% | 29 | 29 | 26 |
| no mark near it at all | 0 | 0 | 0 |

The two paths are the same curve. They took 68 and 69 detection passes a recording. They differ only at
the first row, by two arrows, which is inside the run to run scatter.

## How noisy these numbers are

Read this before trusting any of the tables. Both harnesses drop a detection pass the machine has no
time for, on purpose, because that is what a phone does. So neither is reproducible to better than a
few points on a machine doing anything else.

Repeated runs of the six recordings moved "ever right" between 25 and 26 out of 36. Three runs of
`eval-arrows-video.mjs` over one corpus gave 119, 112 and 103 arrows found while the only thing that
changed was a constant that path barely uses. **Do not read a single pair of runs as an effect.**

The two structural fixes are argued from differences several times that scatter, on fixed recordings.
The gravity leak below is argued from the shape of a sweep, and is the weakest claim here.

## The angular origin, and gravity

A target face is circles, so nothing in the picture says which way round it is. The fit may describe it
from any angle. Left free, that angle walks: the source measured twenty five degrees over a sweep on
three recordings of eight, and nearly sixty on another. The found arrows creep round the gold with it.

The source also said gravity was tried for this and measured worse, and gave numbers. That measurement
was taken through harnesses that follow the face on every frame, so the drift gravity was compared
against was a fraction of the drift the app actually had. It was true of the thing measured and false
of the thing shipped.

Measured again through `eval-camera.mjs --motion`, over the eight labelled recordings whose phone kept
its sensors, it reverses. Every amount of pinning beat none, on wrong marks as well as on found arrows:

| leak | 0 | 0.003 | 0.01 | 0.03 | 0.1 | 0.4 | 1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| arrows found | 20 | 22 | 24 | 23 | 25 | 26 | 25 |
| ever right | 26 | 29 | 31 | 31 | 30 | 31 | 32 |
| wrong marks a recording | 1.5 | 1.1 | 1.0 | 1.0 | 1.0 | 0.6 | 0.8 |

So the follow now takes the chain's step, then moves a hundredth of the way towards where gravity says
the origin belongs. This is what an attitude estimate does with a gyroscope and an accelerometer. The
chain is unbiased but walks. Gravity is bounded but noisy. Each covers what the other cannot.

Everything from 0.01 up is one flat plateau, so the table picks the direction and not the value. A
hundredth is the smallest setting that shows the whole effect, and the smallest setting is the one to
take when the benefit is new and the harm was measured before. Its time constant is about a second and
a half at sixty frames a second, which is far longer than gravity's jitter and far shorter than the
tens of seconds a walk needs to show.

Recordings made before the sensors were saved take the old path exactly, and are unchanged.

## The ring frontier: the statistic is real, the explanation was not

The archer's reading is that a shaft crossing from one ring into the next is taken for an arrow ending
there, when it carries on. `eval-camera.mjs` reports where every wrong mark sits. Over the nineteen
recordings with sensors:

| | wrong marks | scattering would give |
| --- | --- | --- |
| within 2.5% of a radius of a frontier | 44% | 18% |
| within 5% | 56% | 36% |

Two and a half times chance. Of the ten sitting on a frontier, seven are outside it and three inside,
which is what the mechanism predicts and nothing else does.

The obvious fix was tried and **it is wrong**. The reasoning was that a dark shaft on dark paper cannot
make a fourteen luma ridge, because on the black ring the whole available contrast is about fifteen
luma. So the bar should fall with the brightness of the paper beside the ridge, and the shaft would be
followed to where it really stops. `impacts.ts` was given exactly that, as a knob so it could be swept:

| relief | 0, as shipped | 0.5 | 1 |
| --- | --- | --- | --- |
| arrows found per frame | 50% | 49% | 46% |
| proposals per frame | 12.8 | 13.7 | 14.1 |
| rings 7 and 8, the black | 36 found, 25 missed | | 30 found, 31 missed |

Worse overall, and worse in the two rings it was aimed at. The change was reverted rather than left
behind a default of zero, because a knob nobody should turn is worse than no knob.

The statistic stands and the explanation does not. Something puts wrong marks on the frontiers, with an
outward bias, and it is not the ridge threshold. Two candidates are untested: the printed ring line,
which is a dark circle that a shaft crossing at a shallow angle could be grouped with, and the printed
ring numbers, which sit just inside the frontiers and are compact dark marks. Whoever picks this up
should draw the wrong marks back onto the pictures they came from and look at what is under them.

## Pooling the two proposers: tried, and it does not pay

The proposer looked like the binding constraint. On single labelled frames, given the archer's own fit,
over 85 frames and 513 arrows:

| | shape, as shipped | impacts | both pooled |
| --- | --- | --- | --- |
| arrows seen on a given frame | 43% | 50% | **66%** |
| of what it proposed, right | 56% | 23% | 23% |
| proposals a frame | 4.6 | 12.8 | 17.4 |
| pairs under a ring apart with **neither** seen | 34/47 | 11/47 | **8/47** |

The last row is why it looked promising. Two arrows close together is what good shooting produces, and
the shape detector sees neither of them three times in four. The two proposers fail on different
arrows, which is why 43% and 50% pool to 66%.

None of it survives the tracker. End to end on the app's path, eight recordings, 48 arrows:

| | arrows right at the close | wrong marks a recording |
| --- | --- | --- |
| shape, as shipped | 14 | 5.1 |
| both, tracker as it is | 15 | 10.5 |
| both, `minVotes` 12 | 13 | 8.3 |
| both, `minVotes` 12 and `minAgreement` 0.6 | 13 | 5.3 |
| both, `agreeVotes` 1 | **17** | 7.5 |

Held to the precision it ships at, pooling finds no more arrows. The best point on the curve buys three
arrows over eight recordings and costs nineteen extra wrong marks. A wrong mark and a missing arrow
each cost the archer one tap, so that is a bad trade.

The reason matters more than the result. A tracker that counts votes cannot tell repeated signal from
repeated noise, and the noise here repeats. A crease, a printed line, the shadow under the rim and an
old arrow hole all sit in the same place on every pass, exactly as a real arrow does. Making the
proposer more sensitive adds seen arrows and repeatable noise at the same rate, so any bar that holds
the noise down throws the arrows away again.

No default changed. `proposer` stays `'shape'`.

If anybody tries this again: pooling costs about 65ms a pass against 18ms. That is inside the 150ms
detection interval on this machine, and would not be on a phone three times slower. It has to be tried
against a modelled device speed, or it will look affordable here and drop half its passes in the field.

## Where to go next

The bottleneck has moved. It is not the proposer any more, and it is not the tracker's thresholds
either. It is what the tracker counts.

Getting further wants evidence a flat mark cannot fake. There is one to hand. An arrow stands off the
paper, so its nock moves against the face as the camera walks, while anything printed or torn stays
put. `eval-nocks.mjs` and the nock labels in the labelling tool exist for this, and the scanner does not
use them.

## Running it

```
node scripts/virtual-camera.mjs <recording>            # per frame numbers
node scripts/virtual-camera.mjs <recording> -o out.mp4 # the overlay burnt in
node scripts/eval-camera.mjs                           # the corpus, against the labels
node scripts/eval-camera.mjs --replay                  # the single scanner, same metric
node scripts/eval-camera.mjs --motion                  # only sessions whose sensors were saved
node scripts/eval-camera.mjs --tune '{"proposer":"both","sweep":{"agreeVotes":1}}'
```

`--tune` reaches the scanner in the worker, so any row above can be reproduced or contradicted without
editing a constant. The app never sends it.

The labelling tool's player has a **Live** button beside Classical and Learned. It watches the same
split over the recording being labelled.
