import { decode, tags, text } from '$lib/ianseo/parse/html';
import type { Departement, FftaCompetition, FftaDetail } from './types';

/**
 * The French federation's competition calendar, which is the half of French archery ianseo never
 * sees: club and departmental shoots, run on the federation's own software.
 *
 * It publishes pages rather than data, like ianseo, so this is the same kind of reading. Results are
 * a PDF and only ever a PDF, so the app links to them rather than pretending it can redraw them.
 */

const MONTHS = [
	'janvier',
	'février',
	'mars',
	'avril',
	'mai',
	'juin',
	'juillet',
	'août',
	'septembre',
	'octobre',
	'novembre',
	'décembre'
];

/** Each competition is one `<article class="competition_item">`, whatever the page around it holds. */
export function parseCompetitions(html: string): FftaCompetition[] {
	const found = new Map<string, FftaCompetition>();

	for (const article of tags(html, 'article')) {
		if (!/competition_item/.test(article.attrs)) continue;

		const id = article.html.match(/\/epreuve\/(\d+)/)?.[1];
		if (!id) continue;

		const fields = tags(article.html, 'div').filter((tag) => /field__item/.test(tag.attrs));
		const dates = text(
			tags(article.html, 'div').find((tag) => /competition_item__dates/.test(tag.attrs))?.html ?? ''
		);
		const span = parseDates(dates);

		// The row prints the club and, in brackets after it, the town it shoots in.
		const infos = tags(article.html, 'div').find((tag) =>
			/competition_item__infos/.test(tag.attrs)
		);
		const where = tags(infos?.html ?? '', 'small').at(-1);
		const club = text((infos?.html ?? '').replace(/<small>[\s\S]*?<\/small>/g, '').split('<a')[0])
			.replace(/^(?:[^|]*?)(?=[A-ZÀ-Þ0-9])/, '')
			.trim();

		found.set(id, {
			id,
			name: text(fields.find((field) => /field--name-label/.test(field.attrs))?.html ?? ''),
			dates,
			from: span.from,
			to: span.to,
			discipline: text(fields.find((field) => /field-discipline/.test(field.attrs))?.html ?? ''),
			kind: text(fields.find((field) => /field-type-championnat/.test(field.attrs))?.html ?? ''),
			club: clubOf(infos?.html ?? ''),
			town: text(where?.html ?? '').replace(/^\(|\)$/g, ''),
			resultsPdf: linkTo(article.html, 'Résultats'),
			mandatPdf: linkTo(article.html, 'Mandat')
		});
	}
	// Keyed by id because the page repeats a competition once per line of its own layout.
	return [...found.values()];
}

/** The organising club, which is the one line of the row that is not a labelled field. */
function clubOf(infos: string): string {
	for (const span of tags(infos, 'span')) {
		if (/field__item/.test(span.html)) continue;
		const whole = text(span.html.replace(/<small>[\s\S]*?<\/small>/g, ''));
		if (whole) return whole;
	}
	return '';
}

function linkTo(html: string, label: string): string | null {
	for (const link of tags(html, 'a')) {
		if (text(link.html) !== label) continue;
		const href = decode(link.attrs.match(/href\s*=\s*"([^"]*)"/i)?.[1] ?? '');
		if (href) return href;
	}
	return null;
}

/** `Le 23 août 2026`, `Du 25 au 28 août 2026`, `Du 28 août au 3 septembre 2026`. */
export function parseDates(dates: string): { from: number | null; to: number | null } {
	const one = dates.match(/^Le\s+(\d{1,2})\s+([^\s]+)\s+(\d{4})/i);
	if (one) {
		const day = dayOf(one[1], one[2], one[3]);
		return { from: day, to: day };
	}

	const across = dates.match(/^Du\s+(\d{1,2})\s+([^\s]+)\s+au\s+(\d{1,2})\s+([^\s]+)\s+(\d{4})/i);
	if (across) {
		const to = dayOf(across[3], across[4], across[5]);
		// The first day carries no year of its own, and a span that crosses new year starts a year earlier.
		const from = dayOf(across[1], across[2], across[5]);
		return {
			from: from !== null && to !== null && from > to ? dayOf(across[1], across[2], String(Number(across[5]) - 1)) : from,
			to
		};
	}

	const within = dates.match(/^Du\s+(\d{1,2})\s+au\s+(\d{1,2})\s+([^\s]+)\s+(\d{4})/i);
	if (within) {
		return {
			from: dayOf(within[1], within[3], within[4]),
			to: dayOf(within[2], within[3], within[4])
		};
	}

	return { from: null, to: null };
}

function dayOf(day: string, month: string, year: string): number | null {
	const index = MONTHS.indexOf(month.toLowerCase().normalize('NFC'));
	if (index < 0) return null;
	return Date.UTC(Number(year), index, Number(day));
}

/**
 * The départements the FFTA's own filter offers. Read rather than shipped: the filter wants a
 * position in its list where everybody else says `35`, and that positioning is the FFTA's to change.
 */
export function parseDepartements(html: string): Departement[] {
	const select = html.match(/<select[^>]*name="dep\[\]"[^>]*>([\s\S]*?)<\/select>/i);
	if (!select) return [];

	const found: Departement[] = [];
	for (const option of select[1].matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/gi)) {
		const label = decode(option[2]).trim();
		const split = label.match(/^(\w+)\s*-\s*(.+)$/);
		if (!split || !option[1]) continue;
		found.push({ code: split[1], name: split[2], value: option[1] });
	}
	return found;
}

/** How many pages the calendar has for a query, so the app knows when to stop asking for more. */
export function pageCount(html: string): number {
	const pages = [...html.matchAll(/[?&]page=(\d+)/g)].map((match) => Number(match[1]));
	return pages.length === 0 ? 1 : Math.max(...pages) + 1;
}

/**
 * The labels a competition's own page prints its facts under, in the order it prints them. The page
 * is one run of text once the markup is out, so each label reaches as far as the next one does.
 */
const LABELS = [
	'Discipline',
	'Championnat',
	'Duels',
	'Comité régional',
	'Comité départemental',
	'Organisateur',
	'Lieu',
	'Dans la ville',
	'Tel',
	'Mail',
	'Site'
];

/** The competition's own page: where it is, and which committee it belongs to. */
export function parseDetail(id: string, html: string): FftaDetail {
	const whole = text(html);
	const value = (label: string) => {
		const at = whole.indexOf(`${label} :`);
		if (at < 0) return null;
		const from = at + label.length + 2;
		const ends = LABELS.map((other) => whole.indexOf(`${other} :`, from))
			.filter((index) => index > 0)
			.concat(whole.indexOf('Dans la ville', from) > 0 ? [whole.indexOf('Dans la ville', from)] : []);
		const to = ends.length > 0 ? Math.min(...ends) : whole.length;
		return whole.slice(from, to).trim() || null;
	};

	const address = whole.match(/Dans la ville\s+(\d{5})\s+(.+?)\s+FRANCE/i);

	return {
		id,
		region: value('Comité régional'),
		departement: value('Comité départemental'),
		organiser: value('Organisateur'),
		venue: value('Lieu'),
		postcode: address?.[1] ?? null,
		town: address?.[2]?.trim() ?? null
	};
}
