import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readPdfText } from './text';

/**
 * The schedules are ianseo's own reports, saved as it published them but for their logos, which are
 * two photographs weighing thirty times the words and nothing here reads an image.
 */
const load = (name: string) => readPdfText(new Uint8Array(readFileSync(`test/ianseo/${name}.pdf`)));

describe('readPdfText', () => {
	it('reads a page a run of words at a time, each where it was printed', async () => {
		const pages = await load('SCHEDULE');
		expect(pages).toHaveLength(2);

		const first = pages[0].items;
		const day = first.find((item) => item.text.startsWith('1 Sep 2026'));
		expect(day).toBeDefined();
		// The time of the first session, printed to the left of it and on the same line.
		const time = first.find((item) => item.text === '09:00');
		expect(time!.y).toBeCloseTo(first.find((item) => item.text === 'Accueil')!.y, 0);
		expect(time!.x).toBeLessThan(first.find((item) => item.text === 'Accueil')!.x);
	});

	it('decodes the letters an organiser writes their own competition in', async () => {
		const [page] = await load('SCHEDULE');
		const said = page.items.map((item) => item.text);
		expect(said).toContain("l'Arc - Compiègne");
		// An em dash, which lives where Latin 1 has nothing and would otherwise print as a blank.
		expect(said.some((text) => text.includes('Qualification 1 — J1'))).toBe(true);
	});

	it('says which runs were printed in bold, which is all a PDF says about emphasis', async () => {
		const [page] = await load('SCHEDULE');
		expect(page.items.find((item) => item.text === 'Tours de qualifications')?.bold).toBe(true);
		expect(page.items.find((item) => item.text === 'Accueil')?.bold).toBe(false);
	});

	it('comes back empty on anything that is not a PDF, rather than throwing', async () => {
		expect(await readPdfText(new TextEncoder().encode('<html>Not found</html>'))).toEqual([]);
	});
});
