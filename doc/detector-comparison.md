# Arrow detectors, measured side by side

Four approaches to the same question: given a photograph of a target face, where did the arrows go in?
Two are other people's, two are ours. All four are measured here on the same photographs, with the
same labels and the same rule for what counts as a hit, because that is the only way the comparison
means anything.

## The measure

The **60cm set**: 479 photographs of ordinary club shooting, each arrow labelled with a keypoint and
the value the archer wrote down. 1640 arrows. The bosses have been shot at for months, so the paper is
covered in old holes, which is the realistic case rather than the flattering one.

A detection counts as a hit if it lands within **8% of the face radius** of a labelled arrow, roughly
one ring. Then:

- **recall** — what share of the real arrows were found
- **precision** — what share of the reported marks were real arrows
- **value agreed** — of the ones found, how often the ring is the one the archer wrote down

Anything trained is measured on a **held out fifth** it never saw, and the classical detector is
measured on that same fifth so the two are answering the same exam.

## The four

### 1. Archery-target-detection: someone else's hosted model

A FastAPI backend which, despite a README describing OpenCV, does no vision of its own. It uploads the
photograph to Roboflow's hosted inference API and asks a model called `target-and-arrow-detection/6`
for boxes whose class names *are* the scores: `"10"`, `"9"`, and so on, plus `"target"`.

It cannot be measured here, and it is worth being clear why rather than quietly leaving it out: the
model is behind an API key we do not have, and it is not downloadable. Two things can still be said
about the design:

- **It is not local first.** Every scored end is a photograph of your target uploaded to a third party.
  For this app that is disqualifying on its own.
- **The post processing is unsound.** Detections are sorted by score, truncated to the end's arrow
  count, and then *padded with zeros* if too few were found. An arrow the model missed is silently
  recorded as a miss. That turns a detection failure into a wrong score rather than a visible gap,
  which is the one thing a scorer must never do.

### 2. aimify: someone else's YOLOv8, weights included

A much more serious attempt: YOLOv8 small, instance segmentation, eleven classes — the ten rings as
masks plus `Arrow`. Trained on 140 photographs (123 train, 11 validation, 6 test) labelled in CVAT and
Roboflow. The idea is to segment each ring and see which one an arrow falls in, and the trained weights
are in the repository, so it can actually be run.

Their own reported numbers after 10 epochs, on their own validation set:

| | precision | recall | mAP50 |
| - | - | - | - |
| boxes | 0.78 | 0.65 | 0.81 |
| **masks** | **0.18** | **0.15** | **0.17** |

The boxes are reasonable. The masks, which are the entire point of the approach, essentially failed,
and their README says as much: about half the outer rings go unmasked. Ten epochs on 123 images is a
work in progress, and it is labelled as one.

Run against our 60cm set (`scripts/eval-yolo.py`), it does not transfer:

| confidence | reported | recall | precision |
| - | - | - | - |
| 0.25 | 1436 | 24.8% | 7.9% |
| 0.50 | 589 | 17.8% | 13.8% |

One caveat in their favour, which the harness already grants them: their `Arrow` box covers the whole
arrow, shaft and fletching, so its centre is nowhere near the hole. The impact is therefore read as the
point of the box nearest the middle of the face, which is the most generous honest reading available.
Scoring it by box centre instead gives 1.8% recall, so this correction is doing real work and the
numbers above are the fair ones.

The lesson is not that YOLO is the wrong tool. It is that 140 photographs from one setting produce a
model that knows that setting.

### 3. Ours, classical

Rules about what a shaft looks like: a Hough vote over bearings to separate crossing shafts, a ridge
test to reject anything dark on only one side, a radial test to reject printed ring lines, and the
inner end of the run as the impact. Described in [camera-scoring.md](camera-scoring.md).

### 4. Ours, learned

A small heatmap network, about a hundred thousand weights, in
[`learned.ts`](../src/lib/vision/learned.ts). The important choice is what it is *not* asked to do:

**It never looks for the target.** The classical face detector, which is at 97% and needs no training
data, finds and rectifies the face. The network is handed a square crop in face coordinates — gold
centred, radius normalised, tilt undone — so scale, rotation, position and much of the perspective are
gone before it sees anything. A prediction comes out as a point that scores directly through the same
`scoreAt` the keypad uses.

That is what makes a few hundred photographs enough to try at all. It also means the two fronts share a
stage: any improvement to the face fit helps both.

Two more consequences worth stating:

- **Rotation augmentation is free and enormous.** A target face is round, so a crop rotated by any
  angle is another real training example with correctly rotated labels. One photograph is effectively
  unlimited orientations.
- **No inference runtime ships.** The forward pass is six convolutions and a head, written out in
  TypeScript. An ONNX or TFLite runtime would be several times larger than the model it loaded.

Trained on 364 crops, held out 92.

### What it was trained on, precisely

This matters more than the architecture, and it is the thing most likely to be over read from the
numbers below:

| | 60cm set |
| - | - |
| photographs | 479, of which 456 gave a face |
| arrows | 1640 labelled, 1513 usable |
| **venues** | **one**, an indoor hall |
| **cameras** | **one**, an iPhone 12 Pro Max |
| dates | 16, October 2022 to February 2023 |
| butts | a handful, straw with different paint |

