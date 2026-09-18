# Wear OS link over the native app, not the browser

Built 2026-09-18, from the reasoning written down here the same day. The browser transport was
already finished; this is the other half, and both are live behind one `support()` call.

## Why it is worth doing

The one risk from the original design that never cleared: **Chrome on Android has no
`navigator.bluetooth.getDevices()`**, so a permitted watch cannot be picked up again without the
chooser. Every connection costs the archer a tap, and a link that drops mid round costs another one
at the shooting line.

A native central has no such limit. It connects straight to a remembered address, so the installed
app would reconnect silently and the archer would never see a chooser again. That is the whole
point; nothing else about the feature changes.

## How it was built

`@capacitor-community/bluetooth-le`, which supplies the central role: its own chooser dialog,
connect by device id, subscribe to notifications, write a characteristic. That is the entire surface
used.

`src/lib/watch/ble.native.ts` is the sibling of `ble.web.ts` and the same shape. Nothing in
`link.ts`, `apply.ts`, `protocol.ts` or `mirror.ts` was touched, as expected. What did change:

- `ble.ts` now holds `Connection`, `ConnectFailure` and `ConnectResult`, which both transports share
  rather than each declaring its own. `Connection` gained an `id`: what the native path remembers.
- `support()` answers `native` in the installed Android app whatever the webview thinks of
  `navigator.bluetooth`, and `no-wear` on an iPhone. `canReconnectSilently()` is true on native,
  which is the whole point, so the card stops warning that the link will not come back.
- `store.ts` picks the transport, imports the native one lazily so the browser bundle does not carry
  it, and remembers the watch in `rememberedWatch` (localStorage, via `prefs.ts`: an address means
  nothing on another phone, so it must not sync).
- `resumeWatch()` runs once from `+layout.svelte` when the database is open. Silent: no chooser, no
  permission prompt, and a failure leaves the card idle rather than telling somebody off for not
  wearing a watch they never asked about.

The UUIDs are in `src/lib/watch/ble.ts` and must match the watch's `Link.java`.

Tests are `ble.native.test.ts` against a mocked plugin, `ble.test.ts` for the platform answers, and
`reconnect.test.ts` for the backoff and what it refuses to do in a browser. The plugin calls
themselves are not tested, only every decision made around them. `reconnect.test.ts` mocks `$lib/prefs`
rather than importing it: the real one applies half a dozen display settings to `document` as it
loads, and vitest runs in node.

## The watch's own face

`StatusView` is what the watch shows whenever the phone has nothing to mirror, which is most of the
time the app is open. It carries the app's mark — the three rings of `static/icon-maskable.svg`,
drawn rather than shipped so they can dim when the phone is not there — the name, and the link state
as a chip: a dot coloured before any of the words are read. The palette is `src/app.css`'s dark one,
not the WA face colours, which belong to scores.

`Link.Listener.onLinkState` takes a kind (`WAITING`, `LINKED`, `FAULT`) rather than a boolean, so the
screen colours a state instead of matching on the text of a note. The notes are sentences now,
because they are read on the wrist by an archer rather than in a log.

The launcher icon is an adaptive icon in `android/wear/src/main/res`, vector, from the same geometry
as the phone's maskable icon and scaled into the 72dp of 108dp a mask is guaranteed to leave alone.
A watch always crops to a circle, which is why the centred mark is the right one to start from.

## Three ways messages went missing

Found in one pass after the link was working but unreliable: taps on the wrist that the phone
sometimes ignored, and an undo on the phone that never reached the watch. None of them is in the
transport file; two are older than it.

**The watch may have one notification on the air at a time.** `notifyCharacteristicChanged` is
refused while a previous one is unconfirmed, and the characteristic holds a single value, so the next
`setValue` has already overwritten what was refused. `Link.java` sent in a loop with no
`onNotificationSent` override, which delivers the first of a burst and drops the rest: an isolated
tap usually arrived, a tap next to anything else usually did not. There is now an `outbox` and a
`pump`, one message at a time, with a two second guard so a lost callback cannot wedge the link.
Nothing is held for a phone that is not subscribed — `pending` carries everything durable and
`flush` says it again, and a tap held across a reconnection would open an activity out of nowhere.

