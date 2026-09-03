import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readPdfText } from '$lib/pdf/text';
import { parseSchedule, scheduleDocument } from './schedule';
import type { Competition } from './types';

const read = async (name: string) =>
	parseSchedule(await readPdfText(new Uint8Array(readFileSync(`test/ianseo/${name}.pdf`))));

describe('parseSchedule', () => {
	it("opens a day where the report heads one, in the organiser's own words", async () => {
		const schedule = (await read('SCHEDULE'))!;
		expect(schedule.days.map((day) => day.title)).toEqual([
			'1 Sep 2026, Mardi',
			'2 Sep 2026, Mercredi',
			'3 Sep 2026, Jeudi',
			'4 Sep 2026, Vendredi'
		]);
	});

	it('reads the times out of the columns they are printed in', async () => {
		const [first] = (await read('SCHEDULE'))!.days;
		expect(first.lines[0]).toMatchObject({ time: '09:00', duration: null, text: 'Accueil' });
		expect(first.lines.find((line) => line.time === '09:30-11:45')).toMatchObject({
			duration: '02:15',
			text: 'Echauffement (3 volées) suivi de 2x36 flèches en rythme ABC temps international'
		});
	});

	it('keeps the lines a session carries that have no time of their own', async () => {
		const [first] = (await read('SCHEDULE'))!.days;
		const carried = first.lines.filter((line) => line.time === null);
		expect(carried.length).toBeGreaterThan(0);
		expect(carried[0]).toMatchObject({ text: 'Tours de qualifications', strong: true });
	});

	/**
	 * The one thing a page of a PDF does that a page of HTML does not: it ends. Both halves of a day
	 * split across two pages have to end up in the same day, and the competition's name reprinted at
	 * the top of the second page must not end up in it at all.
	 */
	it('carries a day over the end of a page, headed again or not', async () => {
		const jeudi = (await read('SCHEDULE'))!.days[2];
		expect(jeudi.title).toBe('3 Sep 2026, Jeudi');
		expect(jeudi.lines.some((line) => line.text.startsWith('Tournoi 4'))).toBe(true);

		// This one continues its Saturday on the next page without heading it again.
		const samedi = (await read('SCHEDULE-3D'))!.days[3];
		expect(samedi.title).toBe('15 Aou 2026, Samedi');
		expect(samedi.lines.find((line) => line.time === '08:00-15:10')?.text).toBe(
			'Parcours 3 - Homme Arc Droit [HAD]'
		);
	});

	it("leaves the page heading and the report's own signature out of the schedule", async () => {
		for (const name of ['SCHEDULE', 'SCHEDULE-3D', 'SCHEDULE-BEURSAULT']) {
			const lines = (await read(name))!.days.flatMap((day) => day.lines);
			expect(lines.some((line) => /Report Created|Powered by|^Page \d/.test(line.text))).toBe(false);
			expect(lines.some((line) => line.text === 'Schedule')).toBe(false);
		}
	});

	it('reads every line the report prints and no more', async () => {
		const counted = async (name: string) =>
			(await read(name))!.days.reduce((all, day) => all + day.lines.length, 0);
		expect(await counted('SCHEDULE')).toBe(81);
		expect(await counted('SCHEDULE-3D')).toBe(56);
		expect(await counted('SCHEDULE-BEURSAULT')).toBe(57);
	});

	it('says nothing rather than something wrong about a report it cannot read', async () => {
		expect(parseSchedule([])).toBe(null);
		expect(parseSchedule([{ items: [{ x: 30, y: 700, text: 'Nothing here', bold: false, italic: false }] }])).toBe(
			null
		);
	});
});

describe('scheduleDocument', () => {
	const competition = (documents: Competition['documents']): Competition => ({
		toId: '29887',
		name: 'A competition',
		organiser: 'A club',
		where: 'Somewhere',
		documents
	});
	const document = (over: Partial<Competition['documents'][number]>) => ({
		path: null,
		pdfPath: null,
		url: null,
		title: '',
		group: 'Information',
		updatedAt: null,
		...over
	});

	it('finds the report whatever the organiser called it in their own language', () => {
		const found = scheduleDocument(
			competition([
				document({ pdfPath: '/TourData/2026/29887/FM J1_Q1.pdf', title: 'Feuilles de marque' }),
				document({ pdfPath: '/TourData/2026/29887/SCHEDULE.pdf', title: 'Programme prévisionnel' })
			])
		);
		expect(found?.title).toBe('Programme prévisionnel');
	});

	it('offers nothing where the competition published no schedule', () => {
		expect(scheduleDocument(competition([document({ pdfPath: '/TourData/2026/29887/STE.pdf' })]))).toBe(null);
		expect(scheduleDocument(null)).toBe(null);
	});
});
