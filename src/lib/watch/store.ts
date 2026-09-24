import { App } from '@capacitor/app';
import { get, writable } from 'svelte/store';
import { deviceId } from '$lib/db/repository';
import { rememberedWatch } from '$lib/prefs';
import {
	canReconnectSilently,
	support,
	type ConnectFailure,
	type ConnectResult,
	type Connection
} from './ble';
import { connect as connectOverWeb } from './ble.web';
import { WatchLink, type LinkEvent } from './link';
import type { RunCommand } from './protocol';

/**
 * The one link this device holds, kept here rather than on a page because the app is a single page:
 * a connection made in the settings survives walking to the scoring screen, and it has to, since
 * Chrome has no `getDevices` and reopening one costs the archer a tap at the shooting line.
 */

export type WatchStatus =
	/** Nothing about this device can talk to a watch, and the reason is worth saying out loud. */
	| { state: 'unsupported'; reason: 'no-api' | 'insecure' | 'no-adapter' | 'no-wear' }
	| { state: 'idle' }
	| { state: 'connecting' }
	| { state: 'connected'; name: string; fragile: boolean }
	/**
	 * Connected to something that never answered. Worth its own state rather than being called
	 * connected: updating the watch app leaves exactly this, and it looks perfectly healthy.
	 */
	| { state: 'stale'; name: string }
	| { state: 'failed'; reason: ConnectFailure }
	/** It was connected and is not any more, which reads differently from never having tried. */
	| { state: 'lost' };

function initial(): WatchStatus {
	const can = support();
	return can.usable ? { state: 'idle' } : { state: 'unsupported', reason: can.reason };
}

export const watchStatus = writable<WatchStatus>(initial());

let connection: Connection | null = null;
let link: WatchLink | null = null;
let onOpen: ((index: number) => void) | null = null;
let onArrows: ((total: number, at: number) => void) | null = null;
let onApplied: (() => void) | null = null;
let onBack: (() => void) | null = null;
let onCommand: ((command: RunCommand) => void) | null = null;
let onHeart: ((bpm: number, at: number) => void) | null = null;
let onLinked: (() => void) | null = null;
/**
 * Whether this link has already been greeted. The heartbeat says hello every fifteen seconds and is
 * answered every time, so a greeting is not news: only the first one on a given link is. A link that
 * recovers after going quiet re-sends the round and the session from inside `WatchLink`, which is
 * where the state it needs already lives.
 */
let greeted = false;
let heartbeat: ReturnType<typeof setInterval> | null = null;

/**
 * How often the phone checks that anybody is still listening. Often enough that a watch app restart
 * is noticed before the archer shoots an end into nothing, seldom enough to cost neither battery.
 */
const HEARTBEAT_MS = 15_000;

function stopHeartbeat(): void {
	if (heartbeat !== null) clearInterval(heartbeat);
	heartbeat = null;
}

/** The live link, for a page that wants to put a round or a session on the wrist. */
export function watchLink(): WatchLink | null {
	return link;
}

/** What to do when the watch asks for an activity. Only the app knows how to get there. */
export function onWatchOpen(handler: ((index: number) => void) | null): void {
	onOpen = handler;
}

/** What to do when the watch asserts the session's training arrows. */
export function onWatchArrows(handler: ((total: number, at: number) => void) | null): void {
	onArrows = handler;
}

/**
 * What to do once the watch has changed the record. Writing it is not enough: the page holding the
 * scoresheet read its rows before the arrow arrived and has no reason to read them again.
 */
export function onWatchApplied(handler: (() => void) | null): void {
	onApplied = handler;
}

/**
 * What to do the moment a watch starts listening. The pages describe themselves as they mount, so a
 * link made after that leaves the watch knowing nothing and showing it: this is how whatever is on
 * the phone gets said again, without the page having to know the link ever went.
 */
export function onWatchLinked(handler: (() => void) | null): void {
	onLinked = handler;
}

/** What to do when the watch asks to come back out of where it is. */
export function onWatchBack(handler: (() => void) | null): void {
	onBack = handler;
}

/** What to do when the watch asks for the run to be started, held or finished. */
export function onWatchCommand(handler: ((command: RunCommand) => void) | null): void {
	onCommand = handler;
}

/** What to do with the beat the watch reports, which only a run has any use for. */
export function onWatchHeart(handler: ((bpm: number, at: number) => void) | null): void {
	onHeart = handler;
}