Every photograph comes from one archer, at one club, with one phone. That is the same criticism
levelled at aimify above, and it applies here with more photographs but no more variety. **The numbers
below are in domain.** How this model behaves at another club, on another phone, is not measured, and
the honest expectation is: worse.

Getting the live path to see what the model was trained on took some care, and two mistakes were
found by measuring rather than by reading the code:

- Detection runs on a **reduced** frame for speed, but the model learnt on crops cut from photographs
  at full resolution. The camera therefore cuts its crop straight from the video with a canvas
  transform, which does the rotation, the scaling and the crop on the GPU and reads back only the
  finished 128 pixel square. Checked against the plain sampler, the two agree to under 2 levels out of
  255 on an untilted face, and about 6 on a tilted one, which is nearest neighbour resampling on a
  rotated grid and nothing more.
- The plain sampler filled anything **off the edge of the picture with mid grey**, while the training
  crops fill it with black. That is a colour the model had never seen at the edge of anything, and it
  was wrong in the app's own still path as well as in the live one.

## Results

All on the same held out fifth of the 60cm set: 92 photographs, 318 arrows, none of which the learned
detector saw during training.

| detector | reported | recall | precision | value agreed | impact error |
| -------- | -------- | ------ | --------- | ------------ | ------------ |
| aimify YOLOv8 * | — | 17.8% | 13.8% | — | 4.8% |
| ours, classical | 282 | 37.1% | 41.8% | **80.5%** | 2.9% |
| **ours, learned** | 296 | **70.1%** | **75.3%** | 74.9% | **1.8%** |

\* measured over the whole 60cm set rather than this fifth, at its best confidence. It trained on none
of it, so every photograph is unseen either way.

The learned detector's confidence is a dial, and the whole curve is more honest than any single row of
it:

| threshold | reported | recall | precision |
| --------- | -------- | ------ | --------- |
| 0.2 | 618 | 82.4% | 40.8% |
| 0.3 | 397 | 78.1% | 60.2% |
| **0.4** | 301 | 73.5% | 74.8% |
| 0.5 | 249 | 69.0% | 84.7% |

0.4 is what ships, being where the two meet. The classical detector has a similar dial in `bridge`,
and at no setting of it does it reach this curve.

Two sanity checks, because a number this much better than the one before it deserves them:

- **On the photographs it trained on** the learned detector scores 77.5% recall and 83.3% precision,
  against 70.1% and 75.3% on the ones it did not. Seven points of gap is a model that has generalised;
  a model that had memorised 364 pictures would show far more.
- **The TypeScript that runs in the app reproduces PyTorch exactly**, to four decimal places on the
  same weights and the same crop. The app is running the thing that was measured, not a port of it
  that drifted.

## What this says

**The learned detector is roughly twice the classical one, end to end.** Multiplying the two numbers
that matter, an arrow found *and* given the right ring: 37.1% × 80.5% = **30%** for classical, 70.1% ×
74.9% = **53%** for learned. It also places the impacts it finds far more precisely, 1.8% of the face
radius against 2.9%, which is a third of a ring against a half.

**It is still not good enough to score unsupervised**, and it is not presented as if it were. Half the
arrows come out right; the app asks before recording anything, and that is not going to change on the
strength of these numbers.

**Value agreement went slightly down**, 80.5% to 74.9%, and this is worth being straight about rather
than burying under the recall. The classical detector only finds arrows it is very sure of, which are
the easy ones, and easy ones are easier to score. The learned detector finds nearly twice as many,
including hard ones near ring boundaries, and gets a slightly smaller share of a much larger number
right. That is a good trade, but it is a trade.

**What made it work was not the model.** It is six convolutions and a hundred thousand weights, which
is nothing. What made it work was giving it a problem already stripped of scale, rotation and
position by the classical face detector, and a target face's roundness making every rotation of every
crop another real training example. The bet in
[arrow-detection-ml.md](arrow-detection-ml.md) — that rectifying first is what makes a few hundred
photographs enough — is the part that paid.

**And the biggest single lever is still data.** 456 photographs from one dataset produced this. The
recording feature exists to gather more, and the next real gain is more bosses and more venues rather
than more layers.

### What would be next

1. **Measure the live path.** Everything above is stills. The live camera now feeds the model the same
   kind of crop it was trained on, but that has not been measured against video with known scores.
2. **Use the reference frame.** The live path knows what the boss looked like before the end. Feeding
   the model that as extra channels is the strongest signal in the whole system and it is currently
   thrown away when the learned detector is chosen.
3. **More venues.** See above.

## Running it

```sh
# Prepare rectified crops from the labelled photographs
node scripts/prepare-arrows.mjs

# Train, evaluate on the held out split, and export weights the app can read
.venv-ml/bin/python scripts/train-arrows.py --epochs 260

# Measure either detector through the same harness, on the same pictures
node scripts/eval-arrows.mjs --detector classical --split test
node scripts/eval-arrows.mjs --detector learned --split test

# Measure someone else's weights the same way
.venv-ml/bin/python scripts/eval-yolo.py --conf 0.5
```

The training environment lives in `.venv-ml` and is not part of the app. Neither are the cloned
repositories in `scripts/`, nor the prepared crops; all are ignored.
