# Plan: a learned arrow detector, alongside the classical one

## Why

Face detection is solved well enough. Measured on 2048 annotated faces, the classical pipeline finds
and accepts **97.0%** of them, with 0.02 false faces per image and a centre error of 2.3% of the spot
radius. It needs no training data because a target face is a specified object with published
geometry, and it gives something a learned model would have to be taught: a rectified coordinate
frame, in which the scoring rules already work.

Arrow detection is not solved. Measured on the 60cm set, 479 photographs carrying 1640 labelled
arrows:

| measure | classical, today |
| ------- | ---------------- |
| arrows found | 37.2% |
| candidates that were arrows | 41.9% |
| value agreed, of those matched | 79.2% |

Roughly one arrow in three is found *and* valued correctly. Every improvement over the last rounds
has come from a hand written rule about what a shaft looks like, and the returns are getting smaller:
the last two changes traded recall for precision rather than adding either. The remaining errors are
things a rule struggles with and a model should not: a shaft against the black ring, one arrow behind
another, a boss so peppered with old holes that the paper model is half holes.

So the case for learning is specific. It is not that classical vision cannot see a target face. It is
that "is this dark streak an arrow, and where does it enter the paper" is a perception problem with no
closed form, and we have the one thing that makes learning work: a way to collect a lot of real
examples.

## The shape of the thing

**The model does not look for the target.** The classical detector finds and rectifies the face, and
the model is handed a square crop in face coordinates, gold centred, radius normalised. That choice
carries most of the plan's weight:

- The model never has to learn scale, rotation, position, or perspective. Every training example is
  already in the same frame, which is worth an enormous amount of data.
- The output is directly a score. A point in face coordinates goes straight into `scoreAt`, the same
  function the keypad and the target face input use.
- It stays honest about what is being replaced. If the face fit is wrong, the model's answer is wrong
  in a way that is visible on the overlay, rather than wrong invisibly.

**Formulation: keypoints, not boxes.** An arrow is a point of impact, not a rectangle. A small
heatmap network is the right shape:

- Input: 256×256 RGB crop of the rectified face, plus, for the live path, the same crop of the
  reference frame (six channels). The reference channel is the strongest signal in the whole system
  and it is free on the video path, which is where scoring actually happens.
- Output: one 64×64 impact heatmap, plus two sub pixel offset maps. Peaks over a threshold are
  arrows; the offsets recover a position finer than the heatmap cell.
- Loss: focal loss on the heatmap with Gaussian targets, L1 on the offsets at labelled peaks.

This is a CenterNet style head on a small backbone. At 256×256 with a MobileNetV3 small or a plain 8
layer convolutional trunk it is 1 to 3 MB of weights and a few hundred million operations, which is
well within what a phone does in a fraction of the 300ms detection budget the pipeline already has.

**Two heads, later.** Once impacts work, a second head predicting the shaft's bearing would let the
same network do the association work that `likeTheBest` does by hand. Not in the first version.

## Data, which is the actual project

The datasets on hand are not enough, and it is worth being precise about why:

- `test/datasets/60cm` is 479 photographs with 1640 labelled impacts. Checked rather than assumed:
  every one is from a single iPhone 12 Pro Max, in one indoor hall, over 16 dates. A good
  **evaluation** set and a narrow training set.
- `DutchTargetData_Kaggle` is 650 photographs with 2048 boxes, and each box is a *spot of a trispot*
  labelled with the score of the arrow in it. Many devices, judging by eight distinct resolutions, so
  it is the most varied set to hand. It carries **no impact coordinates**, so it cannot train a
  keypoint model directly, but it is exactly right for the face stage and is what that is measured on.
- `aimify`'s set is 140 photographs with polygons for the ten rings and for each arrow. The impact can
  be derived from an arrow polygon, and it adds real variety: outdoors, wooden shafts, different
  bosses. Its catch is framing, covered below.
- None is video, so none carries the before and after pairing that the live path has.

What is needed, roughly, for the first useful model:

| source | target | why |
| ------ | ------ | --- |
| recorded scoring sessions | 50 to 100 ends | the real distribution, with reference frames |
| distinct bosses and venues | 10 or more | paper condition and lighting dominate the failure modes |
| arrow types | 4 or more | carbon, aluminium, wraps, different fletching |
| labelled impacts | 5000 or more | the number that matters, and one end gives 3 to 6 |

That is achievable from ordinary shooting. An archer shooting a 72 arrow round produces 72 labelled
impacts in an afternoon, and the score sheet they are already filling in *is* most of the label.

### Collecting it

The recording setting added for this is the front end of the pipeline: turn it on in settings, shoot
normally, and each camera scoring session is kept as a video on the device. See "Getting the video off
the phone" below.