function handle(event: LinkEvent, name: string): void {
	switch (event.kind) {
		case 'greeted':
			watchStatus.set({ state: 'connected', name, fragile: !canReconnectSilently() });
			// Once per link. Re-describing on every heartbeat would rebuild the round on the wrist
			// every fifteen seconds, taking the end being shot with it.
			if (!greeted) {
				greeted = true;
				onLinked?.();
			}
			return;
		case 'stale':
			watchStatus.set({ state: 'stale', name });
			reopenStale();
			return;
		case 'farewell':
			watchStatus.set({ state: 'lost' });
			return;
		case 'open':
			onOpen?.(event.index);
			return;
		case 'arrows':
			onArrows?.(event.total, event.at);
			return;
		case 'applied':
			onApplied?.();
			return;
		case 'back':
			onBack?.();
			return;
		case 'command':
			onCommand?.(event.command);
			return;
		case 'heart':
			onHeart?.(event.bpm, event.at);
			return;
		default:
			// Refused, noise and a version mismatch are not states of the link itself.
			return;
	}
}

/**
 * Opens the link over whichever transport this device has. The installed app connects straight to
 * the watch it opened last; the browser has no such thing and every attempt goes through the
 * chooser, which is why this may only be called from a click.
 */
async function openLink(
	transport: (
		onBytes: (bytes: DataView) => void,
		onLost: () => void
	) => Promise<ConnectResult>
): Promise<ConnectResult> {
	return transport(
		(bytes) => void link?.receive(bytes),
		() => {
			stopHeartbeat();
			connection = null;
			link = null;
			watchStatus.set({ state: 'lost' });
			// A watch that walked out of range walks back in, so this is the start of trying rather
			// than the end of the link. Does nothing in a browser, which cannot reopen one unasked.
			retryDelay = RETRY_FIRST_MS;
			// Tried at once: a connect waits for the watch, so a restarting watch app is caught as it returns.
			void tryRemembered(true);
		}
	);
}

/** The native transport, loaded only where there is one: the browser bundle should not carry it. */
async function nativeTransport() {
	return (await import('./ble.native')).connect;
}

/**
 * Asks for a watch. Must be called straight from a click in the browser: the chooser needs a real
 * gesture and refuses one that arrives out of a promise chain. The installed app tries the
 * remembered watch first and only asks if that one is not there, so the usual case costs no tap.
 */
export async function connectWatch(): Promise<void> {
	const can = support();
	if (!can.usable) {
		watchStatus.set({ state: 'unsupported', reason: can.reason });
		return;
	}
	// A link that never answered has to go before another can be made, or this does nothing at all.
	if (connection && link?.live) return;
	// Only the link: this is the archer asking for the watch back, not saying they are done with it,
	// so neither the remembered watch nor what the open page is listening for should go.
	if (connection) dropLink();

	// The archer is doing by hand what the timer has been trying: let them, and say what happens.
	stopRetry();
	watchStatus.set({ state: 'connecting' });

	let result: ConnectResult;
	if (can.path === 'native') {
		const connectOverNative = await nativeTransport();
		const remembered = get(rememberedWatch);
		result = remembered
			? await openLink((onBytes, onLost) =>
					connectOverNative(onBytes, onLost, { deviceId: remembered, onRestarted: regreet })
				)
			: { ok: false, reason: 'not-found' };
		// The archer asked for a watch, so a remembered one that is not there is a reason to offer the
		// chooser rather than to give up: it may well be a different watch they mean to use.
		if (!result.ok && result.reason === 'not-found') {
			rememberedWatch.set(null);
			result = await openLink((onBytes, onLost) =>
				connectOverNative(onBytes, onLost, { onRestarted: regreet })
			);
		}
	} else {
		result = await openLink(connectOverWeb);
	}

	if (!result.ok) {
		watchStatus.set({ state: 'failed', reason: result.reason });
		// A watch that did not answer a tap is still the watch this phone knows, so keep trying for
		// it quietly. Anything else is a fault the archer has to clear, and a timer cannot.
		if (result.reason === 'not-found') armRetry();
		return;
	}

	// Remembered only where it can be used again: a browser cannot reopen a link from an id.
	if (can.path === 'native') rememberedWatch.set(result.connection.id);
	await adopt(result.connection);
}

/**
 * How long before a remembered watch that did not answer is tried again, and the ceiling that
 * doubling stops at. A watch left at home must not be hunted for every ten seconds all afternoon,
 * and a watch that is simply on the other wrist of somebody walking back from the target comes back
 * within one attempt either way.
 */
const RETRY_FIRST_MS = 10_000;
const RETRY_MAX_MS = 120_000;

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = RETRY_FIRST_MS;
/** One attempt at a time: the timer and a returning app can both come due at once. */
let opening = false;
let listening = false;

function stopRetry(): void {
	if (retryTimer !== null) clearTimeout(retryTimer);
	retryTimer = null;
	retryDelay = RETRY_FIRST_MS;
}

