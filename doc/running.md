# Running

A run is an activity like a round is: one thing done inside a session, with no arrows and no score,
kept out of every arrow figure the app counts (see `shootsArrows` in `src/lib/domain/stats.ts`).

Two ways in, one record out.

* **Tracked.** The phone follows the run by GPS and fills the record as it goes.
* **By hand.** Two numbers off a watch or a treadmill, which is all a run is worth keeping without a
  satellite, and the only way in a browser tab that cannot stay awake.

Both fill the same `distanceM` and `durationSeconds`, so the session card, the badges and the
statistics read one shape and never ask which kind they are looking at.

A programme running out does not end the run. The blocks finish, the wrist says *Free run* and the
clock carries on from there with nothing to hold and nothing counting down, until the runner says
otherwise: the way home from the track is a run, and a warm down nobody wrote down is still time on
the feet. The service does the same while the page is asleep, and hands it back through `claim`.

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

## Laps and zones

A lap is a split the runner asked for, kept apart from the kilometres rather than mixed in: a
kilometre is arithmetic and a lap is a decision, the top of the hill or the lamp post somebody
sprinted to. Each is measured from the last one, because what a lap is worth is what it took on its
own. The button is on the phone's own bar and on the wrist's controls page, and it is the one button
there that cannot cost anything: pressed by accident it leaves a line in a list, where everything
else on that page changes what the run is doing.

A heart rate is nothing without the heart it belongs to, so `src/lib/domain/run/zones.ts` works
against a maximum the archer gives in the settings and refuses to guess one from an age the app does
not know either. Five zones at the shares of maximum everybody agrees on, with a colour each, cool
to hot. The run says where its time went rather than only what it averaged: an hour held steady and
half an hour of intervals come out at the same average and are not the same training.

The wrist wears the zone as the ring around the glass on its heart page, because a colour is read at
a glance and a figure is not. The zone is worked out on the phone and sent back down rather than
worked out where it is measured: the maximum is a setting of the app, and the wrist would otherwise
have to be told it and kept up to date with it, for something the phone can send in eight bytes.

## Holding the clock

A run can hold its own clock while it is going nowhere, and that is off unless it is asked for. A
crossing, a gate and a bootlace are not running; but a run that pauses itself is a run the app has an
opinion about, and the opinion is wrong every time somebody is walking a hill on purpose.

It is a pause of its own kind. The clock stops and the receiver is left listening, because a run that
stopped listening could never notice the runner starting again, which also means the standing about
is visible in the stored track and is what draws it on the graph afterwards. A pause asked for by
hand is never let go of by the app.

Only while the page is awake. With the screen off the service keeps the run and has no opinion about
this: a run in a pocket is timed the way it always was.

## Where it is stored

| What | Where | Travels |
| --- | --- | --- |
| The run: numbers, clock, workout snapshot, splits, block results, heart figures | `activity.measurements`, JSON | yes, with the activity |
| The fixes, and the beat measured at each of them | `run_point`, a row each | no |
| The programmes | `run_workout` | no, yet |

The fixes are rows rather than JSON on the activity because a run is thousands of them, written while
it happens and read once when it is looked at again.

Neither new table is in `OWNED_TABLES`, so neither is pushed. What a run came to travels on the
activity and is the same on every device; the raw trace stays on the phone that recorded it. Both
tables carry what they need to start travelling the day the server learns about them: `run_workout`
has the sync columns already. Adding them to sync is a Supabase migration plus an entry in
`src/lib/db/synced.ts`, see `doc/migration.md`.

## Reading it back

A finished run is read two ways, a tab apart. The kilometres are the answer to *how did it go*; the
graph is the answer to *why*, and the two are rarely the same question.

`src/lib/domain/run/series.ts` turns the stored track into one sample per counted fix: the clock, the
distance, the pace over the same window the live screen uses, the height above where the run started,
and the beat. The gates in `track.ts` run over it again, so the line and the total agree about what
the run was rather than being two readings of one track. The samples are thinned to the width of the
screen before anything is drawn, because a run is thousands of fixes and a path with more points than
pixels is cost with nothing drawn for it.

