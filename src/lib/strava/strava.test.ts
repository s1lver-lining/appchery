import { describe, it, expect } from 'vitest';
import { duplicateOf, readCallback } from './api';
import { isStale, parseTokens, startedHere } from './tokens';

describe('readCallback', () => {
	const asked = (query: string) => readCallback(new URLSearchParams(query));

	it('takes the code when the write scope was granted', () => {
		expect(asked('code=abc&scope=read,activity:write')).toEqual({ code: 'abc' });
	});

	// Strava grants each scope on its own, so saying yes is not the same as saying yes to this.
	it('refuses a sign in that withheld the write scope', () => {
		expect(asked('code=abc&scope=read')).toEqual({ refused: 'missing_scope' });
	});

	it('reports what Strava said when it sent no code', () => {
		expect(asked('error=access_denied')).toEqual({ refused: 'access_denied' });
		expect(asked('')).toEqual({ refused: 'missing_code' });
	});
});

describe('duplicateOf', () => {
	it('reads the activity a file was already turned into', () => {
		expect(duplicateOf('duplicate of activity 12345')).toBe(12345);
	});

	it('is nothing for every other answer', () => {
		expect(duplicateOf(null)).toBe(null);
		expect(duplicateOf('Your activity is still being processed.')).toBe(null);
	});
});

describe('isStale', () => {
	const at = (seconds: number) => ({ accessToken: 'a', refreshToken: 'r', expiresAt: seconds, athlete: null });

	it('is fresh while there is more than the grace left', () => {
		expect(isStale(at(2000), 1000_000)).toBe(false);
	});

	// Renewed early, so a token cannot expire between the check and the upload landing.
	it('is stale inside the last minute', () => {
		expect(isStale(at(1030), 1000_000)).toBe(true);
		expect(isStale(at(900), 1000_000)).toBe(true);
	});
});

describe('parseTokens', () => {
	it('reads a pair back', () => {
		expect(parseTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: 7, athlete: 'Robin' })).toEqual({
			accessToken: 'a',
			refreshToken: 'r',
			expiresAt: 7,
			athlete: 'Robin'
		});
	});

	it('is no token at all when either half is missing', () => {
		expect(parseTokens({ accessToken: 'a' })).toBe(null);
		expect(parseTokens({ refreshToken: 'r' })).toBe(null);
		expect(parseTokens(null)).toBe(null);
		expect(parseTokens('nonsense')).toBe(null);
	});
});

describe('startedHere', () => {
	const now = 1_000_000_000;

	it('knows the browser that was sent to Strava', () => {
		expect(startedHere(String(now - 60_000), now)).toBe(true);
	});

	it('is nothing in a browser that was never sent', () => {
		expect(startedHere(null, now)).toBe(false);
		expect(startedHere('', now)).toBe(false);
		expect(startedHere('nonsense', now)).toBe(false);
	});

	// A marker left behind by an abandoned sign in must not claim a later one.
	it('goes stale after half an hour', () => {
		expect(startedHere(String(now - 31 * 60_000), now)).toBe(false);
	});
});
