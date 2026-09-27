# Wrist motion, recorded end by end

Built 2026-09-27. A research aid: the watch records its gyroscope and accelerometer through each
end, the phone keeps each recording beside the end it belongs to, and an export carries both out for
analysis. Nothing in the app reads the samples yet.

## Decisions

**Matched to the end, not the arrow.** Arrows are scored as a full end after walking to the target,
so an arrow's score cannot be tied to its shot without guessing. An end's recording and an end's
score are both certain.

**The window was scored end to scored end,** until rounds were cut arrow by arrow (below). The watch cuts a segment whenever the end being shot
changes: the first end with an empty slot on the wrist, whether the arrows were entered there or
pushed from the phone. The segment therefore includes the walk to the target and back, which is easy
to trim afterwards, and no shot is ever missed for want of a start button. Shorter than ten seconds
is an undo and a retap, and is dropped.

**Opt-in, off by default,** from the watch card in the settings. The phone says `mr` with every round
and on every recovered hello, and the watch remembers the last answer. Which arm the watch is on is a
phone setting, stamped on each recording as it arrives.

**The existing link, not the Data Layer.** The Data Layer needs one application id and signing key
on both ends, which the two apps do not share, and it would leave the browser build out.

**Local only, never synced.** An end is a few hundred kilobytes. `wrist_motion` is not in
`OWNED_TABLES` and never will be without a reason to put this on a server.

## A round, arrow by arrow

During a round the shot rule runs too, and each release closes the segment 0.7 seconds later: a
segment is then one arrow's draw, hold, release and follow through, carrying its end (`n`) and its
place in that end as shot (`o`, `shot_ordinal`), with `sh` / `ended_on_shot` set. What is left after
the last arrow, the walk to the target and the scoring, closes when the end is scored and has no
`sh`. The order is the order shot, which is kept so that arrows scored in the same order can later
be paired with their motion. With `Auto` on, the wrist buzzes on each shot as it does in training.
Segments shorter than three seconds are dropped.

## Training arrows

Recorded too, to have labelled data for an automatic training arrow counter. Switched on the watch
itself, under the training arrow buttons, and remembered there; the phone's switch covers rounds
only. While the session screen is up the watch records and cuts a segment at every change of the
count, so a segment carries `tb` (the count as it began) and `ta` (the count it ended on): `ta - tb`
arrows were counted in it. A segment with no `ta` ended because the screen changed, not the count.
Shorter than three seconds is a double tap and is dropped.

On the phone these rows have `activity_id` `training`; the export attributes each to the newest
session that began before it.

## Counting training arrows from the wrist

A second switch beside the recording one, `Auto`, has the watch count a training arrow by itself. A
shot is a jolt above 25 m/s² (gravity included) after a still hold: the gyroscope's mean between 1.5
and 0.2 seconds before it under 0.4 rad/s, and nothing within three seconds of the last shot. The count, and its double buzz, come 0.7 seconds after the
release: the follow through then stays in the shot's own segment, and a buzz at the release itself
was lost in the jolt. On the
first 30 labelled shots releases measured 27 to 47 m/s² with holds of 0.10 to 0.29 rad/s, and the
two jolts that were an arm moving about had holds of 1.27 and 1.56; the rule matched every count.
One archer, a wristband rather than a bow, so the figures are a start rather than an answer.

The rule lives twice, in `Motion.java` and in `findShots` in `src/lib/watch/motion.ts`, and the two
must stay equal: the phone uses its copy to show what the watch would have counted.

Every recording says who ended it, `by` on the wire and `counted_by` in the table: `archer` for a
tap, `watch` for the counter. Only a tapped count is a label; a count the watch made is its own
guess and training on it would teach the counter nothing.

## Checking the recordings

`/sessions/[id]/motion`, reached from a button under the training arrows while recording is on.
Per recording: the rate the sensors really gave, the longest gap, gravity at rest, the size, and
the shots `findShots` sees against what was counted, over a line of the acceleration. It says
whether the recording works, not how the shot was.

## Transport

The watch sends one segment at a time, after the end: `mh` (header), then `mc` chunks of base64, then
waits for the phone's `mk`. Chunks go only while `outbox` is empty, so a tap never queues behind a
recording. A segment is sized to the MTU actually negotiated rather than to the 180 byte budget,
because a lost chunk costs a resend, not a wrong score; below 180 bytes of payload nothing is sent.

On the installed app the phone half is native: `WristMotion.java` takes `mh` and `mc` off the link
before the page ever sees them, keeps each finished segment as a file and says `mk`, because the
page is frozen whenever the screen is off and every chunk sent to it then was lost. The page moves
the files into `wrist_motion` on each heartbeat answer, on coming back to the screen, and before the
settings count or export them. The browser build still assembles in `link.ts`.

The phone writes the segment and only then says `mk`. Without it the watch sends the whole segment
again after 30 seconds, then after doubling waits up to five minutes: a phone whose page is frozen
with the screen off drops every chunk, and hammering it would only cost the watch battery. A
segment delivered twice is kept once, on `(activity_id, watch_key)`.

The watch keeps segments as files in `files/motion/`, the description written after the data, so a
segment half written is never offered and an app restart loses nothing already closed.

## The file

Deflated (zlib). Inside, little endian:

| Bytes | |
|---|---|
| `AMO` `1` | magic and version |
| u16, u16 | gyro scale (1000), accel scale (200) |
| records | until the end |

A record is a sensor byte (0 gyro, 1 accel), a u16 time since the previous record in tenths of a
millisecond (`0xFFFF` means a u32 absolute time follows instead), then x, y, z as i16 differences
from that sensor's previous sample, wrapping in 16 bits. Divide by the scale for rad/s and m/s²,
gravity included, in the watch's own frame. Differences are what makes it compress.

Both sensors are asked for at 100Hz. Above 200Hz Android wants `HIGH_SAMPLING_RATE_SENSORS`.

`src/lib/watch/motion.ts` decodes it and is tested against a writer that mirrors `Motion.java`.
`scripts/wrist-motion.mjs` turns an export into one CSV per end and an `index.csv` with scores.

## Measured on the TicWatch Pro 5, 2026-09-27

One end of about 90 seconds: 85 KB raw, 49 KB packed, sent in 569 chunks in 2.6 seconds.

**Asked for 100Hz, got about 53Hz** from each sensor (median 18.8ms between samples, gaps up to
258ms). That is the hardware: `dumpsys sensorservice` lists the lsm6dso accelerometer and gyroscope
at `maxRate=52.00Hz`. Gravity reads 9.78 m/s² at rest, so the scales are right.

**The stack refuses a notification of about 500 bytes as "too long"** under a 517 MTU
(`bta_gatts_api: data to indicate is too long` in the watch's log) and never calls
`onNotificationSent`, so each one cost the two second guard. Chunks are capped at 244 bytes.

**A restarted watch app never hears the MTU.** The phone keeps the link and does not negotiate again,
so `payload` sat at 20 and nothing was sent. The longest write from the phone is now taken as proof of
room, which is why the first send after a restart waits for the phone to write something long.

## Still open

The rate with the screen off over a whole round, and what an afternoon costs the battery.