**`pushAll` skipped every empty end**, which is right for a watch that has never heard of one and
wrong for one that has: an end undone on the phone was simply never mentioned, so the arrows stayed
on the wrist. `WatchLink` now remembers which ends it has told the watch hold arrows, and sends the
empty for exactly those. Cleared when the round changes, because another activity's watch state is
not this one's to correct.

**`connectWatch` tore down the pages' handlers.** It called `disconnectWatch` before reconnecting,
which nulls `onOpen`, `onArrows`, `onApplied`, `onBack` and `onLinked` — but a page registers those
when it mounts and will not do it again. After "Try again" the watch's taps reached a phone that had
stopped listening, with nothing on either screen to say so. Dropping the link and forgetting the
watch are now separate: `dropLink` for the first, `disconnectWatch` for the archer actually leaving.
What a page asked to be told about belongs to the page.

The general shape of all three: a message that goes missing looks identical to one that was never
sent, and this protocol acknowledges ends but not control messages, so nothing notices. Worth
remembering before adding a fourth.

## What to be careful about

**Back on the watch needs the gesture API, not `onBackPressed`.** The wear module targets SDK 36,
and an app targeting Android 16 is never told about back the old way: `onBackPressed` is not called
and the key event is not dispatched. The handler was there and dead, so back closed the app instead
of asking the phone to move. `KeypadActivity.listenForBack` registers an `OnBackInvokedCallback` on
API 33+, with `onBackPressed` kept for Wear OS 3. Registering it means the system stops closing the
activity, so leaving is now the app's own job when there is nothing behind.

The phone side of back was already right and unchanged: an activity goes back to its session, a
session to the list of them, which leaves the watch with nothing to mirror and so on the status
screen.

**The watch's foreground service must be an ongoing activity, not a notification.** The service
exists because a process Android has stopped is one it may kill, taking the GATT server with it. But
it buzzed the wrist on every app start, and the channel is not the lever it looks like.

Measured on a TicWatch Pro 5, not reasoned about, after two failed attempts at the channel:

- The channel settings do apply (`mSound=null`, `mVibrationEnabled=false`) and do not help.
- Android raises a foreground service's channel to `IMPORTANCE_LOW` whatever is asked for
  (`mImportance=2, mOriginalImp=1`), so `IMPORTANCE_MIN` is a floor, not a guarantee.
- The notification service reports `isNoisy=false`: it was never the thing vibrating.
- Revoking `POST_NOTIFICATIONS` silenced it while the service kept running — `numEnqueuedByApp` rose
  and `numPostedByApp` did not. That is what pinned it on the post itself.

So the buzz is Wear's stream reacting to a notification *arriving*, and one arrives on every start
because the activity releases the service in `onDestroy`. `androidx.wear:wear-ongoing` is the
supported answer: the same service shown as a chip on the watch face rather than as news. Confirmed
by `android.wearable.ongoingactivities.EXTENSIONS` in the posted record, and by the wrist.

`NotificationCompat` comes with it, which is also where `setSilent` lives — the framework builder has
no such method, and reaching for it is a compile error worth remembering.

Useful commands, since none of this is visible from the source:

    adb -s <watch> shell dumpsys notification --noredact | grep -A60 pkg=com.appchery.watch
    adb -s <watch> shell dumpsys vibrator_manager          # who vibrated, with uid and reason
    adb -s <watch> shell dumpsys activity services com.appchery.watch

A watch that is dozing or locked posts nothing, so a test against one proves nothing either.

**iOS gets nothing, still.** Wear OS has not paired to an iPhone since Wear OS 3, so this is Android
only however it is built. `support()` returns `no-wear` there and the transport refuses before it
touches the plugin. The plugin is still linked into the iOS build, though, so if that build is ever
submitted it will want an `NSBluetoothAlwaysUsageDescription` in `Info.plist` — which has no camera
or location description either, so it is not submittable as it stands.
