# The watch ⇄ phone model

Written 2026-09-29, after a run finished from the watch stayed running on the phone for another five
minutes and had lost its heart rate since halfway. The model is the rule every message between the
two follows, so each feature gets the same guarantees and a new one knows what it has to do. Checked
by the unit tests and against the database of that run (Galaxy S25+, SM-S936B, and the TicWatch);
**not yet run on the devices**. The wire format itself is in `src/lib/watch/protocol.ts`; the
transport in [watch-native-transport.md](watch-native-transport.md); the link's history in
[watch-link.md](watch-link.md).

## The rule

**The phone's native side owns the link, and handles everything the watch sends the moment it
arrives, whatever the page is doing, for as long as the app's process is alive.** The page is where
things are shown and written down. It catches up from the native side whenever it runs, by one path
per kind of message. Nothing the watch sends waits on the page being awake, and nothing the page
does to recover the link destroys what the native side holds.

The page cannot be relied on because Android freezes it: with the screen off, which is how a run or
a session is actually shot, the webview runs no timers and processes no events until the phone is
picked up. Anything that needed the page was lost, or worse, applied late with the wrong time.

## Four kinds, one way in for each

Every message from the watch is exactly one of these. `Wrist.deliver` routes by kind, in one place.

| Kind | Means | Watch | Phone, native | Page |
|---|---|---|---|---|
| **Assertion** | this is now true | kept in `pending`, newest per subject, until acked; sent again on every subscription | filed by `WristInbox` before anything else | applies it (idempotent: a total, or an end by position, with last write wins), acks; the ack clears both copies |
| **Control** | do this now | stamped with the press (`at`), kept in `controls` until acked with `ck`; sent again on every subscription and on each run frame | `RunFrames.control` acts at once, dated by the press, acks, and keeps the result | adopts what was done (`adopt`); never acts on a watch control itself in the app |
| **Telemetry** | a measurement | sent as measured | buffered with the moment it came (`RunFrames.heard`, `WristMotion`) | drains it (`takeBeats` each tick, `claim` on a thaw, `importWristMotion`) |
| **Navigation** | take me there | sent once | passed to the page | acted on by a page on screen; a frozen page cannot navigate, so it is not replayed |

And from the phone to the watch:

* **Descriptions** (hello, session, activities, round, ends, screen, run frames, `mr`, `ms`, `al`): the
  newest per subject is kept natively by `Wrist.remember` and said again on every subscription the
  native side makes by itself, so a watch app that restarts with the phone in a pocket is told
  everything. Run frames come from the page while it is awake and from `RunFrames` while it is not.
* **Acks** (`ack` for an end, the `arrows` echo, `mk` for a recording, `ck` for a control): what lets
  the watch forget its copy. Never replayed.

### The messages

| `t` | From | Kind | Kept on the watch until | Handled on the phone by |
|---|---|---|---|---|
| `end` | watch | assertion | `ack` | `WristInbox` → `WatchLink.onEnd` |
| `arrows` | watch | assertion | the phone's `arrows` echo | `WristInbox` → session page |
| `rg` `rh` `ru` `re` `rl` | watch | control | `ck` (stamped only) | `RunFrames.control` → `LiveRun.adopt` |
| `hr` | watch | telemetry | never kept | `RunFrames.heard` → `takeBeats` |
| `mh` `mc` | watch | telemetry | `mk` | `WristMotion` → `importWristMotion` |
| `open` `back` | watch | navigation | never kept | the page on screen |
| `hello` | both | link | — | answered; its clock gives the offset, `k` what the phone can do |
| `bye` | phone | link | — | sent only when the archer disconnects the watch |

## What the archer gets, by the state of the phone

With the phone on and the app's process alive:

| The phone is | Watch controls (run) | Scoring an end, counting training arrows | Heart rate | Opening an activity from the watch |
|---|---|---|---|---|
| on the page concerned, screen on | at once | at once | at once | yes |
| on another screen | at once, adopted by the run's page in the background | kept, applied when that page is next shown | buffered | yes |
| screen off, page frozen | at once; the phone shows it when picked up | kept, applied on waking | buffered, each at its time | no, nothing is on screen to open |
| page thrown away by Android, process kept | at once; a finish is stored as the app opens | kept | buffered | no |
| process killed (a force stop) | a press is kept on the watch and taken once the run's page describes the run again, dated no earlier than that; a finish made before the kill is kept and stored | kept on the watch and natively, applied once the app runs | lost | no |

