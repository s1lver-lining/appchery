# Wear OS companion: what was measured

Verified 2026-09-17 on a TicWatch Pro 5 (Wear OS, Android 13, API 33) paired to a Galaxy S25+
(SM_S936B, Android 16). Everything below is from a working probe, not from documentation.

## The decision

A Wear OS companion is a from scratch Kotlin app. Capacitor does not reach the watch: WebView on
Wear OS is discouraged and a webview only Wear app does not pass review. Nothing in `src/lib/ui`
is reusable.

**Transport is BLE, with the watch as the peripheral.** One GATT server on the watch serves both
targets: Web Bluetooth for the browser build, `@capacitor-community/bluetooth-le` for the native
build. The Wearable Data Layer stays a later option, not a prerequisite.

The Data Layer is closed to the browser build permanently: it delivers only to an app whose package
name and signing key match on both ends, through Play Services, which a web page cannot reach. The
reason to keep it in reserve is background reliability on the native build, and the measurements
below say that is not currently needed.

**The watch stays a dumb input surface.** It sends `{stageIndex, endNo, ordinal, zoneLabel}` and the
phone derives the value and the subtotal through the existing engine. Round definitions are already
data rather than code, so the descriptor the watch needs (arrows per end, ends, stages, zone labels)
serialises out of `domain/rounds` for free. This is the single biggest reason the job is small, and
it keeps the scoring rules in one language and one test suite.

Standalone watch scoring was deliberately left out: it would mean SQLite on the watch, the scoring
engine ported to Kotlin, and a merge into the change log. Queue raw inputs on the watch instead and
flush on reconnect. Inputs are addressed by stage, end and ordinal, so replay is idempotent.

## The protocol has to carry more than shots

Decided 2026-09-17, before any of it is built, because the shape is hard to change later.

**Two generic pipes, not semantic ones.** One notify characteristic for watch to phone, one write
characteristic for phone to watch, both carrying versioned typed envelopes (`{v, type, ...}`).
Scoring is watch driven input with occasional totals coming back. Running activities are the
inverse: the phone pushes pace, distance and elapsed time about once a second, and pushes a step
change carrying the new target pace and how long to hold it. A "shot" characteristic and a "total"
characteristic would fit scoring and nothing else, so activities are message types instead, and a
new activity is a new type rather than a new service. Running activities are not ready for any of
this yet, but the envelope has to anticipate them.

**Version the envelope from the first message.** The watch app ships through Play independently of
the phone app, so a new watch against an old phone is certain rather than hypothetical. A version
field and a clear "update the other half" state cost nothing now.

**Budget about 180 bytes per message.** Default BLE MTU is 23, giving a 20 byte payload. Chrome
negotiates larger automatically, typically around 185 on Android, and Web Bluetooth exposes no
control over it, so it cannot be requested and cannot be relied on. High frequency messages, meaning
the running metrics, need short keys or a compact binary encoding. The once per activity round
descriptor can afford roomy JSON.

## Decisions taken on the feature itself

**Rounds first.** Matches are scored end by end on set points, so the keypad and the scoresheet are
different screens. Later.

**The crown belongs to the scoresheet.** Scrolling up reveals the grid, which is the natural gesture
on a watch with a rotating crown. That rules the crown out for picking values, so score entry is tap
based.

**When the phone is unreachable the watch queues raw inputs and says so.** It does not refuse input
and it does not try to score anything itself. Inputs are addressed by stage, end and ordinal, so the
flush on reconnect is idempotent. Same posture as `doc/sync.md` takes for offline.

**Reconnect differs by platform, and only the web suffers.** Native centrals connect to a remembered
address with no picker, which `@capacitor-community/bluetooth-le` exposes, so the installed app
reconnects silently. The browser cannot, because `getDevices()` is missing. The app is a SPA, so
client side navigation does not break the link: it is one tap per visit, not per screen, and
connecting at activity start rather than app start puts that tap where the archer is already
setting up.

## The keypad

Twelve values on a 466 by 466 screen at 320 dpi, where 1 dp is exactly 2 px. A uniform three by four
grid does not work: the outer cells of the top and bottom rows have their centres outside the
visible circle. **Two, four, four, two does**, with each row as wide as the chord at its inner edge.
That gives 100 by 58 dp on the outer rows and 57 by 58 dp on the middle ones, all clear of Wear's
48 dp minimum, everything on one screen with no second layer, and descending reading order intact.
The two most used values get the biggest keys as a side effect.

A Wear calculator runs about twenty keys in a grid and is usable, which is the precedent that says
twelve is conservative. It gets away with it using four narrow columns rather than three wide ones,
which is the same conclusion arrived at from the geometry.

## What the radio does

| Question | Answer |
|---|---|
| Peripheral role claimed (`isMultipleAdvertisementSupported`) | true |
| Peripheral role actually working (`onStartSuccess`) | yes, the claim and the radio agreed |
| Watch to phone notifications | work |
| Phone to watch writes | work |
| Connect to subscribed | 0.3s to 1.4s across runs |

