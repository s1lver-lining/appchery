import { decode, tags, text } from '$lib/ianseo/parse/html';
import type { Entry } from './types';

/**
 * Inscript'Arc, the platform most French clubs take entries through.
 *
 * It carries no results and no town, so it is never a source of competitions on its own: what it has
 * that nothing else does is the way in. An archer who has found a competition wants to enter it, and
 * that is a link the app can hand them rather than a search they have to go and do.
 */

/** Each competition is one `<div class="block-competition">`, and the whole country fits in one page. */
export function parseEntries(html: string): Entry[] {
	const found: Entry[] = [];

	for (const block of tags(html, 'div')) {
		if (!/block-competition/.test(block.attrs)) continue;

		const links = tags(block.html, 'a')
			.map((link) => ({
				label: text(link.html),
				href: absolute(decode(link.attrs.match(/href\s*=\s*"([^"]*)"/i)?.[1] ?? ''))
			}))
			.filter((link) => link.label && link.href);
		if (links.length === 0) continue;

		const promoter = tags(block.html, 'p').find((tag) => /promoter/.test(tag.attrs));
		const dates = text(tags(block.html, 'p').find((tag) => /dates/.test(tag.attrs))?.html ?? '');
		const span = parseDates(dates);

		found.push({
			// The subdomain is the competition: every one of its pages hangs off it.
			site: new URL(links[0].href).origin,
			name: text(tags(block.html, 'h2')[0]?.html ?? ''),
			club: clubOf(promoter?.html ?? ''),
			affiliation: text(promoter?.html ?? '').match(/n°\s*(\d+)/)?.[1] ?? null,
			dates,
			from: span.from,
			to: span.to,
			links
		});
	}
	return found;
}

/** The platform writes its links without a scheme, which is not a thing a phone can open. */
function absolute(href: string): string {
	const full = href.startsWith('//') ? `https:${href}` : href;
	// A page on the web or nothing at all: this address was typed by whoever runs the competition.
	return /^https?:\/\//i.test(full) ? full : '';
}

/** "Organisé par : Cie D'arc De Brouchy (Affiliation FFTA n°0780305)", less the parts that are labels. */
function clubOf(html: string): string {
	return text(html.replace(/<span>[\s\S]*?<\/span>/g, ''))
		.replace(/^Organisé par\s*:\s*/i, '')
		.trim();
}

/** `le 30/08/2026`, or `du 26/08/2026 au 29/08/2026`. */
export function parseDates(dates: string): { from: number | null; to: number | null } {
	const days = [...dates.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map((match) =>
		Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
	);
	if (days.length === 0) return { from: null, to: null };
	return { from: days[0], to: days[days.length - 1] };
}
