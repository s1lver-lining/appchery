/**
 * The words of a PDF, and where on the page each of them was printed.
 *
 * ianseo prints a competition's schedule and nothing else: there is no page and no document behind
 * it, so a schedule an archer can read in the app has to come out of the PDF itself. That is a
 * narrow job, and this is a narrow reader for it rather than a PDF library: the files in question
 * are written by one generator, out of the standard Latin fonts, with every string in one filter.
 *
 * What it does not do is as important as what it does. It lays nothing out, resolves no cross
 * reference table, and knows nothing of embedded fonts. Anything it cannot read comes back empty,
 * which is what the reader above it needs in order to hand the archer the PDF instead.
 */

export type TextItem = {
	x: number;
	y: number;
	text: string;
	bold: boolean;
	italic: boolean;
};

/** One content stream's worth of text, which for everything ianseo prints is one page. */
export type TextPage = { items: TextItem[] };

export async function readPdfText(bytes: Uint8Array): Promise<TextPage[]> {
	const raw = latin1(bytes);
	const fonts = fontsOf(raw);
	const pages: TextPage[] = [];

	for (const stream of streams(bytes, raw)) {
		const content = await inflate(stream);
		if (!content) continue;
		const items = itemsOf(latin1(content), fonts);
		if (items.length > 0) pages.push({ items });
	}
	return pages;
}

/** Byte for byte, because everything read below is either an ASCII keyword or a byte to be decoded. */
function latin1(bytes: Uint8Array): string {
	let out = '';
	// In blocks, because a single spread of three hundred thousand arguments overflows the stack.
	for (let at = 0; at < bytes.length; at += 0x8000) {
		out += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
	}
	return out;
}

/**
 * Every `stream ... endstream` in the file, in the order it was written.
 *
 * Taken by scanning rather than through the cross reference table: the table is the one part of a
 * PDF that is routinely a stream itself, and reading it would mean writing most of a PDF library to
 * find out where the pages are. The order pages come out in is therefore the order they were
 * written in, which is the order a generator writes them.
 */
function streams(bytes: Uint8Array, raw: string): Uint8Array[] {
	const found: Uint8Array[] = [];
	const opens = raw.matchAll(/stream\r?\n/g);

	for (const open of opens) {
		// The word is inside `endstream` as well, and what follows that one is the next object.
		if (raw.slice(Math.max(0, open.index - 3), open.index) === 'end') continue;
		const from = open.index + open[0].length;
		const close = raw.indexOf('endstream', from);
		if (close < 0) continue;
		found.push(bytes.subarray(from, close));
	}
	return found;
}

/**
 * The one filter ianseo's own reports are written with. Anything else comes back as nothing at all.
 *
 * Read chunk by chunk and kept whatever arrived, rather than asked for whole: a stream is written
 * with the newline before `endstream` inside it, and a decompressor handed those spare bytes throws
 * away everything it had already decoded rather than mentioning them.
 */
async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
	const parts: Uint8Array[] = [];
	try {
		const reader = new Blob([bytes as BlobPart])
			.stream()
			.pipeThrough(new DecompressionStream('deflate'))
			.getReader();
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) parts.push(value);
		}
	} catch {
		// An image, a font, or anything else this reader has no business in.
	}
	if (parts.length === 0) return null;

	const whole = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
	let at = 0;
	for (const part of parts) {
		whole.set(part, at);
		at += part.length;
	}
	return whole;
}

/**
 * Which typeface each `/F1` of a content stream stands for, which is the only way to tell a heading
 * from a line under it: the PDF says nothing about what a run of text is, only how it is drawn.
 */
function fontsOf(raw: string): Map<string, string> {
	const objects = new Map<string, string>();
	for (const object of raw.matchAll(/(\d+)\s+\d+\s+obj\b([\s\S]{0,4000}?)(?:stream|endobj)/g)) {
		const base = object[2].match(/\/BaseFont\s*\/([^\s/[\]<>]+)/);
		if (base) objects.set(object[1], base[1]);
	}

	const fonts = new Map<string, string>();
	for (const dictionary of raw.matchAll(/\/Font\s*<<([^>]*)>>/g)) {
		for (const entry of dictionary[1].matchAll(/\/(\w+)\s+(\d+)\s+\d+\s+R/g)) {
			const base = objects.get(entry[2]);
			if (base) fonts.set(entry[1], base);
		}
	}
	// A font may name itself instead, which is how the reports this was written for are put together.
	for (const named of raw.matchAll(/\/BaseFont\s*\/([^\s/[\]<>]+)[\s\S]{0,300}?\/Name\s*\/(\w+)/g)) {
		if (!fonts.has(named[2])) fonts.set(named[2], named[1]);
	}
	return fonts;
}

/** The characters WinAnsi puts where Latin 1 has nothing, which is where the punctuation lives. */
const WINANSI: Record<number, string> = {
	0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
	0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘',
	0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜',
	0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ'
};

function decode(bytes: string): string {
	let out = '';
	for (let at = 0; at < bytes.length; at++) {
		const code = bytes.charCodeAt(at);
		out += WINANSI[code] ?? bytes[at];
	}
	return out;
}

type Token = { kind: 'number' | 'string' | 'name' | 'operator' | 'open' | 'close'; value: string };

/**
 * Matched from where the scan has got to rather than against the rest of the stream: a content
 * stream is twenty thousand characters and a token is one or two, so cutting the tail off at every
 * one of them copied the page a few thousand times over to read it once.
 */
