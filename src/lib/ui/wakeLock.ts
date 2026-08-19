/**
 * Holding the screen awake while something is running, the shooting clock above all: a phone that
 * sleeps mid end takes the clock with it.
 */

export interface Sentinel {
	release(): Promise<void> | void;
}

/**
 * The request is asynchronous, so a stop that lands before it resolves has to release a sentinel it
 * was never handed: otherwise the screen stays lit for the rest of the session with nothing left
 * holding a reference to turn it off.
 */
export function screenLock(request: () => Promise<Sentinel> | undefined) {
	let held: Sentinel | null = null;
	let wanted = false;

	return {
		acquire() {
			wanted = true;
			request()
				?.then((sentinel) => {
					if (wanted) held = sentinel;
					else void sentinel.release();
				})
				.catch(() => undefined);
		},
		release() {
			wanted = false;
			void held?.release();
			held = null;
		}
	};
}
