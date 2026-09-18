# Wear OS link over the native app, not the browser

Not built. Written down 2026-09-18 so a session picking it up starts from the reasoning rather than
rediscovering it. The browser transport is finished and working; this is the other half.

## Why it is worth doing

The one risk from the original design that never cleared: **Chrome on Android has no
`navigator.bluetooth.getDevices()`**, so a permitted watch cannot be picked up again without the
chooser. Every connection costs the archer a tap, and a link that drops mid round costs another one
at the shooting line.

A native central has no such limit. It connects straight to a remembered address, so the installed
app would reconnect silently and the archer would never see a chooser again. That is the whole
point; nothing else about the feature changes.

## What it needs

`@capacitor-community/bluetooth-le`, a new native dependency and a `cap sync`. It supplies the
central role: scan, connect by device id, subscribe to notifications, write a characteristic. That
is the entire surface this uses.

The work is one file, a sibling of `src/lib/watch/ble.web.ts` with the same shape: hand bytes up,
take bytes down, report why it could not connect. Everything above it already exists and is tested
without any transport at all, so nothing in `link.ts`, `apply.ts`, `protocol.ts` or `mirror.ts`
should need touching. `support()` in `ble.ts` gains a native answer, and `store.ts` picks the
transport by platform rather than assuming the browser.

The UUIDs are in `src/lib/watch/ble.ts` and must match the watch's `Link.java`.

## What to be careful about

**Remember the address and reconnect without asking.** That is the feature. It also means the app
should try on its own when a scoring activity opens, rather than waiting to be told.

**The liveness check still matters.** A native connection reports healthy just as readily as a web
one while nobody is listening on the other end, which is what happens when the watch app updates.
`WatchLink.ping` already handles it and the native path must keep using it.

**Permissions differ.** A native central needs the runtime scan and connect permissions, and on
older Android the location permission that BLE scanning used to require. The web path needed none of
this, so the settings card gains failure states it has never had to show.

**iOS gets nothing, still.** Wear OS has not paired to an iPhone since Wear OS 3, so this is Android
only however it is built.
