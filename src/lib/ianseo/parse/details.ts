import type { Competition, CompetitionDocument } from '../types';
import { decode, tags, text } from './html';

/**
 * A competition's own page: the heading it is published under, and every document it has released.
 * The documents are what the app reads afterwards, so this is the index the rest of the feature
 * navigates by. Nothing here guesses at what a document holds: ianseo titles them itself, in the
 * organiser's own words, and a federation's class codes are its own business.
 */
export function parseCompetition(toId: string, html: string): Competition {
	const heading = tags(html, 'div').find((tag) => /results-header-center/.test(tag.attrs));
	const lines = heading
		? tags(heading.html, 'div')
				.flatMap((line) => line.html.split(/<br\s*\/?>/i))
				.map(text)
				.filter(Boolean)
		: [];

	const documents: CompetitionDocument[] = [];
	for (const panel of tags(html, 'div').filter((tag) => /results-panel"/.test(tag.attrs))) {
		const group = tags(panel.html, 'div').find((tag) => /results-panel-head/.test(tag.attrs));
		for (const item of tags(panel.html, 'div').filter((tag) => /results-item-container/.test(tag.attrs))) {
			const document = readDocument(item.html, text(group?.html ?? ''));
			if (document) documents.push(document);
		}
	}

	return {
		toId,
		name: lines[0] ?? '',
		organiser: lines[1] ?? '',
		where: lines.slice(2).join(', '),
		documents
	};
}

function readDocument(html: string, group: string): CompetitionDocument | null {
	const links = tags(html, 'a');
	const page = links.find((link) => /href="[^"]*\.php/i.test(link.attrs));
	if (!page) return null;

	const path = href(page.attrs);
	const pdf = links.find((link) => /href="[^"]*\.pdf/i.test(link.attrs));
	const stamp = pdf ? href(pdf.attrs).match(/time=([^&]+)/)?.[1] : null;

	return {
		path,
		pdfPath: pdf ? href(pdf.attrs) : null,
		title: text(page.html),
		group,
		updatedAt: stamp ? parseStamp(stamp) : null
	};
}

function href(attrs: string): string {
	return decode(attrs.match(/href\s*=\s*"([^"]*)"/i)?.[1] ?? '');
}

/** `2026-02-23+15%3A07%3A42`, which is ianseo's own clock and so is read as the UTC the list prints. */
export function parseStamp(value: string): number | null {
	const match = decodeURIComponent(value.replace(/\+/g, ' ')).match(
		/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
	);
	if (!match) return null;
	const [, year, month, day, hour, minute, second] = match.map(Number);
	return Date.UTC(year, month - 1, day, hour, minute, second);
}

/** The most recent thing ianseo published for a competition, which is what "it changed" means. */
export function lastPublished(documents: CompetitionDocument[]): number | null {
	const stamps = documents.map((document) => document.updatedAt).filter((at): at is number => at !== null);
	return stamps.length > 0 ? Math.max(...stamps) : null;
}