Stability, shots every 3 seconds, 164 of them over about 9 minutes: **zero drops and zero refusals**
in every condition tested. Watch screen off, Chrome backgrounded, phone screen off, both devices
continuously dozing for 150 seconds with nobody touching them, and the phone locked with
`isKeyguardShowing=true`. The link survived all of it, including all of it at once.

Ask the adapter what it claims and the radio what it did, and keep the two apart. They agreed here,
they do not always, and the vendor claim is the one that lies. Same reasoning as `selfTest` in
`src/lib/haptics.ts`.

## Limits that shape the feature

**Firefox has no Web Bluetooth, on any platform**, by choice rather than by backlog. It was the
default browser on the test phone, which is how this was found. The web transport reaches Chromium
browsers only: Chrome and Edge yes, Firefox and Safari no. The settings screen has to degrade
honestly for everyone else, the way the iOS haptics path already does.

**`navigator.bluetooth.getDevices()` is absent in Chrome on Android**, so there is no silent
reconnect: every connection costs a chooser tap, and a permitted device cannot be picked up again
without one. Connect once when the activity starts. A dropped link in the middle of a round costs
the archer a tap and a pick from a list. This is the strongest remaining argument for the Data Layer
on the native build, where reconnect needs no gesture at all.

**One GATT connection per device, across the whole browser.** A second tab cannot connect to a watch
another tab still holds, and connecting from the new tab failed until the old one was closed and the
page reloaded. A stale tab is therefore enough to lock the archer out of their own watch, and the
error says nothing about why. Worth handling explicitly in the UI rather than leaving as a mystery.

**iOS gets nothing, permanently.** No Web Bluetooth in Safari, and Wear OS has not paired to iPhone
since Wear OS 3.

**A LAN address is not a secure context**, so `navigator.bluetooth` is undefined under
`scripts/dev.sh`, which serves over plain http on the LAN. Testing the web transport needs real
HTTPS or the `adb reverse` route below.

## Gotchas already paid for

**The CCCD descriptor.** `startNotifications()` writes descriptor `0x2902`, and
`BluetoothGattServer` does not add it for you. Without it the connection succeeds, the subscribe
appears to succeed, and no notification is ever delivered.

**Advertisement overflow.** A 128 bit service UUID takes 18 of the 31 advertised bytes, so the
device name belongs in the scan response. Both in the main packet fails with
`ADVERTISE_FAILED_DATA_TOO_LARGE`.

**Gradle needs JDK 21.** The machine default is JDK 25 and Gradle 8.14.3 rejects it with
"Unsupported class file major version 69". Build with
`JAVA_HOME=/usr/lib/jvm/java-21-openjdk ./gradlew :wear:assembleDebug`.

**`notifyCharacteristicChanged` is deprecated** in favour of the API 33 signature that takes the
payload directly. The old form still works and is what the probe uses, hence the build note.

## Reproducing the rig

The probe lives in `android/wear` as a `:wear` module, registered in `android/settings.gradle`. It is
throwaway: zero dependencies, no androidx, no Compose, framework APIs only, so it builds from cache.
Package is `com.appchery.probe` rather than `com.appchery.app`, deliberately, so nothing about it
touches the real app's identity or signing key.

Wireless debugging on the watch: `adb pair <ip>:<pairing port> <code>`, then connect on a
**different** port, the one shown on the Wireless debugging screen. This `adb` has no mDNS, so
`nmap -p 30000-50000 --open <ip>` finds it: the pairing port and the connect port both show up.

The phone needs a secure context without a certificate, so serve the page on the host and tunnel it:
`adb reverse tcp:8000 tcp:8000`, then open `http://localhost:8000` on the phone, which counts as
secure. Pin the browser with `-p com.android.chrome` on the `am start`, or the intent goes to the
default browser, which was Firefox and has no Web Bluetooth.

The watch logs under tag `AppcheryProbe`, and the page mirrors every line back to the host with
`POST /log`, because neither screen can be read from where the test is driven. Both sides in one
place is what made the failures legible.

## A locked phone still processes each shot as it lands

The question worth asking was whether a backgrounded tab queues notifications and delivers a burst
on return, which would rule out anything reacting live. It does not. With the phone locked
(`isKeyguardShowing=true`) and dozing, and Chrome in the background, the page handled every shot at
the moment it arrived, with inter arrival gaps of 2996ms to 3064ms against a 3000ms send cadence.
Nothing was batched, nothing was dropped, and the tab was never frozen or discarded: its `fetch` to
the host kept working throughout, so the JavaScript was genuinely running, not merely resumed later.

The two clocks are independent, so the apparent few milliseconds between the watch sending and the
host recording is coincidence rather than a measured latency. The claim that holds is the one the
gaps support: delivery is live and paced, not queued.

## The two halves have talked

Verified 2026-09-17: the app's own settings card connects to the watch app and the watch's GATT
server reports the subscribe, 350ms after the connection. The same link from the throwaway probe
page took 1318ms, so nothing about the app's path is slow.