The three lines share the ground and nothing else: a pace in seconds, a climb in metres and a beat a
minute have no axis in common, so each keeps its own scale. Pace is drawn upside down, because a
smaller number is a faster runner. The ground is distance until it is tapped for time, which is the
difference between a hill and a red light.

Two of the three write their figures down an edge, in their own colour: the pace down the left and
the climb down the right, because that is the pair that is read together, and the heart takes
whichever edge is going spare. With all three drawn there is no edge left for the beat, and it is
read off the legend and off the finger instead, which is where a bpm is actually wanted. The edges
are HTML rather than text in the drawing, because the drawing is stretched to fit and stretched text
is unreadable.

Holding the graph reads it at a point: the figures appear above it rather than in a bubble under the
thumb that summoned them, a dot marks each line, and the route under it marks the same place. That
last part is why the graph reports where the finger is rather than keeping it to itself.

Both readings stay in the page, one of them hidden, rather than one being built and the other
thrown away. The map is the reason: unmounting it throws away its WebGL context, its style and every
tile it holds, and coming back builds all of it again, which is a second of grey and a flicker for a
tab nobody pressed meaning to rebuild anything. MapLibre watches its own container, so going away
and coming back costs it a resize and nothing else.

A kilometre is also the way into the graph: tapping one opens it at that moment, with the line
marked and the route marked with it. The table says which kilometre was slow and only the graph says
what happened in it.

The stretches where the run was held are ruled on the graph too. Nothing records a pause: what
records it is the gap between the two clocks, because every fix carries both when it was taken and
where the run's own clock was, and the run's clock is the one that stops. A pause takes no room on
either axis, since neither the clock nor the distance moved while it lasted, so it is drawn as a
place on the line rather than a stretch of it.

Under the kilometres, each one is a bar drawn against the run's own average rather than from zero.
From zero every kilometre of a run is nearly the same length and the one that hurt is invisible;
against the average it is the only one that is. The fastest says so.

## Where it went

`src/lib/domain/run/route.ts` projects the fixes and `RunRoute.svelte` draws them. Longitude is
squeezed by the cosine of the latitude, which is what stops a five kilometre loop coming out
stretched sideways, and the curvature over those few kilometres is smaller than the line is thick.
The route is fitted into its box keeping its shape, because a route is a picture of somewhere real
and one stretched to fill a box is a picture of somewhere else.

It can be painted by pace, green through amber to red against the run's own band, which is off
until it is asked for. Painting turns one line into a few hundred separately coloured stretches and
takes a moment the page does not pretend it did not: the button spins while it works, put on the
screen a whole frame before the work starts, because a spinner asked for in the same breath as the
work first appears in the same frame as the finished route. With a map it is the map that says when
it is done, at its next idle.

Off until it is asked for: a route is read for its shape first, and three colours over it make the shape
harder to see. The same drawing, without its dots and with a heavier line, is the shape beside each
run in the session it belongs to. Only on the device that recorded it, because the fixes never
leave that phone: somebody else's run in the feed has a shape nobody but them can draw.

There is no basemap under it unless one is asked for. The person reading it ran it, so the shape
alone is enough to recognise the loop, see which way round it went and find where it doubled back,
and drawn that way a finished run costs no network, owes no attribution and tells nobody where its
owner runs.

`RunMap.svelte` is the other half: the same line, the same colours, the same start, finish and
marker, drawn over OpenFreeMap's vector tiles by MapLibre. The whole component is behind a dynamic
import, so a run nobody wanted a map for downloads neither the renderer nor a tile.

It is pinched, dragged and double tapped as any map is, but only with two fingers, and with a
modifier on a wheel. A map that took a one fingered drag inside a page that scrolls is a trap for
the thumb: the page stops moving wherever the map happens to be under it. Two fingers is what every
map embedded in a page asks for. North stays up, because a run is read against the streets it was
run on, and a long press puts the whole run back on the screen after it has been pushed about.

Both the renderer and the tiles are off by default, and that is the only setting in the app whose
reason is not taste. Everything else a run records stays on the phone that recorded it, the fixes
included; a map is the one part that cannot, because asking for tiles is telling somebody else's
server roughly where somebody ran. So it is asked for rather than assumed:

