import type { TextItem, TextPage } from '$lib/pdf/text';
import type { Competition, CompetitionDocument } from './types';

/**
 * A competition's timetable, read off the PDF ianseo prints it as.
 *
 * ianseo publishes the schedule as a report and never as a page, so this is the one thing in the
 * feature that is read out of a PDF rather than out of HTML. The report is a table: a day across
 * the whole width, then a line a session, with the times on the left and what is being shot on the
 * right. That shape is what is read here, and nothing else about the document is interpreted.
 *
 * Everything is a guess about somebody else's layout, so every guess is checkable: a page this
 * cannot find a single day on comes back as nothing at all, and the screen hands the archer the PDF.
 */

export type ScheduleLine = {
	/** As printed, which is a moment or a span: `09:00`, or `09:30-11:45`. */
	time: string | null;
	/** How long it lasts, where the report prints it in its own column. */
	duration: string | null;
	text: string;
	/** Printed in bold, which is how the report opens a block: a round, a tournament, a note. */
	strong: boolean;
	/** Set off by a blank line on the page, the way the report separates one block from the next. */
	spaced: boolean;
};

export type ScheduleDay = {
	/** The day as the report heads it, in the organiser's language: `1 Sep 2026, Mardi`. */
	title: string;
	lines: ScheduleLine[];
};

export type Schedule = { days: ScheduleDay[] };

/** A day, a month in whatever language, and a year: the one line a schedule cannot be read without. */
const DAY = /^\d{1,2}\s+\S+\s+\d{4}/;
/** A moment or a span of two. Written with a colon by the report, whatever the country reading it. */
const TIME = /^\d{1,2}[:.]\d{2}(\s*[-–—]\s*\d{1,2}[:.]\d{2})?$/;
/** The one thing printed below the schedule, and the only line of the page that is not part of it. */
const FOOTER = /^page\s*\d+\s*\/\s*\d+$/i;
/** How far apart two runs may be drawn and still be the same printed line, in points. */
const SAME_LINE = 2.5;
/** A gap this much wider than the report's own line spacing is a blank line rather than a line. */
const BLANK = 1.3;
/**
 * How far above a day's own heading the table still reaches, in points. A page that carries a day
 * over starts its first line where a heading would have gone, a tenth of a point out, and the
 * competition's name is reprinted an inch above that: anywhere between the two will do.
 */
const TOP_SLACK = 6;

export function parseSchedule(pages: TextPage[]): Schedule | null {
	const printed = pages.map(rowsOf);
	const headings = printed.flat().filter((row) => row.length === 1 && DAY.test(row[0].text));
	// Nothing that reads as a day means this is not the report this was written for, or no longer is.
	if (headings.length === 0) return null;

	const left = Math.min(...headings.map((row) => row[0].x));
	/**
	 * Where the table starts on the page. The competition's name and its dates are reprinted above
	 * every page of the report, and a page that carries a day over from the one before it does not
	 * head that day again: without a top there is no telling the reprint from the first session of
	 * the morning, and a whole page of a championship goes missing.
	 */
	const top = Math.max(...headings.map((row) => row[0].y));
	const days: (ScheduleDay & { date: string })[] = [];

	for (const rows of printed) {
		const gap = spacing(rows);
		let previous: number | null = null;

		for (const row of rows) {
			if (row[0].y > top + TOP_SLACK) continue;
			// The report signs each page below the table, to the left of everything in it.
			if (row.some((item) => item.x < left - 1 || FOOTER.test(item.text))) continue;

			const above = previous;
			previous = row[0].y;
			if (row.length === 1 && DAY.test(row[0].text) && row[0].x < left + 1) {
				const date = DAY.exec(row[0].text)![0];
				// A day carried onto the next page is headed again, and is the same day for all that.
				if (days.at(-1)?.date !== date) days.push({ date, title: row[0].text, lines: [] });
				continue;
			}
			if (days.length === 0) continue;

			const line = lineOf(row);
			if (!line) continue;
			line.spaced = above !== null && above - row[0].y > gap * BLANK;
			days[days.length - 1].lines.push(line);
		}
	}

	const kept = days.filter((day) => day.lines.length > 0).map(({ title, lines }) => ({ title, lines }));
	return kept.length > 0 ? { days: kept } : null;
}

/** The runs of one printed line, left to right: a PDF says where each of them went and no more. */
function rowsOf(page: TextPage): TextItem[][] {
	const sorted = [...page.items].sort((a, b) => b.y - a.y || a.x - b.x);
	const rows: TextItem[][] = [];
	for (const item of sorted) {
		const last = rows.at(-1);
		if (last && Math.abs(last[0].y - item.y) <= SAME_LINE) last.push(item);
		else rows.push([item]);
	}
	return rows.map((row) => [...row].sort((a, b) => a.x - b.x));
}

/** The report's own line spacing, which is the gap two lines are apart when nothing separates them. */
function spacing(rows: TextItem[][]): number {
	const gaps = new Map<number, number>();
	for (let at = 1; at < rows.length; at++) {
		const gap = Math.round(rows[at - 1][0].y - rows[at][0].y);
		if (gap > 0) gaps.set(gap, (gaps.get(gap) ?? 0) + 1);
	}
	const common = [...gaps].sort((a, b) => b[1] - a[1])[0];
	return common ? common[0] : Infinity;
}

/**
 * One line of the table: the times it starts with, and everything after them.
 *
 * Read by what each run says rather than by which column it was drawn in. A report that moved its
 * columns would still be read; one that stopped printing times reads as a line of words, which is
 * the honest answer for a line that has none.
 */
function lineOf(row: TextItem[]): ScheduleLine | null {
	const rest = [...row];
	let time: string | null = null;
	let duration: string | null = null;
	if (rest.length > 1 && TIME.test(rest[0].text)) time = rest.shift()!.text;
	if (time && rest.length > 1 && TIME.test(rest[0].text)) duration = rest.shift()!.text;

	const text = rest.map((item) => item.text).join(' ').trim();
	if (!text) return null;
	return {
		time,
		duration,
		text,
		// Bold and upright, as against the bold italic the report leans a session's own name in.
		strong: rest.every((item) => item.bold && !item.italic),
		spaced: false
	};
}

/**
 * The document a competition's schedule is published as.
 *
 * The one place in this feature that reads a document's name, and it reads ianseo's rather than the
 * organiser's: the schedule is a report ianseo generates and files under a name of its own, while
 * the title beside it is whatever the organiser called it in their own language. Nothing depends on
 * being right, because the schedule is only ever read out of the PDF it points at.
 */
export function scheduleDocument(competition: Competition | null): CompetitionDocument | null {
	return (
		competition?.documents.find(
			(document) => scheduleName(document.pdfPath) === 'schedule' && !document.path
		) ?? null
	);
}

/** The file's own name, out of a link that carries the moment ianseo last rebuilt it as a query. */
function scheduleName(path: string | null): string {
	return (path ?? '').split(/[?#]/)[0].split('/').pop()?.replace(/\.pdf$/i, '').toLowerCase() ?? '';
}
