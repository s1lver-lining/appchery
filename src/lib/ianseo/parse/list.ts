import type { Tournament } from '../types';
import { attr, cells, flagOf, hasClass, rows, text } from './html';
import { readEach } from './reading';

/** Where ianseo publishes it. Here rather than beside the reader, so a background task that
 * cannot load the database can still ask for the page. */
export const TOURNAMENT_LIST = '/TourList.php';

/**
 * The tournament list, which ianseo publishes as one page of every competition it has ever hosted.
 * Rows are read by the class on each cell rather than by position: the list repeats several columns
 * twice, once for a wide screen and once for a narrow one, so counting cells reads the wrong ones.
 */

const MONTHS = [
	'jan',
	'feb',
	'mar',
	'apr',
	'may',
	'jun',
	'jul',
	'aug',
	'sep',
	'oct',
	'nov',
	'dec'
];

export function parseTournaments(html: string, now = Date.now()): Tournament[] {
	// Row by row, so one competition ianseo has written oddly costs that competition and no other.
	return readEach(rows(html), (row) => {
		const toId = attr(row.attrs, 'onclick')?.match(/toId=(\d+)/)?.[1];
		// The secondary rows repeat a competition for the narrow layout, so they would double the list.
		if (!toId || hasClass(row.attrs, 'results-secondary-lines')) return null;

		const columns = cells(row.html);
		const column = (n: number, wide = false) =>
			columns.find(
				(cell) => hasClass(cell.attrs, `column${n}`) && (!wide || hasClass(cell.attrs, 'mobile-noshow'))
			);

		const name = text(column(3, true)?.html ?? column(2, true)?.html ?? '');
		if (!name) return null;

		const dates = text(column(7)?.html ?? '');
		const span = parseDateSpan(dates, now);
		return {
			toId,
			code: text(column(2, true)?.html ?? ''),
			name,
			organiser: text(column(4)?.html ?? ''),
			country: flagOf(column(5)?.html ?? ''),
			city: text(column(6)?.html ?? ''),
			dates,
			from: span.from,
			to: span.to,
			updatedAt: parseUpdated(text(column(8)?.html ?? ''), now),
			// The ianseo team run the events nobody local organises: the championships and the games.
			major: hasClass(row.attrs, 'ianseo')
		};
	});
}

/**
 * `27 Feb`, `25-28 Aug`, `11 Jul - 11 Nov`, `31 Oct 2026 - 20 Feb 2027`. Where no year is printed
 * the list means the nearest one, which is what a rolling window of competitions is.
 */
export function parseDateSpan(dates: string, now: number): { from: number | null; to: number | null } {
	const parts = dates.split(/\s+-\s+/);
	if (parts.length === 2) {
		const from = parseDay(parts[0], now);
		const to = parseDay(parts[1], now, from);
		return { from, to };
	}

	const short = dates.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]{3})/);
	if (short) {
		const to = parseDay(`${short[2]} ${short[3]}`, now);
		// The first day borrows the month and the year of the last: `30-2 Sep` is not a thing ianseo prints.
		return { from: parseDay(`${short[1]} ${short[3]}`, now, to), to };
	}

	const day = parseDay(dates, now);
	return { from: day, to: day };
}

/** `31 Oct 2026`, or `31 Oct` resolved against `near` if given and against `now` otherwise. */
function parseDay(value: string, now: number, near?: number | null): number | null {
	const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?(?:\s+(\d{4}))?$/);
	if (!match) return null;
	const month = MONTHS.indexOf(match[2].toLowerCase());
	if (month < 0) return null;
	const day = Number(match[1]);

	if (match[3]) return Date.UTC(Number(match[3]), month, day);

	const anchor = new Date(near ?? now);
	// The candidate years either side are tried too, so a December date read in January is not a year out.
	const year = anchor.getUTCFullYear();
	let best: number | null = null;
	for (const candidate of [year - 1, year, year + 1]) {
		const stamp = Date.UTC(candidate, month, day);
		if (best === null || Math.abs(stamp - (near ?? now)) < Math.abs(best - (near ?? now))) best = stamp;
	}
	return best;
}

/** `22 Aug 16:16`, `Today 13:51`, `Yesterday 09:34`. Times are UTC, which the list says in its own header. */
export function parseUpdated(value: string, now: number): number | null {
	const clock = value.match(/(\d{1,2}):(\d{2})/);
	if (!clock) return null;
	const minutes = Number(clock[1]) * 3600000 + Number(clock[2]) * 60000;

	const relative = value.match(/^(Today|Yesterday)/i);
	if (relative) {
		const midnight = Date.UTC(
			new Date(now).getUTCFullYear(),
			new Date(now).getUTCMonth(),
			new Date(now).getUTCDate()
		);
		return midnight + minutes - (relative[1].toLowerCase() === 'yesterday' ? 86400000 : 0);
	}

	const day = parseDay(value.replace(/\s+\d{1,2}:\d{2}.*$/, ''), now);
	return day === null ? null : day + minutes;
}