* **Off**, which is where it starts. The run draws its own shape.
* **This run**, from the one line offer under a route, which forgets it on the way out: saying yes
  once is not saying yes from now on.
* **Always**, which is the setting, for anybody who has decided.

The offer can be hidden, and hiding it leaves the map control beside the route where it is: hiding a
question is not the same as taking away the answer. Both are settings, so both come back.

Attribution is drawn in a line of the app's own rather than in the library's box, which is two lines
tall on a phone and covers a third of a map this size. It is owed either way: the ground is
OpenStreetMap's work.

The route beside a run in a session list never fetches anything. A session of six runs would be six
maps' worth of requests for pictures nine millimetres across.

### The worker

MapLibre works out where its worker lives from where its own module lives, which is right while it
is served as the package and wrong the moment a bundler rewrites it. Bundled, the app asked for a
worker under its own hashed chunks, got a 404, and drew a grey box with tiles that never arrived and
no error to say why: the tiles are fetched by that worker, so a dead one is a map that looks like a
map and does nothing.

`scripts/sync-maplibre.sh` copies the worker and the shared half it imports into `static/`, and
`setWorkerUrl` names them, exactly as `sync-sqlite.sh` does for SQLite's own worker and for the same
reason. Both run before every build.

## In and out as GPX

`src/lib/domain/run/gpx.ts` is the format the rest of the world reads. It is domain code and scans
the text rather than parsing a document, because a DOM is a browser and this has to be testable
without one.

A run exports its track as it was stored. A run with nothing in it yet offers to read one in: the
file becomes `run_point` rows and the totals are worked out here through the same gates rather than
taken from the file, so an imported run and a recorded one add up the same way and the graph reads
one shape. What a GPX does not carry, this does not invent: there is no accuracy and no measured
speed in a file, so those are null and only the distance floor has anything to say about a point.

The heart rate rides in Garmin's `TrackPointExtension`, which is not part of GPX and is what
everybody implements, the watch this was written against included.

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

`RunView` is pages, a drag, a fling or a crown detent apart, with dots saying which one is up:

| Page | What it is for |
| --- | --- |
| Ready | before the start: what the programme asks for, and the button that begins it |
| Pace | am I too fast or too slow: the pace now, over a line of the last few minutes, with the target drawn across it |
| Block | the block being run: what is left of it, and the pace against its target |
| Run | the run's own totals: clock, distance, average pace |
| Next | the block coming, and at what pace |
| Heart | the beat off this wrist, and where it has been. Only where there is a sensor to read |
| Controls | pause, resume, finish, and whether to hold the screen awake. A swipe to the right away from the rest |

A run opens on the block, or on its own totals where there is no programme, because that is what it
is being run from; the pace page is one turn above it rather than in the way. The Next page uses
both halves of its figure row, one for what the block coming asks for and one for the pace it wants
held: a page that hides half its row reads as one that lost something. The pages come round:
off the bottom is back to the top, because there are five of them at most and they are turned with a
wet thumb mid run, so reaching one two behind is never a decision about which way is shorter.

The pace page's graph is the block's while there is a programme, and the whole run's when there is
not: a line that ran on through a recovery would say the runner had fallen apart.

Both graphs are drawn the same way. The two ends of what the line actually covered are ruled across
it, dotted and grey, with the figure each is worth written in white at the left: two rules rather
than an even scale, because what a runner wants off a graph this size is how far the worst of it
went, and a grid of round numbers can miss both ends of a narrow range. The pace target is a third
rule in green, the colour work already wears: the line to be on. The pace line itself is drawn a
segment at a time, green where it was holding that target and red where it was not, because when it
went is the question, and one colour answers only about this second. Those figures own the left of the
box and the line begins after them, because a line drawn through digits is neither.

Under the graph is the ground it covers, in three marks in the same white: how far back it starts,
the middle of it, and the right hand end, which is always now. Counted back from now rather than
given as the run's own clock, because what is being asked is how long ago something happened, and a
figure that has to be subtracted from another one first is a figure nobody reads mid run. Tapped to
swap between minutes and metres, as the pace figures are tapped to swap their unit. The scale starts
where the line does rather than at the edge of the box, or it would be a scale under nothing.

