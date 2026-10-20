# Labelling

The labelling page is the app's own route at `/label`, served by `vite dev` and left out of builds.
Start the app with `npm run dev` and open `http://localhost:5173/label`. `LABEL_READONLY=1` refuses
every write. Recordings still have to be prepared first, with `./scripts/labeling_tool.sh --prepare`.

The old page (`./scripts/labeling_tool.sh`) still works and still writes `labels.json`. The new page
never touches that file.

## Flow

The page opens on the first recording that still wants something, at the first step it wants, and
Enter moves on to the next thing. Each recording goes through these steps.

1. **Face.** The automatic fit of every frame, one at a time. Enter accepts it and X says there is no
   face. To fix a fit:
   * drag inside the face to move it;
   * drag the rim to stretch that side;
   * drag the knob above the face to turn it;
   * click any ring edge you can see, three times or more. Each click snaps to the nearest colour
     change, and the page guesses which ring was clicked. Keys 1 to 5 correct it: 1 is the white
     edge, 2 the black, 3 the blue, 4 the red and 5 the gold.

   The tap fit only moves what the taps can see, which is the centre and the shape of the ring.
   Perspective and the turn stay as they were, so a face half out of the picture can still be fitted
   from the rings that are in it.
2. **Arrows.** Placed once, on the frame where the face is biggest and seen most squarely. The still
   detector's guesses are drawn as dashed `?` circles. Click a guess to take it, or click where a
   shaft enters the paper. Holding the button shows a loupe to aim with.

   The arrows are then carried to every other frame through that frame's fit. A fit can sit turned,
   because nothing in a set of circles says which way up they are, so on reaching a frame the page
   turns it to the angle that lays the most arrows on what the detector sees there, and says so.
   Undo puts it back. Dragging one arrow moves it on that frame only. H hides the chosen arrow from
   this frame to the next frame already checked, for an arrow behind another or out of the picture.
3. **Nocks**, only with *Label nocks* ticked, which is off by default: nothing the scorer measures or
   learns from reads them. Off, the step, the nock lines and their share of the progress are gone. Six frames spread over the sweep, counting any already nocked. Each visible arrow is
   asked for in turn. S says the nock cannot be seen.
4. **Score.** Runs `eval-arrows-video.mjs --slower 0` on the recording, which gives the same numbers
   as the overnight reports. The player (P, from any step) plays the recording through the phone's
   own live path: `LiveScanner`, its worker, and `LiveView`, which the camera page draws with too.

## Help along the way

* **Orientation from the paper.** Nothing in a set of circles says which way up a face is, so each frame's
  fit can sit turned from the reference. `texture.ts` unrolls both faces into rings of brightness and
  finds the turn that lines up their holes and tears. Against 100 frames aligned by hand it answers on
  87, with a median error of 0.5°. Reaching an unchecked frame turns it; L turns every unchecked frame.
* **Doubtful frames.** A red `!` on a frame means its fit reads under half the ring colours it should
  (Face step). In the Arrows step it means fewer than half its arrows sit on a shaft the detector sees,
  counted only where the detector sees enough shafts to say so. D jumps to the next one.
* **Faces.** Add a face in the Face step for a three spot. Each face has its own fit, type and arrows,
  and Tab moves between them. The measuring scripts still read only the first face.
* **Prepare.** Recordings in the corpus that are not prepared yet are listed under the queue, with a
  button that runs `label-arrows.mjs prepare` on each of them alone.
* **Service worker.** Under `vite dev` the app's service worker does not answer requests. Before this,
  it served cached copies of the page and its labels, so a reload brought back old versions at random.

## Arrow numbers are not identities

An arrow's number says which arrow it is on the frame it was placed on, and nothing more. In the old
labels every frame with arrows of its own was clicked afresh, so arrow 2 on one frame is often a different
shaft from arrow 2 on another. The new tool's `moved` can do the same when a dragged arrow lands on its
neighbour's shaft. Anything comparing arrows across frames, such as a turn, a drift or a training target,
has to match them as a set, by nearest position. Pairing them by number once made a correct texture
alignment look 20° wrong on one frame in five, and hid how much the scorer's fit drifts.

## Format

`src/lib/labelling/format.ts` holds the format and everything that converts it. The page and the
node scripts share it, which works because node strips the types itself.

* A recording has a list of faces, so that trispots can be added later. Each face has a type, the
  number of arrows in the end, and its arrows in face coordinates, where 1 is the outer edge of a
  full ten ring face. They are expressed in the fit of `placedOn`, the frame they were placed on.
* `frames[i][faceId]` is absent while a frame has not been looked at, and its automatic fit then
  stands. Otherwise it has:
  * `state` (`ok` or `none`);
  * `fit`, the picture points of face points (1,0), (0,1), (-1,0) and (0,-1);
  * `arrowsOk`;
  * `moved`, arrows placed on that frame alone;
  * `hidden`, arrows out of sight on that frame;
  * `nocks`, in picture pixels, null where a nock cannot be seen.

`scripts/lib/labels.mjs` gives the measuring scripts their labels in the old shape, from the new file
when there is one and from the old file otherwise. A frame with hidden arrows lists only the visible
ones, so scripts that want every arrow skip it, and `frameHidden` says where the others are.

Hidden arrows change the scores as follows:

* `eval-proposer.mjs` counts a proposal on a hidden arrow as neither right nor wrong.
* `eval-arrows-video.mjs` counts an arrow as owed only when it is in sight on enough of the checked
  frames for the tracker's seven looks.
* The training export uses frames with hidden arrows and shows the crop only the visible ones.

`scripts/export-frames.mjs` writes every checked frame as an image, with its fit, its arrows in
pixels and its nocks. `scripts/convert-labels.mjs --write` converts every old file once the old tool
is retired. Until then nothing needs converting, and converting early would hide later edits made
in the old tool behind the new file.