const NAME = /\/([^\s/[\]<>(){}%]*)/y;
const NUMBER = /[-+]?[\d.]+/y;
const OPERATOR = /[^\s/[\]<>(){}%]+/y;

function take(pattern: RegExp, content: string, at: number): RegExpExecArray {
	pattern.lastIndex = at;
	return pattern.exec(content)!;
}

/**
 * A content stream as its operands and operators. Strings are taken whole here rather than by a
 * pattern, because a bracket inside one is written as a bracket and a pattern reading to the first
 * closing one cuts a competition's own words in half.
 */
function* tokens(content: string): Generator<Token> {
	let at = 0;
	while (at < content.length) {
		const character = content[at];
		if (/\s/.test(character)) {
			at++;
		} else if (character === '%') {
			while (at < content.length && content[at] !== '\n' && content[at] !== '\r') at++;
		} else if (character === '(') {
			let depth = 1;
			let value = '';
			at++;
			while (at < content.length && depth > 0) {
				const one = content[at];
				if (one === '\\') {
					value += one + (content[at + 1] ?? '');
					at += 2;
					continue;
				}
				if (one === '(') depth++;
				if (one === ')' && --depth === 0) break;
				value += one;
				at++;
			}
			at++;
			yield { kind: 'string', value: unescape(value) };
		} else if (character === '<' && content[at + 1] !== '<') {
			const close = content.indexOf('>', at);
			const digits = content.slice(at + 1, close < 0 ? undefined : close).replace(/\s/g, '');
			at = close < 0 ? content.length : close + 1;
			yield { kind: 'string', value: fromHex(digits) };
		} else if (character === '[' || character === ']') {
			at++;
			yield { kind: character === '[' ? 'open' : 'close', value: character };
		} else if (character === '/') {
			const match = take(NAME, content, at);
			at += match[0].length;
			yield { kind: 'name', value: match[1] };
		} else if (/[-+.\d]/.test(character)) {
			const match = take(NUMBER, content, at);
			at += match[0].length;
			yield { kind: 'number', value: match[0] };
		} else if (character === '<' || character === '>') {
			// A dictionary, which nothing here reads into: stepped over so its contents are not operands.
			at += 2;
		} else {
			const match = take(OPERATOR, content, at);
			at += match[0].length;
			yield { kind: 'operator', value: match[0] };
		}
	}
}

function unescape(value: string): string {
	return value.replace(/\\(\r\n|[\r\n]|[0-7]{1,3}|.)/g, (whole, body: string) => {
		if (/^[\r\n]/.test(body)) return '';
		if (/^[0-7]/.test(body)) return String.fromCharCode(parseInt(body, 8) & 0xff);
		return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[body] ?? body;
	});
}

function fromHex(digits: string): string {
	const even = digits.length % 2 ? `${digits}0` : digits;
	let out = '';
	for (let at = 0; at < even.length; at += 2) out += String.fromCharCode(parseInt(even.slice(at, at + 2), 16));
	return out;
}

/**
 * Where each run of text was drawn. Only the text matrix is followed: a run's width is a question
 * for the font metrics, and nothing here needs to know where a line ends, only where it starts.
 */
function itemsOf(content: string, fonts: Map<string, string>): TextItem[] {
	const items: TextItem[] = [];
	let font = '';
	let leading = 0;
	let line = [1, 0, 0, 1, 0, 0];
	let where = line;
	const operands: Token[] = [];

	const move = (tx: number, ty: number) => {
		line = [line[0], line[1], line[2], line[3], line[4] + tx * line[0] + ty * line[2], line[5] + tx * line[1] + ty * line[3]];
		where = line;
	};
	const numbers = () => operands.filter((one) => one.kind === 'number').map((one) => Number(one.value));

	const show = (text: string) => {
		if (!text) return;
		const base = fonts.get(font) ?? '';
		const x = where[4];
		const y = where[5];
		const last = items.at(-1);
		// Two runs drawn without moving between them are one word cut in two by a kerning number.
		if (last && last.x === x && last.y === y) last.text += text;
		else items.push({ x, y, text, bold: /bold/i.test(base), italic: /italic|oblique/i.test(base) });
	};

	for (const token of tokens(content)) {
		if (token.kind !== 'operator') {
			operands.push(token);
			continue;
		}
		const values = numbers();
		switch (token.value) {
			case 'BT':
				line = where = [1, 0, 0, 1, 0, 0];
				break;
			case 'Tf':
				font = operands.find((one) => one.kind === 'name')?.value ?? font;
				break;
			case 'TL':
				leading = values[0] ?? leading;
				break;
			case 'TD':
				leading = -(values[1] ?? 0);
				move(values[0] ?? 0, values[1] ?? 0);
				break;
			case 'Td':
				move(values[0] ?? 0, values[1] ?? 0);
				break;
			case 'Tm':
				if (values.length >= 6) line = where = values.slice(0, 6);
				break;
			case 'T*':
				move(0, -leading);
				break;
			case 'Tj':
				show(decode(operands.findLast((one) => one.kind === 'string')?.value ?? ''));
				break;
			case "'":
			case '"':
				move(0, -leading);
				show(decode(operands.findLast((one) => one.kind === 'string')?.value ?? ''));
				break;
			case 'TJ':
				show(
					decode(
						operands
							.filter((one) => one.kind === 'string')
							.map((one) => one.value)
							.join('')
					)
				);
				break;
		}
		operands.length = 0;
	}
	return items;
}