A page with a graph lays itself out differently. The graph wants the middle of the glass, which is
the widest part of a round screen and the only band a line is worth drawing across, so the pair of
figures gives up its room, the headline closes up and grows, and the grey line under it drops
towards the bottom edge where there was room nothing was using. Its height is a fifth of the glass
rather than a fixed measure: the figures above it are in sp and do not shrink with the watch, so a
graph that did not would push that line off the bottom of a smaller screen.

Neither graph comes from the phone. The frame says where the run is, never where it has been, and a
history on the wire would be a message the size of the run on a link the size of a sentence. So the
watch keeps its own last few minutes of each, which is all either graph is for.

### Following the finger

A drag moves the page under it from the moment it is plainly a drag, and brings the next one up
behind it from the edge it is coming from. Let go far enough in and the page turns; let go short of
that, or pull back the other way, and both go back where they were with nothing having happened.
What a drag does is decided when it ends rather than when it starts, which is what makes it safe to
try, and it is the gesture the watch has already taught its owner with the shade it pulls down over
everything else.

That is why `RunView` holds two panels rather than one column filled from whichever page is showing:
both pages are on the screen at once for as long as the drag lasts, and one column cannot be in two
states at the same time. An edge with nothing behind it gives a little and comes straight back,
because an edge that does not move at all reads as a screen that has stopped listening.

The controls follow the finger the same way, sideways, and always in the same direction whichever
way the drag went: out to the left and in from the right, because the mirror of that is how Wear
closes an app.

A turn of the crown lands on the neighbouring page through the same animation from a standing start.
It goes the way a list scrolls, the content moving against the finger rather than with it. A page
landing ticks, because turning one is the thing on this screen done without looking.

A grabber sits against the right edge while a run is on show. The controls are a swipe away and only
the controls page said so, which is no use to anybody who never found it; a bar rather than a sliver
of the page itself, because the sliver of a page whose background is black is black.

In ambient the graph stays up, in white. It is the one thing on the screen that does not have to be
live to be worth reading: what it says is where the last few minutes went, and that is as true
twenty seconds later as when it was drawn.

### The heart rate

The watch is the only thing in a run that touches the runner, so it is the only thing that can
measure a heart, and it is the one figure of a run that travels upwards. `Heart.java` registers
`TYPE_HEART_RATE` while a run is live and never between runs: a photoplethysmograph is a light held
against the skin, and a light left on is most of a watch's battery over an hour. It passes at most
one reading every few seconds, because a graph drawn from a beat a second is the same graph.

A full run frame is within a couple of bytes of what one write can carry, so the sender trims rather
than trusting a worst case somebody worked out once: `fitRun` drops from a list of what matters
least until the message fits, starting with what the *next* block asks for and never touching the
figures of the block being run. `RunFrames.java` does the same, in the same order, for the frames it
composes while the page is asleep.

`hr` is a message type of its own and is not held to the twenty bytes the buttons are. A button has
to work on a link that never negotiated an MTU, because a pause that only sometimes pauses is worse
than none; a beat lost is a few seconds missing from a graph, and a link that small carries no run
frames either, so there would be nothing on the wrist to measure against.

The phone is what records it. A beat is kept until a fix lands and is written on that fix, so the
heart rate is read back exactly where the runner was when it was measured, which is what the graph
draws and what a GPX wants. A sample older than twenty seconds is not written at all: the wrist is
out of range or the sensor has lost the skin, and a fix stamped with it would be claiming a reading
nobody took.

With the page frozen, `RunFrames` buffers the beats exactly as it composes the frames, and hands
them back through `claim` with the rest of what it did. They carry the moment each was taken, so the
page puts every one of them on the fix it belongs to rather than stamping a whole batch with the
newest. Buffered only while the page is quiet, because a sample kept twice is a sample averaged
twice.

`BODY_SENSORS` is asked for on the way into a run rather than on a settings screen nobody visits,
which is where the phone asks for its own. Refused, the run is a run without a heart rate, and the
page for it is not offered at all.

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