Labelling is where the effort goes, and there are three ways to cut it down, in increasing order of
cleverness:

1. **The archer already labels.** Every end scored in the app has its arrows entered by hand, with a
   position when the target face input was used. Pairing a recording with the end it belongs to gives
   labels for free, in exactly the coordinate frame the model works in. This is worth building first:
   it turns ordinary use into a dataset.
2. **The classical detector proposes, a human corrects.** Detection is at 42% precision, which is bad
   for scoring and fine for a labelling aid. Correcting a proposal is much faster than placing a point.
3. **Frame differencing across the video does the rest.** Between two frames of a quiet boss, exactly
   one thing changed. Labelling the arrow once labels it in every subsequent frame of that video,
   which multiplies each hand label by however many frames the end lasts.

### Synthetic pretraining

Before any of that, the pipeline can pretrain on rendered faces: the same generator the unit tests
use, with shafts at random bearings, lengths, thicknesses and lighting, over scanned real paper. This
will not produce a good detector on its own. It does produce a sensible initialisation, and it lets
the whole training and deployment path be built and measured before a single real video exists, which
means the real data goes into a system that already works end to end.

## Keeping both fronts

The classical detector is not being replaced, and both must stay runnable and measurable:

- **One interface.** Both implement the same shape: given a `Frame` and a `FaceLocation`, return
  impacts in face coordinates with a confidence. `still.ts` already returns nearly this.
- **One harness.** `scripts/eval-arrows.mjs` reports recall, precision, value agreement and impact
  error. It takes a `--detector` flag and reports the same four numbers for either. Any claim that the
  model is better has to be that claim, on that harness, on a set the model never trained on.
- **The 60cm set is evaluation only.** It never enters training, or the numbers above stop meaning
  anything and there is no way to compare the two fronts.
- **A setting chooses.** Classical stays the default until the model beats it on the harness, and the
  choice stays available afterwards, because a model that is better on average can still be worse on
  some particular boss.
- **They can also combine.** The likeliest good outcome is not one winning: it is the classical
  detector proposing and the model scoring each proposal, which needs far less data than detection
  from scratch and is the cheapest thing to try first.

## Milestones

Each one has something measurable at the end of it, and each is worth stopping at.

1. **Harness takes two detectors.** `--detector classical|learned`, with the learned one a stub. No
   model, no data. Proves the comparison is honest before anything depends on it.
2. **Recording produces training data.** Pair a recording with the end entered in the app, and export
   video plus labels. Exit: one real session round trips into a labelled example.
3. **Synthetic pretraining, end to end.** Train on rendered faces, export ONNX, run it in the browser
   through the harness. Exit: the learned path produces numbers on the harness, however bad.
4. **First real model.** 5000 or more labelled impacts, trained, measured. Exit: beats classical on
   precision at equal recall, or the reverse. If it does not, the data is the problem, not the idea.
5. **On the phone.** ONNX Runtime Web with the WASM backend inside the existing 300ms budget, on a mid
   range Android. Exit: no regression in the overlay's frame rate.
6. **Default switch.** Only once 4 and 5 both hold on a set the model has never seen.

## Deployment

ONNX Runtime Web, WASM backend with SIMD and threads, WebGPU where it exists. One artefact runs in the
browser and in the Capacitor shell, which keeps the app single sourced and local first: the model ships
with the app and no image ever leaves the device. That property is worth protecting and should
constrain the model size rather than the other way round.

## What could make this not worth doing

Stated plainly, because they are real:

- **The label bottleneck.** If pairing recordings with entered ends turns out to be fiddly, the
  dataset is hand labelled, and 5000 points by hand is a long evening. Milestone 2 exists to find this
  out early.
- **The live path may not need it.** Frame differencing against a quiet boss is a very strong signal,
  and the live detector's real problems are camera shake and the archer walking in front, which are
  robustness problems rather than perception ones. The model's clearest win is on stills.
- **A model trained on one club's bosses will learn that club's bosses.** The venue count in the table
  above is not padding.

## Getting the video off the phone

Recording writes the session into the app's documents directory and then opens the system share sheet,
which is how anything leaves a phone: to Files, to Drive, to a mail to yourself, or over a cable. The
file is a `.webm` named by timestamp. Nothing is uploaded by the app.

This needed fixing rather than describing. The first version created an anchor with a `download`
attribute, which is correct in a browser and does nothing whatsoever inside the Android web view: no
download manager sits behind it, so the file went into a blob URL that nothing could open and was then
discarded. Database backup export had the same bug and the same silent failure. Both now go through
`src/lib/files.ts`, which keeps the anchor for the web and uses Filesystem plus Share on a phone.
