# Running

A run is an activity like a round is: one thing done inside a session, with no arrows and no score,
kept out of every arrow figure the app counts (see `shootsArrows` in `src/lib/domain/stats.ts`).

Two ways in, one record out.

* **Tracked.** The phone follows the run by GPS and fills the record as it goes.
* **By hand.** Two numbers off a watch or a treadmill, which is all a run is worth keeping without a
  satellite, and the only way in a browser tab that cannot stay awake.

Both fill the same `distanceM` and `durationSeconds`, so the session card, the badges and the
statistics read one shape and never ask which kind they are looking at.

## The model

`src/lib/domain/run/workout.ts` is the programme: blocks in order, and repeats holding blocks.

A repeat holds its own blocks rather than being a count on one, because an interval session is a
pair of blocks repeated and never a single one. *7 times (200 m fast, 100 m easy)* is one repeat of
two blocks; written as two repeats of one it would run all seven fast reps before any recovery.

`flatten` unrolls a workout into the steps that will actually be run, one per block per round, each
with a key of its own. The live screen counts against a step, and a result is recorded per step, so
seven rounds are seven results rather than one with a counter on it.

`src/lib/domain/run/track.ts` is what the fixes add up to. The same rules run on the live totals and
on a track replayed afterwards, so a run reopened adds up to what it did while it ran.

### What counts as a stride

A receiver reports where it thinks it is, and a phone lying still on a table reports a different
place every second. Unfiltered, at one fix a second, that is a kilometre every few minutes of
standing about. So a fix has to pass all of these before a metre of it is counted:

