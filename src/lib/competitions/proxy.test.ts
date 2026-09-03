import { describe, it, expect } from 'vitest';
import { PAGE_TAG, proxied, tagOf } from './proxy';

/**
 * ianseo stamps nothing it builds with PHP, so a page an archer refreshes is sent again in full
 * however little of it changed. The proxy stamps it from the bytes it read, so the app can say what
 * it holds and be answered in a line. ianseo is still asked every time: this saves the phone's data.
 */
const answerOf = (body: string, headers: Record<string, string> = {}, status = 200) =>
	new Response(status === 304 ? null : body, { status, headers });

describe('the stamp the proxy puts on a page', () => {
	it('is weak, since the edge compresses a page on its way out', async () => {
		expect(await tagOf(new TextEncoder().encode('a page'))).toMatch(/^W\/"[0-9a-f]{32}"$/);
	});

	it('is the same for the same bytes and different for different ones', async () => {
		expect(await tagOf(new TextEncoder().encode('a page'))).toBe(
			await tagOf(new TextEncoder().encode('a page'))
		);
		expect(await tagOf(new TextEncoder().encode('a page'))).not.toBe(
			await tagOf(new TextEncoder().encode('another page'))
		);
	});

	it('stamps a page ianseo stamped with nothing', async () => {
		const passed = await proxied(answerOf('<html>list</html>'), null);
		expect(passed.status).toBe(200);
		expect(passed.headers.ETag).toBeTruthy();
		expect(new TextDecoder().decode(passed.body!)).toBe('<html>list</html>');
	});

	it('says it twice, since a host that compresses the page drops the ETag off it', async () => {
		const passed = await proxied(answerOf('<html>list</html>'), null);
		expect(passed.headers[PAGE_TAG]).toBe(passed.headers.ETag);
	});

	it('answers in a line when the app already holds that very page', async () => {
		const first = await proxied(answerOf('<html>list</html>'), null);
		const again = await proxied(answerOf('<html>list</html>'), first.headers.ETag);
		expect(again.status).toBe(304);
		expect(again.body).toBe(null);
		expect(again.headers.ETag).toBe(first.headers.ETag);
	});

	it('sends the page when it is no longer the one the app holds', async () => {
		const first = await proxied(answerOf('<html>list</html>'), null);
		const again = await proxied(answerOf('<html>a longer list</html>'), first.headers.ETag);
		expect(again.status).toBe(200);
		expect(again.headers.ETag).not.toBe(first.headers.ETag);
	});

	it("keeps a PDF's own stamp rather than inventing one over it", async () => {
		const passed = await proxied(answerOf('%PDF-1.4', { ETag: '"f1fa-65a9"' }), null);
		expect(passed.headers.ETag).toBe('"f1fa-65a9"');
	});

	it('passes on ianseo answering for itself that a PDF has not changed', async () => {
		const passed = await proxied(answerOf('', { ETag: '"f1fa-65a9"' }, 304), '"f1fa-65a9"');
		expect(passed.status).toBe(304);
		expect(passed.body).toBe(null);
		expect(passed.headers.ETag).toBe('"f1fa-65a9"');
	});

	it('stamps nothing on a page ianseo refused, so a failure is never held as one', async () => {
		const passed = await proxied(answerOf('gone', {}, 404), null);
		expect(passed.status).toBe(404);
		expect(passed.headers.ETag).toBe(undefined);
	});
});
