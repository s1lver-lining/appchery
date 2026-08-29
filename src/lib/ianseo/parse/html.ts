/**
 * The small amount of HTML reading the ianseo pages need, done with string work rather than a
 * parser: these run under vitest's node environment and inside a Capacitor webview alike, and
 * neither is a place to depend on DOMParser being the same thing.
 */

/**
 * The names the Latin 1 characters are written under, in code order from 160. ianseo publishes what
 * organisers type, so a French club road is `rue de l&eacute;glise` and a German one is full of
 * `&uuml;`: without these the app prints the entity at the archer instead of the letter.
 */
const LATIN1 =
	'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn ' +
	'sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave ' +
	'Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ' +
	'ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN ' +
	'szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute ' +
	'icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml ' +
	'yacute thorn yuml';

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	euro: '€',
	hellip: '…',
	ndash: '–',
	mdash: '—',
	lsquo: '‘',
	rsquo: '’',
	ldquo: '“',
	rdquo: '”',
	bull: '•',
	...Object.fromEntries(LATIN1.split(' ').map((name, index) => [name, String.fromCharCode(160 + index)])),
	// A plain space rather than the unbreakable one it stands for: ianseo pads its cells with these,
	// and a name read back with an invisible different space in it never matches the one followed.
	nbsp: ' '
};

export function decode(text: string): string {
	// `nbsp` is allowed to arrive unclosed because ianseo writes it that way in its result lines.
	return text.replace(/&(#x?[0-9a-fA-F]+;|[A-Za-z][A-Za-z0-9]*;|nbsp)/g, (whole, body: string) => {
		const name = body.replace(/;$/, '');
		if (name[0] === '#') {
			const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
			// Bounded at the top of Unicode as well as at nothing, because fromCodePoint throws past it
			// and a decoder that throws takes the whole page with it: a competition's own name is read
			// outside the guard that drops one unreadable row, so one bad entity in it closed the page.
			const real = Number.isFinite(code) && code > 0 && code <= 0x10ffff;
			return real ? String.fromCodePoint(code) : whole;
		}
		// Case matters: &Eacute; and &eacute; are two different letters, one of them a capital.
		return ENTITIES[name] ?? whole;
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