| Rule | Why |
| --- | --- |
| accuracy at most 25 m | worse than that and the fix says which street, not where on it |
| time since the last fix greater than zero | a repeated or reordered fix is not a stride, and dividing by no time is what let a jump through |
| reported speed at least 0.7 m/s, when the fix reports one | Doppler is measured; a difference of two guesses is two guesses |
| step longer than max(3 m, half the fix's own stated accuracy) | a fix admitting to 20 m of error is entitled to wander ten of them |
| step no faster than 8 m/s | faster than anybody runs, so it is a jump between fixes |

The accuracy share is the rule that matters most: it scales the floor with what the receiver itself
admits to, so a clean fix counts a short stride and a vague one has to move properly to count at all.

The speed rule is what saves the slow runner: at one fix a second a runner at 2.5 m/s covers less
ground between fixes than a vague fix may wander, so a fix that reports moving is believed over the
distance floor.

A rejected fix never becomes the new reference, so drift cannot accumulate one rejected step at a
time: the next fix is still measured from the last one that counted.

`src/lib/domain/running.ts` is the record itself: the two numbers, the mode, the clock (`RunLive`),
the workout it was run to, the splits and the per block results.

## Where it is stored

| What | Where | Travels |
| --- | --- | --- |
| The run: numbers, clock, workout snapshot, splits, block results | `activity.measurements`, JSON | yes, with the activity |
| The fixes | `run_point`, a row each | no |
| The programmes | `run_workout` | no, yet |

The fixes are rows rather than JSON on the activity because a run is thousands of them, written while
it happens and read once when it is looked at again.

Neither new table is in `OWNED_TABLES`, so neither is pushed. What a run came to travels on the
activity and is the same on every device; the raw trace stays on the phone that recorded it. Both
tables carry what they need to start travelling the day the server learns about them: `run_workout`
has the sync columns already. Adding them to sync is a Supabase migration plus an entry in
`src/lib/db/synced.ts`, see `doc/migration.md`.

## Tracking on Android

A run is spent with the phone in a pocket and the screen off. Android stops handing locations to a
process it has backgrounded and freezes a backgrounded webview's timers with it, so tracking from
the page alone loses the middle of every run. A foreground service is the one thing the platform
promises to keep running.

* `android/app/src/main/java/com/appchery/app/TraceService.java` holds the fixes. It asks
  `LocationManager` for `GPS_PROVIDER` once a second with no minimum distance: the judging of what
  counts as movement is the app's, and a filter there would hide a runner waiting at a crossing.
* `TracePlugin.java` is the page's handle on it. Fixes are **pulled, not pushed**: a page frozen for
  twenty minutes asks once, by sequence number, and is told everything it missed. That is the same
  call it makes every second while it is on screen, so there is one path and not two.
* `src/lib/run/source.ts` chooses the service when there is one and the browser's own geolocation
  when there is not, behind one shape.
* `src/lib/run/live.svelte.ts` owns the clock, the totals, the block being run and the writing of all
  three. Nothing lives only in memory: the run is written to the activity every few seconds and on
  every button, so a phone that kills the app mid run loses seconds rather than a run.

No Play Services. `LocationManager` is accurate enough for a stride and keeps the app free of a
dependency it has never needed.

### Permissions

| Permission | Why |
| --- | --- |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | the fixes. Already declared for the weather |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` | the service that keeps receiving them |
| `POST_NOTIFICATIONS` | the notification a foreground service runs behind |

`ACCESS_BACKGROUND_LOCATION` is deliberately **not** asked for. The service is started while the app
is on screen, which is what a run is started by, and that is enough for it to keep receiving fixes.
Asking for background location would put the app in front of a Play review for a permission it does
not need.

Both are asked for on the way into a run rather than on a settings screen nobody visits. Being
refused the notification costs the runner a notification, never the run.

## In a browser

`navigator.geolocation` works, and a run tracked in a tab that stays awake is a real run. A tab the
phone puts to sleep stops receiving, so the live screen says so rather than pretending otherwise.
The way out is the same page: enter it by hand.

## On the watch

The wrist shows the run and decides nothing about it, exactly as it decides nothing about a score.

`LiveRun.glance` is the run in one small object: status, clock, distance, pace, and the block being
run with what is left of it. `mirrorRun` puts it on the link as a `run` message, every two seconds
while a run lasts and at once whenever the block or the status changes.

`run` is a new message type and **not** a new `screen`, and not a protocol version either. A watch
built before runs existed ignores a type it has never heard of and goes on showing the session,
where a screen name it did not know would leave it with nothing drawn at all, and a version bump
would have it refuse the phone outright. The watch takes the screen for itself when a run frame
arrives live and gives it back to whatever the phone was mirroring when the run stops.

What travels is figures and a block kind, never a sentence: `RunView` on the watch names the four
kinds in its own words, as `KeypadActivity` names everything else.

### The pages

`RunView` is pages, a tap, a fling or a crown detent apart, with dots saying which one is up:

| Page | What it is for |
| --- | --- |
| Ready | before the start: what the programme asks for, and the button that begins it |
| Block | the block being run: what is left of it, and the pace against its target |
| Run | the run's own totals: clock, distance, average pace |
| Next | the block coming, and at what pace |
| Controls | pause, resume, finish, and whether to hold the screen awake. A swipe to the right away from the rest |

The controls are a page of their own and never on the block page. A run is stopped once and read a
hundred times, and a stop button under a thumb mid stride is a run lost. Finish is asked twice, for
the same reason.

Two ways of keeping the run in sight sit there too, both opt in and both remembered, because
whoever wants one wants it on every run:

The four buttons sit two to a line. A round screen is widest across its middle, so a column of four
puts the first and the last where the glass curves away from them; side by side they all sit in the
band that is actually square, and each of them can be smaller for it.

* **Screen on** holds the screen lit for as long as the run is showing. An hour of that is most of
  what a watch has, which is why it is asked for rather than assumed.
* **Always on** is ambient: the watch sleeps with the run still on the screen, dimmed, black and
  white, with the dots and the colours gone, because an OLED lights only what is drawn. The second
  by second redraw stops with it; the activity wakes the screen every twenty seconds on an inexact
  alarm, which is the pace a block, what is left of it and the pace it asks for can be read at, and
  inexact so the watch can line the wakeup up with whatever else it was waking for anyway. It needs
  the watch's own always-on screen to be on, which is a setting of the watch and not of this app: the
  page reads it and says so rather than offering a toggle that quietly does nothing.

Ambient is granted by the observer being attached, so it is attached only once it has been asked
for. It also needs `<uses-library android:name="com.google.android.wearable" />` in the wear
manifest: the class androidx talks to lives in the watch's optional shared library, and without the
entry the request is dropped in silence, see doc/llm-memory/run-tracking-android.md. `AmbientLifecycleObserver` is why the watch activity is a `ComponentActivity`: the platform has
no call for this, and the library needs a lifecycle to hang the observer on.

Tapping the pace swaps minutes a kilometre for kilometres an hour, on the wrist and on the phone
alike. Every run starts back in minutes a kilometre, because that is what a programme is written in.

The information pages move up and down, which is the way the crown turns: the dial and the finger
agree about which way they lie, and the dots stand up the right hand edge rather than lying in a row
under the figures, because a row of dots says the pages are side by side.

The controls are not among them. They lie to the right, a sideways swipe away, and the way back is
that same swipe again rather than its mirror: the mirror of it is how Wear closes an app, so a
runner looking for the numbers again would find themselves out of the app mid run. Both moves
animate the same way, out to the left and in from the right, because both are the same gesture; an
animation that ran backwards would be showing a swipe nobody can make. A turn of the crown also
leaves the controls, which is the way out that cannot be swiped past.

A swipe that starts at either edge is left alone: the edges are the system's, and which of the two
directions it takes is the watch's business rather than something to guess at from here.

Whatever moves, the page leaving slides the way it was pushed and the next one follows it in, which
is what says there are pages at all.

The clock runs on the watch. Frames arrive every second or two, and a display that moved only when
one landed read as a clock that stutters. But anchoring it to each frame was no better: the phone
sends whole seconds, so every frame carries up to half a second of rounding, and a second would last
1.4s and the next 0.6s. What arrives is a correction rather than the time. A disagreement of under
two and a half seconds is walked off a tenth at a time; anything larger is the run having moved, a
pause or a block jumped to, and is taken whole. The redraw is scheduled for the moment the second
turns rather than on a fixed beat, so the digits change at an even pace whatever the link does.

The seconds on screen are held to one rule of their own: never backwards, and never two at once
unless the gap is plainly a gap rather than a correction. A slew of a tenth lands on the wrong side
of a boundary often enough, and a clock that shows 23 and then 22 again reads as broken whatever the
arithmetic says. The block countdown runs against the same clock, under the same rule the other way
round. The distance does not tick at all, because it is the one figure the wrist cannot work out for
itself.

### With the screen off

A run is spent with the phone in a pocket, and Android freezes a backgrounded webview: the page that
works the run out stops working anything out. The fixes were never the problem, because the service
buffers those, but the wrist sat on figures minutes old while the Bluetooth stack was perfectly
healthy and nobody was telling it to write.

So the link itself belongs to the app rather than to the page. `Wrist.java` holds the GATT
connection to the watch, and `ble.native.ts` drives it while the page is awake. The Bluetooth plugin
is still what *finds* a watch, which is a scan and a chooser and belongs to nobody's run.

`RunFrames.java` is what speaks when the page cannot. The page hands down a plan on every frame it
sends, which is where its clock and its distance are, the programme unrolled into steps, and which
step it is on. Once the page has been silent for four seconds, the service starts composing the same
frames itself: the clock from the anchor, the distance from its own copy of the gates in
`track.ts`, and the blocks advancing as their goals are met, so the wrist still buzzes on the
interval a runner cannot see coming.

A paused run keeps its service. Stopping it is the app giving up the one thing keeping its process
alive, and Android reclaims the process within seconds: the run could be paused from the wrist and
then never resumed, because there was nothing left to ask, and the phone came back to its launcher
with the app started again from the beginning. So a pause holds the service with nothing to listen
to, and only finishing a run or leaving it stopped puts it down.

The buttons work while the page is frozen for the same reason the frames do. `Wrist.java` offers
what arrives to `RunFrames` before the page: if the page has been silent for seconds and the message
is a run button, the service acts on it, stops or restarts the fixes itself, and sends the frame that
answers it. Everything it did, the clock it stopped, the block it reached, the run it finished, is
handed back through `claim` when the page thaws, and the page adopts it rather than carrying on from
where it was frozen. A page that thaws to a paused run has no ticks to notice anything with, so it
asks again the moment the screen is looked at.

Nothing here runs on a timer. A frame goes out on the back of a location the service was already
woken for, at most one every three seconds: an hour of running is an hour of battery, and a timer of
its own would be an hour of wakeups bought for nothing. A paused run sends nothing at all, because
its fixes have stopped and the wrist already has the frame that says paused.

The page stays the authority. When it thaws it notices the gap, takes back what the service did
through `claim`, and adopts the one thing it cannot rebuild from the stored track: which block the
run reached, when it changed, and what the finished blocks came to. Everything else it works out
again from the fixes, which is why the totals at the end are the track's and not the service's.

In a browser none of this exists: there is no service, so a tab the phone puts to sleep stops
recording and stops mirroring, and the page says so rather than pretending otherwise.

### The buttons ask

The watch never drives the run. `rc` carries `go`, `pause`, `resume` or `stop` up to the phone, which
runs them through the same `LiveRun` methods the phone's own buttons use and answers with the next
frame, exactly as asking to open an activity is answered by the phone opening one. A command that
makes no sense where the run has got to is refused rather than obeyed, so a wrist showing a stale
frame cannot restart a run that has finished.

Each command is a message type of its own, `rg`, `rh`, `ru`, `re`, rather than one type carrying an
action. The budget is not the MTU a link usually negotiates but the twenty bytes it falls back to
when it never did: `{"v":2,"t":"rc","a":"pause"}` is twenty eight bytes and was dropped at the
watch's end in silence, which is a pause button that works only on a well negotiated link.

Every block wears the colour of what it is for, the same four in `src/app.css` and in `RunView`:
warm up amber, work green, recovery blue, cool down grey. The phone paints them through inline
styles from `--c-run-*`, beside the chart colours and for the same reason.

### The cue

`cue` counts block changes. When it goes up, the watch buzzes twice and takes a six second wake lock
so the screen lights: a runner mid interval is not looking at their wrist, and the whole value of
the cue is that it arrives when they are not. The new block, its target pace and what is left of it
are then the largest things on the screen. The screen is held awake for as long as a run is on show,
which is what a run app does and what a run costs in battery.

The TicWatch Pro's second, always-on LCD is drawn by the watch's own firmware and an app cannot put
a pace on it. Wear OS ambient mode could keep this activity on screen dimmed, refreshing rarely;
whether that refresh is often enough to call a pace live has to be measured on the watch before
anything is built on it, and the answer belongs in `doc/llm-memory/`.
