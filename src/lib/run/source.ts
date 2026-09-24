import { Capacitor, registerPlugin } from '@capacitor/core';
import type { RunFix } from '$lib/domain/run/track';

/**
 * Where the fixes come from, on the two platforms that record a run: the installed app, through the
 * foreground service in android/app/src/main/java/com/appchery/app/TraceService.java, and a browser,
 * through its own geolocation.
 *
 * One shape for both, and it is the service's shape rather than the browser's: fixes are asked for
 * rather than pushed. A browser hands them over as they arrive, so the web source keeps them until
 * they are asked for, and every caller is written once. What the app cannot promise in a browser is
 * the background: a tab the phone has put to sleep stops receiving, and the page says so rather than
 * pretending otherwise, see doc/llm-memory/running.md.
 */

export type StartFailure = 'denied' | 'location-off' | 'unsupported';

export interface Source {
	/** Native or browser, which is the difference between a run that survives a pocket and one that does not. */
	readonly background: boolean;
	start(fresh: boolean): Promise<StartFailure | null>;
	/**
	 * Paused rather than finished. The service stays up with nothing to listen to: stopping it is
	 * the app losing the one thing keeping its process alive, and a process Android has reclaimed
	 * cannot be told to carry on, see doc/llm-memory/running.md.
	 */
	hold(): Promise<void>;
	stop(): Promise<void>;
	/** Everything gathered since the last call, oldest first. */
	drain(): Promise<RunFix[]>;
}

interface TracePlugin {
	start(options: { fresh: boolean }): Promise<{ started: boolean }>;
	hold(): Promise<void>;
	stop(): Promise<void>;
	drain(options: { since: number }): Promise<{
		fixes: (RunFix & { seq: number })[];
		seq: number;
		running: boolean;
	}>;
}

const Trace = registerPlugin<TracePlugin>('Trace');

function nativeSource(): Source {
	let seq = 0;
	return {
		background: true,
		async start(fresh) {
			if (fresh) seq = 0;
			try {
				await Trace.start({ fresh });
				return null;
			} catch (error) {
				const message = String((error as Error)?.message ?? error);
				return message.includes('location-off') ? 'location-off' : 'denied';
			}
		},
		async hold() {
			await Trace.hold().catch(() => undefined);
		},
		async stop() {
			await Trace.stop().catch(() => undefined);
		},
		async drain() {
			const taken = await Trace.drain({ since: seq }).catch(() => null);
			if (!taken) return [];
			seq = taken.seq;
			return taken.fixes.map(readFix);
		}
	};
}

function webSource(): Source {
	let watch: number | null = null;
	let held: RunFix[] = [];
	return {
		background: false,
		async start(fresh) {
			if (fresh) held = [];
			if (!('geolocation' in navigator)) return 'unsupported';
			if (watch !== null) return null;
			return new Promise<StartFailure | null>((resolve) => {
				let answered = false;
				const settle = (failure: StartFailure | null) => {
					if (answered) return;
					answered = true;
					resolve(failure);
				};
				watch = navigator.geolocation.watchPosition(
					(position) => {
						held.push(readPosition(position));
						settle(null);
					},
					(error) => {
						// Only the first error answers the start: a fix lost mid run is not a run refused.
						if (watch !== null && !answered) {
							navigator.geolocation.clearWatch(watch);
							watch = null;
						}
						settle(error.code === error.PERMISSION_DENIED ? 'denied' : 'location-off');
					},
					{ enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 }
				);
			});
		},
		async hold() {
			// A browser has no service to hold open, so a pause is the same as a stop here.
			await this.stop();
		},
		async stop() {
			if (watch !== null) navigator.geolocation.clearWatch(watch);
			watch = null;
		},
		async drain() {
			const taken = held;
			held = [];
			return taken;
		}
	};
}

const number = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;

function readFix(fix: RunFix & { seq: number }): RunFix {
	return {
		at: fix.at,
		lat: fix.lat,
		lon: fix.lon,
		accuracy: number(fix.accuracy),
		altitude: number(fix.altitude),
		speed: number(fix.speed)
	};
}

function readPosition(position: GeolocationPosition): RunFix {
	return {
		at: position.timestamp,
		lat: position.coords.latitude,
		lon: position.coords.longitude,
		accuracy: number(position.coords.accuracy),
		altitude: number(position.coords.altitude),
		speed: number(position.coords.speed)
	};
}

/** The best source this device has, which is the service wherever there is one. */
export function trackingSource(): Source {
	return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Trace')
		? nativeSource()
		: webSource();
}

/** Whether a run can be tracked here at all, which the page asks before it offers to. */
export function canTrack(): boolean {
	return (
		(Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Trace')) ||
		(typeof navigator !== 'undefined' && 'geolocation' in navigator)
	);
}
