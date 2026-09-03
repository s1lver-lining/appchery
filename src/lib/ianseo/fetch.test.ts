import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchIanseo, fetchIanseoBytes, IanseoError } from './fetch';

/**
 * A request that is accepted and never answered, which is what a phone holding one bar of signal at
 * a shooting range actually gets. Without a deadline the screen waits on it for as long as it is open.
 */
describe('fetchIanseo', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('gives up on a page that is never answered', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', (_url: string, init: { signal: AbortSignal }) =>
			new Promise((_resolve, reject) => {
				init.signal.addEventListener('abort', () => reject(new Error('aborted')));
			})
		);

		const reading = fetchIanseo('/TourList.php');
		const failed = expect(reading).rejects.toMatchObject({ kind: 'offline' });
		await vi.advanceTimersByTimeAsync(60_000);
		await failed;
	});

	it('gives up on a schedule whose bytes never arrive', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', (_url: string, init: { signal: AbortSignal }) =>
			new Promise((_resolve, reject) => {
				init.signal.addEventListener('abort', () => reject(new Error('aborted')));
			})
		);

		const reading = fetchIanseoBytes('/TourData/2026/1/SCHEDULE.pdf');
		const failed = expect(reading).rejects.toBeInstanceOf(IanseoError);
		await vi.advanceTimersByTimeAsync(60_000);
		await failed;
	});

	it('gives up on a page whose headers arrive and whose body does not', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', async (_url: string, init: { signal: AbortSignal }) => ({
			status: 200,
			ok: true,
			text: () =>
				new Promise((_resolve, reject) => {
					init.signal.addEventListener('abort', () => reject(new Error('aborted')));
				})
		}));

		const reading = fetchIanseo('/TourList.php');
		const failed = expect(reading).rejects.toMatchObject({ kind: 'offline' });
		await vi.advanceTimersByTimeAsync(60_000);
		await failed;
	});

	it('hands back a page that answers in time, with what ianseo called it', async () => {
		vi.stubGlobal('fetch', async () => ({
			status: 200,
			ok: true,
			headers: { get: () => '"abc"' },
			text: async () => '<html>ok</html>'
		}));
		expect(await fetchIanseo('/TourList.php')).toEqual({
			unchanged: false,
			body: '<html>ok</html>',
			tag: '"abc"'
		});
	});

	it('says a page is unchanged rather than handing back nothing', async () => {
		let sent: Record<string, string> | undefined;
		vi.stubGlobal('fetch', async (_url: string, init: { headers: Record<string, string> }) => {
			sent = init.headers;
			return { status: 304, ok: false, headers: { get: () => null }, text: async () => '' };
		});
		expect(await fetchIanseo('/TourList.php', { tag: '"abc"' })).toEqual({ unchanged: true });
		expect(sent?.['If-None-Match']).toBe('"abc"');
	});

	it('says nothing about what it holds where it holds nothing', async () => {
		let sent: Record<string, string> | undefined;
		vi.stubGlobal('fetch', async (_url: string, init: { headers: Record<string, string> }) => {
			sent = init.headers;
			return { status: 200, ok: true, headers: { get: () => null }, text: async () => 'x' };
		});
		await fetchIanseo('/TourList.php');
		expect(sent?.['If-None-Match']).toBe(undefined);
	});

	it('leaves nothing waiting once a page has been read', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', async () => ({
			status: 200,
			ok: true,
			headers: { get: () => null },
			text: async () => 'done'
		}));
		expect(await fetchIanseo('/TourList.php')).toMatchObject({ body: 'done' });
		expect(vi.getTimerCount()).toBe(0);
	});
});