**MTU came back at 517 on this pairing**, which is 514 usable bytes against a budget of 180. The
budget stays at 180 regardless: that figure is what this Chrome and this watch negotiated, not
something a protocol may assume, and the tests that enforce it stay as they are.

## Restarting the watch app strands a connected phone

The trap that cost most of an afternoon, and it will happen to users rather than only to developers.

Re-registering the GATT service gives it new handles. A phone already connected still holds the old
ones, so the subscribe is written to a handle that no longer exists: it fails silently, the watch
never sees a subscriber, and the phone's card still says connected. Neither side notices, and
nothing in the link is wrong enough to raise an error. Updating the watch app through Play does
exactly this to anybody who happens to be connected at the time.

**So the link needs a liveness check rather than trusting the transport.** On connecting, the phone
says `hello` and expects the watch's `hello` back within a second or two. Silence means the link is
dead however healthy it looks, and the card has to say so and offer to connect again. A GATT
connection being up is not evidence that anybody is listening on it.

Worth remembering while debugging this: the fault looked exactly like a bug in the phone's code, and
was not. What settled it was running the probe page, which mirrors its own log to the host, against
the same watch: it linked, which proved the watch and the radio were fine and the difference lay in
how the test had been set up. Instrument both ends before reasoning about either.

## The service worker serves the phone a build that is not the one being tested

Worth an hour of anybody's time, twice over. `src/service-worker.ts` exists, so SvelteKit registers
it in development as well, and the phone then runs a cached bundle while the dev server happily
serves the fixed one. Every phone side fix appeared to do nothing, the evidence pointed at the
freshly written code, and the code had never run.

What proved it was tracing that produced not one line. A fix that changes nothing is worth
suspecting of never having executed before it is worth debugging. The gentle remedy is the Refresh
button the app already has in its settings, which drops every cache and reloads; clearing the
browser's data works too and takes the archer's tabs and site permissions with it.

The same thing will happen to users after a deploy, which is what that button is for.

## Two orderings that are not the same ordering

A score set runs **outermost to innermost**, `M, 1, 2 ... 10, X`, so hit testing can walk it
backwards and take the first match. A keypad reads **downwards from the highest**. Handing the score
set to the watch as it stands puts the miss where a thumb reaches for an X, which is how the keypad
came out upside down. The phone now reverses it on the wire and sends the keys in the order they are
meant to be drawn, so the watch lays out what it is given rather than having opinions about faces.

## An assertion nothing answers is an assertion sent for ever

The training arrow count travels inside the session message, because that is a description of the
session. It is not an answer, so the watch's own copy stayed pending, and a queue flush sends
everything pending: the count rode along with every single end after it, indefinitely. The phone now
sends the figure back on its own once it has been written, which is what lets the watch forget it.

The general rule this is an instance of: whatever a peer holds until acknowledged needs something
that acknowledges it, and a message that merely happens to contain the same number is not that.

## Still open

Range with a body between the watch and a phone in a pocket, and the battery cost of advertising
across a full session. Neither was measured.

## Getting the wrist back after a restart

**Restarting the watch app leaves the phone writing into nothing.** The watch registers its service
afresh while the phone keeps handles into the old one, and every write appears to succeed. The
heartbeat catches it as stale, and the installed app then drops the link and reconnects to the
remembered watch. The new link is greeted, and the greeting is what makes the open page describe
itself again, so a paused run or one being prepared reaches the wrist without anything on the phone
changing. Only a link that answered once is reopened: one that never has is a watch app that is not
listening, and reconnecting every heartbeat would change nothing.

**A restarted watch app starts blind under a link that stayed up.** Measured 2026-09-25: the
watch app's activity is recreated while the process and the connection survive, so the new server
never sees the subscribe, and every button went to nobody while the phone's writes still arrived.
The phone's own client still has notifications on the same handles (the stack reads the database
hash and keeps its cache), so the watch takes any phone that writes to it as a subscriber. The phone
hears `onServiceChanged` at the same moment. The stack drops the phone's notification registration
with the old service, so from then on everything the watch says reaches the phone's radio and is
thrown away before the app: the run displays and no button works. The phone therefore discovers and
subscribes again, and only then says hello, which hands the restarted watch the run.

The same logic covers a phone app restart, whose old connection's disconnect can reach the watch
after the new subscribe and remove the device that just arrived. A `bye` releases the phone, so the
next write takes it back and says linked again.

**With the phone screen off, the native side brings the wrist back on its own.** The page is frozen
then, and every reconnect above lives in the page. So `Wrist` reconnects by itself when the link
drops while `RunFrames` holds a live run, going or paused, using auto connect because it waits for
the watch as long as it takes and costs nothing meanwhile. Once subscribed again it writes the
run's current frame, which the watch takes as linked and as its run screen. The page, when it wakes,
reconnects in its own way and the native link simply gives way to it.