In a browser there is no native side: the page is everything, a tab put to sleep hears nothing, and
the page says so. It still acks and de-duplicates stamped controls, so a new watch works with it.

## The invariants

1. **Recovering the link never destroys state.** `WristPlugin.disconnect` lets go of the link and
   nothing else; the run is cleared by `forget`, when the page says the run is over. `bye` is sent
   only by `disconnectWatch`. A reconnect is just a reconnect.
2. **A page that was asleep is not a watch that is gone.** A liveness timer that fires far later than
   it was set for asks again rather than calling the link stale (`WatchLink.ping`).
3. **A stale description never undoes a native change.** Every change `RunFrames` makes bumps `rev`;
   the page carries the revision it last adopted in each plan, and an older plan is refused.
4. **A press is dated where it was made.** A control stamped by the watch is applied as of the press,
   on the phone's clock through the offset from the watch's hello, never before the run last changed
   nor after now. Sent again after a link blip, a finish still ends the run where it was pressed.
5. **Process protection is released only once the page has taken what it holds.** A finish from the
   wrist holds the service (`TraceService.done`: no GPS, a notification saying to open the app) until
   the page stores the run and ends it. The finish is also written down, so a killed process does not
   turn it back into a run still going.
6. **Anything the wrist can start is started from a service already running.** Android (12 and later,
   the app targets 36) refuses to start a foreground service from the background, and a Start pressed
   on the wrist with the phone in a pocket would have thrown on the Bluetooth thread and taken the app
   down. So a run on its start screen with a watch linked has the service up already, held with no
   GPS (`TraceService.READY`, "Ready to run"), started by `RunFrames.plan` while the page describing it
   is on screen. Without it (no watch linked when the page was shown, no location permission yet) a
   start from the wrist is not taken, the watch keeps it, and it is taken once the phone is awake.
8. **An assertion is applied only where it was made.** An end names only its stage and end, a count
   only a total, so each kept assertion carries its scope: the round's activity for an end, the
   session's label for the count, read from what the phone last described (`Wrist.scope`). The page
   takes only the entries of what it has open (`belongsHere`); the rest wait. On the watch, the
   pending ends of a round left are parked under it and sent again when it is shown, rather than
   thrown away, and the training count is never dropped with a round.
9. **An ack clears only what it covers.** It names the assertion's time, and a newer correction kept
   since stays until its own ack.
10. **The newest change wins, measured where it was made.** A training total from the watch older
    than the last change made on the phone is refused and answered with the phone's figure, so the
    watch drops its copy. Compared with the phone's own edits, never with the activity's update
    time, which moves when a total from the watch is applied as well.
11. **A page looking at another activity is a bystander.** With a run of another activity live
    natively, a run page opened (a past run, looked at mid run) takes no buttons, describes nothing
    to the watch, starts nothing and stops no service; natively, a plan or a forget for another
    activity is refused while a run is live.
12. **Nothing is lost for lack of room, and nothing waits for a disconnection to be sent again.** The
    phone's outbox sheds run frames older than the newest before anything else, so a long replay
    keeps its hello and its session; a replay ends on the run's real state, finished or waiting to
    start included; the watch sends everything not yet acked again on every hello.
13. **Whatever the watch holds is held per round or per session, and shown per round.** The keypad
    is emptied when the activity changes, not only when the round's shape does: two rounds of the
    same shape kept the first one's arrows, which the phone never overwrote since it sends only the
    ends it holds. A training count waiting for its ack is parked under its session when another is
    shown, instead of being shown and sent on as the new session's, and an end of the watch's own
    still waiting is drawn from its pending copy.
14. **One run at a time, refused out loud.** A start on the phone while another activity's run is live
    natively shows a warning that stays until dismissed (`LiveRun.otherRun`), and is checked at the
    start rather than when the page opened, since the other run may have ended since. The watch cannot
    start a second run: it only offers Start on a run the phone described as waiting, and a page
    looking at another activity describes nothing (invariant 11).
15. **What the page decides alone, the native side can undo alone.** The page's automatic hold is
    judged only while it is awake, so it is handed down as such (`ah`) and the native side lets it go
    on the first fix that moves: held at a crossing with the screen on and run on with the phone in a
    pocket, the clock stayed stopped.
