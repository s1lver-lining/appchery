import { describe, it, expect } from 'vitest';
import { screenLock } from './wakeLock';

function sentinel() {
	const state = { released: false };
	return { state, handle: { release: () => void (state.released = true) } };
}

describe('screenLock', () => {
	it('releases a sentinel that arrives after the lock was let go', async () => {
		const { state, handle } = sentinel();
		let hand: (value: typeof handle) => void = () => {};
		const lock = screenLock(() => new Promise<typeof handle>((resolve) => (hand = resolve)));

		lock.acquire();
		lock.release();
		hand(handle);
		await Promise.resolve();

		expect(state.released).toBe(true);
	});

	it('holds a sentinel that arrives while the lock is still wanted', async () => {
		const { state, handle } = sentinel();
		const lock = screenLock(() => Promise.resolve(handle));

		lock.acquire();
		await Promise.resolve();
		expect(state.released).toBe(false);

		lock.release();
		expect(state.released).toBe(true);
	});

	it('survives a browser that offers no wake lock at all', () => {
		const lock = screenLock(() => undefined);
		expect(() => {
			lock.acquire();
			lock.release();
		}).not.toThrow();
	});
});