/**
 * Keeps trying the remembered watch while the link is down.
 *
 * Native only, and that is not a detail: the browser cannot reopen a link without the chooser and
 * the chooser refuses anything that did not come from a tap, so a timer doing this in a tab would
 * be an error every time it fired. There the archer connects by hand and the card says so, which is
 * exactly what it said before any of this.
 */
function armRetry(): void {
	const can = support();
	if (!can.usable || can.path !== 'native') return;
	if (retryTimer !== null) return;

	retryTimer = setTimeout(() => {
		retryTimer = null;
		retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
		void tryRemembered(true);
	}, retryDelay);

	if (listening) return;
	listening = true;
	// Coming back to the app is the moment worth trying: the archer is holding the phone and the
	// watch is a wrist away. It also covers the link Android dropped while the app was off screen,
	// which is the usual reason the watch sits there saying it is waiting for a phone.
	void App.addListener('appStateChange', ({ isActive }) => {
		if (!isActive) return;
		retryDelay = RETRY_FIRST_MS;
		void tryRemembered(true);
	});
}

/**
 * Opens the remembered link without being asked. Silent by design: no chooser, and a watch left at
 * home leaves the card idle rather than failed, because nobody asked for a watch and nobody should
 * be told off for not wearing one. Only ever runs where a watch is remembered, which means the
 * permissions were granted on the connection that remembered it.
 *
 * `quiet` is the difference between the try at app start and the ones a timer makes afterwards: the
 * first is worth saying out loud, and a card flickering through "looking for a watch" every ten
 * seconds for the rest of the afternoon is not.
 */
async function tryRemembered(quiet: boolean): Promise<void> {
	const can = support();
	if (!can.usable || can.path !== 'native') return;
	if (connection || opening) return;

	const remembered = get(rememberedWatch);
	// Nothing to reconnect to. Disconnect forgets the watch, so this is also how the timer stops.
	if (!remembered) {
		stopRetry();
		return;
	}

	opening = true;
	try {
		const connectOverNative = await nativeTransport();
		if (!quiet) watchStatus.set({ state: 'connecting' });
		const result = await openLink((onBytes, onLost) =>
			connectOverNative(onBytes, onLost, { deviceId: remembered, onRestarted: regreet })
		);

		if (!result.ok) {
			// Back to where it was. The watch is still remembered: it was out of range, not disowned.
			if (!quiet) watchStatus.set({ state: 'idle' });
			armRetry();
			return;
		}
		stopRetry();
		await adopt(result.connection);
	} finally {
		opening = false;
	}
}

/**
 * The watch, opened again without being asked: once as the app starts, and then whenever it comes
 * back to the screen or a backed-off timer comes due, for as long as the link is down and a watch
 * is still remembered.
 */
export async function resumeWatch(): Promise<void> {
	await tryRemembered(false);
}

/** Says hello over a connection that is up, and watches that somebody is still listening on it. */
async function adopt(opened: Connection): Promise<void> {
	connection = opened;
	greeted = false;
	const name = opened.name;
	link = new WatchLink(opened.channel, deviceId(), (event) => handle(event, name));
	// Said before anything else, and the status stays at connecting until the watch answers it.
	await link.open();

	stopHeartbeat();
	heartbeat = setInterval(() => {
		// A write that throws is as good an answer as silence: there is nothing on the other end.
		void link?.ping().catch(() => watchStatus.set({ state: 'stale', name }));
	}, HEARTBEAT_MS);
}

/**
 * Puts the link down and forgets the watch. Forgetting is the point of the button: an archer who
 * has said they are done with this watch should not find the app has opened it again by itself on
 * the next start. Connecting again costs one tap and remembers it afresh.
 */
/**
 * Puts the link down and leaves everything else alone. What the pages have asked to be told about is
 * theirs, not the link's: they registered it when they mounted and they clear it when they leave, so
 * a link going down and coming back must not take it with it. Clearing it here left a watch whose
 * taps reached a phone that had stopped listening for them.
 */
function dropLink(): void {
	stopRetry();
	stopHeartbeat();
	void link?.close();
	connection?.disconnect();
	connection = null;
	link = null;
	greeted = false;
}

// Said again at once, so the restarted watch app is handed the run without waiting on a heartbeat.
function regreet(): void {
	void link?.open().catch(() => undefined);
}

// A restarted watch app leaves the phone writing into nothing, see doc/llm-memory/watch-link.md.
function reopenStale(): void {
	const can = support();
	// Never answered is a watch app not listening at all, and reconnecting to it changes nothing.
	if (!can.usable || can.path !== 'native' || !connection || opening || !greeted) return;
	dropLink();
	void tryRemembered(true);
}

export function disconnectWatch(): void {
	rememberedWatch.set(null);
	dropLink();
	watchStatus.set(initial());
}
