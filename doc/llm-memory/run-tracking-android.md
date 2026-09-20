# Tracking a run on Android

Decided 2026-09-18, while building the tracked run. Compiled against compileSdk 36 and the manifest
merged clean; **not yet run on a device**, so the battery and accuracy figures below are expectations
rather than measurements, and the first device run should replace this paragraph with what it saw.

## Why the app carries its own foreground service

`@capacitor-community/background-geolocation` is the obvious answer and was rejected. Its published
peer range stops at `@capacitor/core >= 3` with no Capacitor 8 release, and it pulls in Play Services
for fused location, which this app has never depended on. The service in
`android/app/src/main/java/com/appchery/app/TraceService.java` is about 150 lines, uses
`LocationManager` directly, and is a sibling of the Wear `LinkService` already in the tree.

`LocationManager.GPS_PROVIDER` at 1 s with no minimum distance is the right ask: the accuracy,
movement and speed gates live in `src/lib/domain/run/track.ts` where they are testable, and a
platform side distance filter would hide a runner standing at a crossing from the pace on screen.

## Why fixes are pulled rather than pushed

A backgrounded webview has its timers and its event loop frozen, so a Capacitor event fired while the
phone is in a pocket reaches nobody. The service buffers fixes with a sequence number and the page
drains by sequence, which makes a page that has been away twenty minutes and a page that is on screen
the same call. This is the same shape as the watch link's `drain`, and for the same reason.

## Why no ACCESS_BACKGROUND_LOCATION

The service is started while the app is on screen, which is when a run is started, and a foreground
service with `foregroundServiceType="location"` keeps receiving fixes from there without the
background permission. Asking for it would put the app in front of a Play Store review for something
it does not need.

## Why the app owns the BLE central

Measured on a Samsung S25 and a TicWatch Pro 5, 2026-09-20: with the screen off, run frames stop
reaching the watch entirely, and start again the instant the screen comes back on. The fixes are
unaffected, because the foreground service buffers those, and the totals at the end matched an
independent tracking app exactly.

That is Android freezing a backgrounded webview. Everything the link did was driven from JavaScript:
`@capacitor-community/bluetooth-le` does the GATT work natively, but only when a page calls it, and
a frozen page calls nothing. Keeping the phone's screen on for an hour was not acceptable, for the
battery and for the mis-taps, so the connection moved into the app's own `Wrist.java` and the
service composes frames itself once the page has gone quiet.

The battery rule that fell out of it: the service never starts a timer. It sends on the back of the
location callbacks it is already being woken for, at most one frame every three seconds.

## A paused run must keep its foreground service

Found 2026-09-20. Pausing a run from the watch with the phone's screen off worked; resuming it did
nothing, and the phone came back to its launcher with the app cold. Pausing stopped the location
service, which was the app's only foreground component: the process became cacheable and Android
took it, activity and all, within seconds. A pause now holds the service with the fixes switched off
and the notification saying so.

The same reasoning applies to leaving the run page with a run paused, which used to stop the service
for the same reason and with the same result.

## Two byte budgets, not one

Also measured that day: a watch whose link never negotiated an MTU can only notify twenty bytes, and
it drops anything longer where the sender sees nothing but a successful call. The watch logs
`message of 25 will not fit 20`. Anything the watch has to be able to say on a bad link has to fit
in twenty bytes, which is why the run commands are four message types rather than one type with an
action inside it.

## Ambient needs a library the manifest has to ask for

Found 2026-09-20 on a TicWatch Pro 5. Always on did nothing at all: the watch went to sleep on a
wrist flick and the system's own ambient dream took the screen, with no error anywhere. Ambient is
not in the framework. `androidx.wear`'s observer talks to `WearableActivityController` in the
watch's optional shared library, so without

```xml
<uses-library android:name="com.google.android.wearable" android:required="false" />
```

in the application element, the class is simply not on the app's classpath and the request is
dropped in silence. `adb shell dumpsys package com.appchery.watch` proves it either way: with the
entry, `usesLibraryFiles` lists `/system/framework/com.google.android.wearable.jar`, and without it
the list is empty.

`adb shell am broadcast -a com.google.android.wearable.action.ENTER_AMBIENT` is stale advice on this
release: it completes with result 0 and no callback ever arrives. A wrist flick is the only test.

And the library is only half of it. The watch's own always-on screen has to be on, or there is no
ambient for an app to be given: `adb shell settings list global | grep ambient` reads
`ambient_enabled=0` on a watch with it switched off, the display goes out on a wrist drop, and the
request is refused in silence. Measured the same day, with the app logging `ambient asked for` and
`ambient in` never arriving. The controls page now reads that setting and says so rather than
offering a toggle that does nothing.

See doc/running.md for the whole feature.
