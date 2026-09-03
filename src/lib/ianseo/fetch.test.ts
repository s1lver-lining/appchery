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

	it('hands back a page that answers in time', async () => {
		vi.stubGlobal('fetch', async () => ({ status: 200, ok: true, text: async () => '<html>ok</html>' }));
		expect(await fetchIanseo('/TourList.php')).toBe('<html>ok</html>');
	});

	it('leaves nothing waiting once a page has been read', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', async () => ({ status: 200, ok: true, text: async () => 'done' }));
		expect(await fetchIanseo('/TourList.php')).toBe('done');
		expect(vi.getTimerCount()).toBe(0);
	});
});
