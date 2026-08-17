import { describe, it, expect } from 'vitest';
import { resolve, resolveWithDeletes, type Mergeable } from './merge';

function row(patch: Partial<Mergeable> = {}): Mergeable {
	return { id: 'row', createdAt: 100, updatedAt: 100, deviceId: 'device-a', deletedAt: null, ...patch };
}

describe('last writer wins', () => {
	it('keeps whichever copy was edited last', () => {
		expect(resolve('activity', row({ updatedAt: 200 }), row({ updatedAt: 100 }))).toBe('local');
		expect(resolve('activity', row({ updatedAt: 100 }), row({ updatedAt: 200 }))).toBe('remote');
	});

	/**
	 * The property that matters: both devices run this with their own row as `local`, so a rule that
	 * is not symmetric leaves each of them keeping a different answer and neither ever converging.
	 */
	it('agrees with itself whichever side asks', () => {
		const pairs: [Mergeable, Mergeable][] = [
			[row({ deviceId: 'a' }), row({ deviceId: 'b' })],
			[row({ updatedAt: 5, deviceId: 'z' }), row({ updatedAt: 5, deviceId: 'a' })],
			[row({ createdAt: 1, updatedAt: 9 }), row({ createdAt: 2, updatedAt: 3 })]
		];

		for (const [mine, theirs] of pairs) {
			for (const table of ['activity', 'session']) {
				const here = resolve(table, mine, theirs);
				const there = resolve(table, theirs, mine);
				expect(here === 'local' ? 'remote' : 'local').toBe(there);
			}
		}
	});

	it('breaks a tied timestamp on the device rather than on who is asking', () => {
		expect(resolve('activity', row({ deviceId: 'b' }), row({ deviceId: 'a' }))).toBe('local');
		expect(resolve('activity', row({ deviceId: 'a' }), row({ deviceId: 'b' }))).toBe('remote');
	});
});

describe('sessions are append only', () => {
	it('keeps the copy created first, however recently the other was edited', () => {
		const older = row({ createdAt: 1, updatedAt: 1 });
		const newer = row({ createdAt: 2, updatedAt: 999 });
		expect(resolve('session', older, newer)).toBe('local');
		expect(resolve('session', newer, older)).toBe('remote');
	});

	it('does not apply that rule to anything else', () => {
		const older = row({ createdAt: 1, updatedAt: 1 });
		const newer = row({ createdAt: 2, updatedAt: 999 });
		expect(resolve('activity', older, newer)).toBe('remote');
	});
});

describe('deletes', () => {
	it('wins a tie against an edit of exactly the same age', () => {
		const deleted = row({ deletedAt: 100 });
		const edited = row({ deletedAt: null });
		expect(resolveWithDeletes('activity', deleted, edited)).toBe('local');
		expect(resolveWithDeletes('activity', edited, deleted)).toBe('remote');
	});

	it('still loses to an edit that genuinely came later', () => {
		const deleted = row({ deletedAt: 100, updatedAt: 100 });
		const edited = row({ updatedAt: 200 });
		expect(resolveWithDeletes('activity', deleted, edited)).toBe('remote');
	});
});
