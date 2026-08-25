/**
 * The small amount of HTML reading the ianseo pages need, done with string work rather than a
 * parser: these run under vitest's node environment and inside a Capacitor webview alike, and
 * neither is a place to depend on DOMParser being the same thing.
 */

const ENTITIES: Record<string, string> = {
	nbsp: ' ',
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	deg: '°'
};

export function decode(text: string): string {
	// `nbsp` is allowed to arrive unclosed because ianseo writes it that way in its result lines.
	return text.replace(/&(#x?[0-9a-fA-F]+;|\w+;|nbsp)/g, (whole, body: string) => {
		body = body.replace(/;$/, '');
		if (body[0] === '#') {
			const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
			return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
		}
		return ENTITIES[body.toLowerCase()] ?? whole;
	});
}

/** Tags out, entities in, runs of space collapsed: what the cell reads as on the page. */
export function text(html: string): string {
	return decode(html.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		// A tag between a word and its comma became a space, and a space before a comma is a typo.
		.replace(/ +,/g, ',')
		.trim();
}

export type Tag = { attrs: string; html: string };

/**
 * Every `<name ...>...</name>` at any depth, in document order, counting nesting: the ianseo pages
 * wrap panels in panels, and a scan that stopped at the first closing tag read a third of one.
 */
export function tags(html: string, name: string): Tag[] {
	const found: Tag[] = [];
	const opening = new RegExp(`<${name}\\b([^>]*?)(/?)>`, 'gi');
	const either = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, 'gi');

	for (const start of html.matchAll(opening)) {
		if (start[2] === '/') continue;
		const from = start.index + start[0].length;
		either.lastIndex = from;
		let depth = 1;
		for (const step of matchesFrom(html, either)) {
			if (step[2] === '/') continue;
			depth += step[1] === '/' ? -1 : 1;
			if (depth === 0) {
				found.push({ attrs: start[1], html: html.slice(from, step.index) });
				break;
			}
		}
	}
	return found;
}

function* matchesFrom(html: string, pattern: RegExp) {
	let step: RegExpExecArray | null;
	while ((step = pattern.exec(html)) !== null) yield step;
}

export function attr(attrs: string, name: string): string | null {
	const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
	return match ? decode(match[1]) : null;
}

export function hasClass(attrs: string, name: string): boolean {
	return (attr(attrs, 'class') ?? '').split(/\s+/).includes(name);
}

export type Cell = Tag & {
	header: boolean;
	/** Tables drawn inside the cell, kept whole and cut out of its own html: a bracket puts the set scores of a match in one. */
	nested: string[];
};

/**
 * The `<td>` and `<th>` of one row, in order, so a column index means the same for every row.
 *
 * Tables nested inside a cell are stepped over rather than read into: an elimination bracket draws
 * the set scores of a match as a table of its own, and counting its cells as the row's own put every
 * athlete after it in the wrong round.
 */
export function cells(row: string): Cell[] {
	const found: Cell[] = [];
	const token = /<(\/?)(table|td|th)\b([^>]*?)(\/?)>/gi;

	let depth = 0;
	let opened = -1;
	let current: { header: boolean; attrs: string; from: number; nested: string[] } | null = null;
	const cut: [number, number][] = [];

	let match: RegExpExecArray | null;
	while ((match = token.exec(row)) !== null) {
		const [whole, closing, name, attrs, selfClosing] = match;
		if (selfClosing === '/') continue;

		if (name.toLowerCase() === 'table') {
			if (closing) {
				depth = Math.max(0, depth - 1);
				if (depth === 0 && opened >= 0) {
					current?.nested.push(row.slice(opened, match.index + whole.length));
					cut.push([opened, match.index + whole.length]);
					opened = -1;
				}
			} else {
				if (depth === 0) opened = match.index;
				depth++;
			}
			continue;
		}
		// Anything inside a nested table belongs to that table, not to the row being read.
		if (depth > 0) continue;

		if (closing) {
			if (!current) continue;
			found.push({
				header: current.header,
				attrs: current.attrs,
				html: without(row.slice(current.from, match.index), cut, current.from),
				nested: current.nested
			});
			cut.length = 0;
			current = null;
		} else {
			current = {
				header: name.toLowerCase() === 'th',
				attrs,
				from: match.index + whole.length,
				nested: []
			};
		}
	}
	return found;
}

/** The cell's own html with the tables that were lifted out of it removed, offsets being row wide. */
function without(html: string, ranges: [number, number][], from: number): string {
	let out = '';
	let at = 0;
	for (const [start, end] of ranges) {
		// A space in place of what was lifted out, so the words either side of it do not run together.
		out += html.slice(at, Math.max(at, start - from)) + ' ';
		at = Math.max(at, end - from);
	}
	return out + html.slice(at);
}

export function rows(html: string): Tag[] {
	return tags(html, 'tr');
}

/**
 * The country an ianseo cell carries, which is drawn as a flag rather than written: the code is on
 * the image and the full name is its tooltip.
 */
export function flagOf(html: string): { code: string; name: string } | null {
	const image = html.match(/<img\b([^>]*)>/i);
	if (!image) return null;
	const code = attr(image[1], 'alt');
	if (!code || !/^[A-Za-z]{2,4}$/.test(code)) return null;
	return { code: code.toUpperCase(), name: attr(image[1], 'title') ?? code.toUpperCase() };
}