16. **Written down only what a new process can use.** Run frames are held for replay but never stored:
    one every two seconds rewrote the whole description, and one read back is a run as it was.
17. **Each message is taken once.** Assertions are idempotent; controls are named by their stamp and
   the same stamp is one press, remembered only once taken, so a press the phone could not act on yet
   is sent again rather than refused as a repeat; telemetry is drained, never read twice.

## Adding a message

Decide its kind first; everything else follows from that.

* **Assertion:** make it idempotent (a whole figure, or a keyed state with a time), give it a key in
  `WristInbox.keyOf` and list it in `WristInbox.durable`, keep it in the watch's `pending`, and ack it
  from the page once applied, clearing it in `Wrist.remember`.
* **Control:** give it a type in `RunFrames.isControl` and a case in `RunFrames.control` that works
  from native state alone, adopt its result in `LiveRun.adopt`, and let the watch stamp it.
* **Telemetry:** buffer it natively with its time and give the page a drain.
* **Navigation:** pass it to the page, and accept that a frozen phone does not act on it.

Mind the twenty byte fallback: a watch app restarted under a link that kept its MTU cannot notify more
than twenty bytes until the phone writes something long. A control stamp does not fit it, so the
watch sends a stamped control only with `payload` of 40 or more and the bare form otherwise, which
is sent once as controls always were.

## What was wrong before this, and how it showed

Established from the phone's database, since no log survives two days; the timings are from
`change_log` (when the page wrote, so when it was awake) and `run_point` (GPS and heart rate).

On the 27th the page was awake for the first minute of a 31 km run and then frozen. At 20:40:25 it
thawed for about a second, a glance at the phone or a notification. Its liveness timer had been
frozen mid ping and fired before the queued answer was read, so the link was called stale and
"recovered": `bye` went to the watch, and `Wrist.disconnect` cleared `RunFrames`. The page froze again
before describing the run once more. From then on no frame reached the watch and every beat was
dropped (heart rate: none after 20:40:26), while GPS went on. At about 22:09 the finish pressed on
the watch found no run natively, went to the frozen page and waited there; the phone was picked up at
22:14:53 and the queued stop ran at 22:14:56, which is where the run ended. The 23rd shows the same
signature (wakes at 12:33 and 12:34, heart rate gone from 12:35); the 25th survived a mid run wake,
because it is a race.

Everything else fixed with it, all found by reading the code rather than seen in that run: a start
or a lap from the watch was never acted on natively; a finish there stopped the service, the only
thing keeping the process and its unsaved fixes alive; the service's clock kept running after a
finish, so a late adopt made the run longer; `open()` resumed a running record without asking the
native side, and its first plan undid a finish; controls were fire and forget; a paused service that
Android restarted came back listening to GPS; a page frozen for more than an hour trimmed the oldest
beats before writing them; and adopts set off together by a thaw could stop a run twice. Taking a
start natively also brought out the rule in invariant 6: done naively it would have crashed the app.

A review of the whole link on 2026-09-30 found nine more, two of them brought in by the inbox itself
(invariants 8 and 9: kept ends went onto whichever round opened next, and an ack could clear a newer
correction), and the rest older: a late total undid a phone edit, a past run looked at mid run
stopped the live run's GPS and took it off the wrist, a replay could put a finished run back on the
watch or lose its own hello to a full queue, and the watch threw away unsent ends and the count on
every change of round.

A second review the same day found eight more, one of them in the inbox wiring again (the drain on
waking sat behind a return for when no recording was waiting, so it hardly ever ran), and the rest
older: the keypad and the count of invariant 13; on the watch, a press made while the link was down
still went bare, since the payload is reset to twenty bytes by the disconnection, and the set of
subscribers and the pending map were changed on Bluetooth threads while the main thread iterated them;
one recording that could not be stored held every later one back; the automatic hold of invariant 15;
and the run frames of invariant 16. An inbox entry never placed is dropped after seven days.

Not covered, and not claimed: a run page opened on another activity while one is running natively
still describes its own run to the wrist, since two runs at once is not something the app supports;
and a page ticking in the instant between a pause from the wrist and its adopt can send the wrist a
running frame first, which the adopt corrects within a second.
