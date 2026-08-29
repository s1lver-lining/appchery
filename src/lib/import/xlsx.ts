/**
 * Reading a spreadsheet without a spreadsheet library.
 *
 * An .xlsx is a ZIP of XML, and the part of it a data export uses is small: a workbook listing the
 * sheets, one XML file per sheet, and a shared string table. Pulling in a full parser would add a
 * megabyte to a phone app to read a file the archer opens once, so the few hundred lines it takes
 * are kept here instead.
 *
 * Everything below is deliberately forgiving. This reader is pointed at files produced by other
 * people's software: a sheet may be stored uncompressed, a cell may carry an inline string instead
 * of a shared one, a row may skip columns entirely, and a future export may add sheets nobody has
 * seen. None of that is an error, so none of it throws.
 */

import { LIMITS } from './limits';

export interface SheetTable {
	name: string;
	/** Header labels exactly as written in the first non-empty row. */
	headers: string[];
	/** One entry per data row, keyed by header label. Missing cells read as empty strings. */
	rows: Record<string, string>[];
}

export class WorkbookError extends Error {}

const XLSX_MAGIC = 0x04034b50;

/** True when the bytes start with a local ZIP header, which every .xlsx does. */
export function looksLikeZip(bytes: Uint8Array): boolean {
	return bytes.length > 4 && new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true) === XLSX_MAGIC;
}

export async function readWorkbook(input: ArrayBuffer | Uint8Array): Promise<SheetTable[]> {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	if (!looksLikeZip(bytes)) throw new WorkbookError('notAWorkbook');
	if (bytes.length > LIMITS.fileBytes) throw new WorkbookError('tooLarge');

	let files: Map<string, Uint8Array>;
	try {
		files = await unzip(bytes);
	} catch {
		throw new WorkbookError('unreadableWorkbook');
	}

	const text = (path: string): string | null => {
		const entry = find(files, path);
		return entry ? new TextDecoder().decode(entry) : null;
	};

	const shared = sharedStrings(text('xl/sharedStrings.xml'));

	// The workbook maps sheet names to relationship ids, and the rels file maps those to paths. Both
	// are optional in practice: a file missing either is still readable by taking the sheet XML in
	// the order it is stored, which is the order Excel writes it.
	const sheets = sheetIndex(text('xl/workbook.xml'), text('xl/_rels/workbook.xml.rels'), files);

	const tables: SheetTable[] = [];
	for (const { name, path } of sheets.slice(0, LIMITS.sheets)) {
		const xml = text(path);
		if (xml === null) continue;
		try {
			tables.push(readSheet(name, xml, shared));
		} catch {
			// One unreadable sheet must not cost the archer the other four.
			tables.push({ name, headers: [], rows: [] });
		}
	}
	return tables;
}

/* Sheet discovery */

function sheetIndex(
	workbookXml: string | null,
	relsXml: string | null,
	files: Map<string, Uint8Array>
): { name: string; path: string }[] {
	const paths = [...files.keys()]
		.filter((p) => /^xl\/worksheets\/[^/]+\.xml$/i.test(p))
		.sort(comparePaths);

	if (!workbookXml) return paths.map((path, i) => ({ name: `Sheet${i + 1}`, path }));

	const rels = new Map<string, string>();
	for (const match of (relsXml ?? '').matchAll(/<Relationship\b[^>]*>/g)) {
		const id = attribute(match[0], 'Id');
		const target = attribute(match[0], 'Target');
		if (id && target) rels.set(id, normalisePath(target));
	}

	const found: { name: string; path: string }[] = [];
	let fallbackIndex = 0;
	for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
		const name = decodeEntities(attribute(match[0], 'name') ?? `Sheet${found.length + 1}`);
		const rid = attribute(match[0], 'r:id') ?? attribute(match[0], 'relationshipId');
		const target = rid ? rels.get(rid) : undefined;
		// A sheet whose relationship is missing falls back to the next unclaimed sheet XML rather
		// than being dropped, because losing a whole sheet loses the archer's scores.
		const path = target && find(files, target) ? target : paths[fallbackIndex];
		if (!path) continue;
		fallbackIndex = Math.max(fallbackIndex, paths.indexOf(path) + 1);
		found.push({ name, path });
	}
	return found.length > 0 ? found : paths.map((path, i) => ({ name: `Sheet${i + 1}`, path }));
}

/** Sorts sheet1, sheet2, sheet10 numerically, which a plain string sort gets wrong. */
function comparePaths(a: string, b: string): number {
	const n = (p: string) => Number(p.match(/(\d+)\.xml$/i)?.[1] ?? 0);
	return n(a) - n(b) || a.localeCompare(b);
}

function normalisePath(target: string): string {
	const clean = target.replace(/^\/+/, '').replace(/^xl\//, '');
	return `xl/${clean}`;
}

function find(files: Map<string, Uint8Array>, path: string): Uint8Array | undefined {
	const direct = files.get(path);
	if (direct) return direct;
	const wanted = path.toLowerCase();
	for (const [name, data] of files) if (name.toLowerCase() === wanted) return data;
	return undefined;
}

/* Cell values */

function sharedStrings(xml: string | null): string[] {
	if (!xml) return [];
	const strings: string[] = [];
	for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
		strings.push(joinText(match[1]));
	}
	return strings;
}

/** A string can be split over several runs, and rich text puts formatting tags between them. */
function joinText(fragment: string): string {
	let out = '';
	for (const match of fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += decodeEntities(match[1]);
	return out;
}

function readSheet(name: string, xml: string, shared: string[]): SheetTable {
	const rows: string[][] = [];
	for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
		const declared = Number(attribute(`<row${rowMatch[1]}>`, 'r') ?? 0);
		const cells: string[] = [];
		for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
			const attrs = `<c${cellMatch[1]}>`;
			const reference = attribute(attrs, 'r');
			const index = reference ? columnIndex(reference) : cells.length;
			if (index >= LIMITS.columnsPerRow) continue;
			cells[index] = cellValue(attrs, cellMatch[2] ?? '', shared).slice(0, LIMITS.cellChars);
		}
		// Row numbers are authoritative when present: a sheet may skip empty rows entirely, and
		// collapsing them would pair a row of data with the wrong header on a ragged export.
		const at = declared > 0 ? declared - 1 : rows.length;
		// A cell claiming row a million is a claim about the sheet's size, not a row of data, and
		// honouring it would allocate the array it names.
		if (at >= LIMITS.rowsPerSheet) continue;
		rows[at] = cells;
	}

	// Written by row number, so the array is full of holes where the sheet skipped rows entirely.
	const filled: string[][] = [];
	for (let i = 0; i < rows.length; i++) filled.push((rows[i] ?? []).map((cell) => cell ?? ''));
	const headerAt = filled.findIndex((row) => row.some((cell) => (cell ?? '').trim() !== ''));
	if (headerAt === -1) return { name, headers: [], rows: [] };

	const headers = filled[headerAt].map((cell, i) => ((cell ?? '').trim() || `column${i + 1}`));
	const body: Record<string, string>[] = [];
	for (const row of filled.slice(headerAt + 1)) {
		if (!row.some((cell) => (cell ?? '').trim() !== '')) continue;
		const record: Record<string, string> = Object.create(null);
		headers.forEach((header, i) => (record[header] = (row[i] ?? '').trim()));
		// Columns past the header row are kept under a positional name rather than thrown away, so a
		// future export that adds a column before anyone updates the aliases is still recoverable.
		for (let i = headers.length; i < row.length; i++) {
			if ((row[i] ?? '').trim() !== '') record[`column${i + 1}`] = row[i].trim();
		}
		body.push(record);
	}
	return { name, headers, rows: body };
}

function cellValue(attrs: string, body: string, shared: string[]): string {
	const type = attribute(attrs, 't');
	if (type === 'inlineStr') return joinText(body);
	const raw = decodeEntities(body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? '');
	if (type === 's') {
		const value = shared[Number(raw)];
		return value ?? '';
	}
	if (type === 'b') return raw === '1' ? 'true' : 'false';
	if (type === 'e') return '';
	return raw;
}

/** "BC12" is column 54, zero based. */
function columnIndex(reference: string): number {
	let index = 0;
	for (const char of reference) {
		const code = char.toUpperCase().charCodeAt(0);
		if (code < 65 || code > 90) break;
		index = index * 26 + (code - 64);
	}
	return Math.max(0, index - 1);
}

function attribute(tag: string, name: string): string | null {
	const match = tag.match(new RegExp(`\\b${name.replace(':', '\\:')}\\s*=\\s*"([^"]*)"`, 'i'));
	return match ? match[1] : null;
}

function decodeEntities(text: string): string {
	return text.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (whole, code: string) => {
		if (code[0] === '#') {
			const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
			return Number.isFinite(value) ? String.fromCodePoint(value) : whole;
		}
		const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
		return named[code.toLowerCase()] ?? whole;
	});
}

/* ZIP */

/**
 * Reads the central directory rather than walking local headers, because a local header is allowed
 * to leave the sizes at zero and put them in a trailing descriptor instead.
 */
async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const eocd = findEndOfCentralDirectory(view);
	if (eocd < 0) throw new Error('no central directory');

	let count = view.getUint16(eocd + 10, true);
	let offset = view.getUint32(eocd + 16, true);
	// Zip64 puts the real counts in a separate record when either overflows 16 or 32 bits.
	if (count === 0xffff || offset === 0xffffffff) {
		const locator = eocd - 20;
		if (locator >= 0 && view.getUint32(locator, true) === 0x07064b50) {
			const zip64 = Number(view.getBigUint64(locator + 8, true));
			count = Number(view.getBigUint64(zip64 + 32, true));
			offset = Number(view.getBigUint64(zip64 + 48, true));
		}
	}

	const files = new Map<string, Uint8Array>();
	let unpacked = 0;
	for (let i = 0; i < count && offset + 46 <= bytes.length; i++) {
		if (view.getUint32(offset, true) !== 0x02014b50) break;
		const method = view.getUint16(offset + 10, true);
		const compressedSize = view.getUint32(offset + 20, true);
		const nameLength = view.getUint16(offset + 28, true);
		const extraLength = view.getUint16(offset + 30, true);
		const commentLength = view.getUint16(offset + 32, true);
		const localOffset = view.getUint32(offset + 42, true);
		const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
		offset += 46 + nameLength + extraLength + commentLength;

		if (name.endsWith('/')) continue;
		// Only the handful of parts a workbook needs are inflated; the theme and styles are skipped
		// because nothing here reads them and they are the largest parts of the file.
		if (!/^xl\/(workbook\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/i.test(name))
			continue;

		const local = localOffset;
		if (local + 30 > bytes.length || view.getUint32(local, true) !== XLSX_MAGIC) continue;
		const dataAt =
			local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
		const raw = bytes.subarray(dataAt, dataAt + compressedSize);

		if (method === 0) files.set(name, raw.slice(0, LIMITS.partBytes));
		else if (method === 8) files.set(name, await inflateRaw(raw));
		unpacked += files.get(name)?.length ?? 0;
		// A part that unzips to more than the whole app is allowed to hold is a bomb, not an export.
		if (unpacked > LIMITS.totalBytes) throw new Error('unpacked too much');
		// Any other method (bzip2, lzma) is left out rather than guessed at.
	}
	return files;
}

function findEndOfCentralDirectory(view: DataView): number {
	// The record sits at the end but may be followed by a comment of up to 64KB.
	const limit = Math.max(0, view.byteLength - 22 - 0xffff);
	for (let at = view.byteLength - 22; at >= limit; at--) {
		if (view.getUint32(at, true) === 0x06054b50) return at;
	}
	return -1;
}

/**
 * Deflate, through the platform where it exists and by hand where it does not.
 *
 * DecompressionStream covers every browser and web view this app currently ships in, but it is
 * recent enough that an older Android system web view can still be missing it, and an import that
 * fails on one phone and works on another is the kind of bug nobody can report usefully.
 */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
	if (typeof DecompressionStream === 'function') {
		try {
			return await inflateStream(data);
		} catch (error) {
			// A part refused for its size is refused: inflating it again by hand would unpack the very
			// bomb the limit is there to stop. Only a platform that could not do the work falls through.
			if (error instanceof PartTooLarge) throw error;
		}
	}
	return inflate(data);
}

class PartTooLarge extends Error {}

/**
 * Read a chunk at a time and given up on as soon as it passes the limit, because a bomb has to be
 * refused before it is held: buffering the whole part first and measuring it after is the memory
 * the limit exists to refuse, already spent.
 */
async function inflateStream(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > LIMITS.partBytes) throw new PartTooLarge('part too large');
			chunks.push(value);
		}
	} finally {
		await reader.cancel().catch(() => {});
	}

	const out = new Uint8Array(size);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
}

const LENGTH_BASE = [
	3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
	163, 195, 227, 258
];
const LENGTH_EXTRA = [
	0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
];
const DIST_BASE = [
	1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
	3073, 4097, 6145, 8193, 12289, 16385, 24577
];
const DIST_EXTRA = [
	0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
];
const CODE_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huffman {
	counts: Int32Array;
	symbols: Int32Array;
}

function buildHuffman(lengths: number[] | Int32Array): Huffman {
	const counts = new Int32Array(16);
	for (const length of lengths) counts[length]++;
	counts[0] = 0;

	const offsets = new Int32Array(16);
	for (let bits = 1; bits < 16; bits++) offsets[bits + 1] = offsets[bits] + counts[bits];

	const symbols = new Int32Array(lengths.length);
	for (let symbol = 0; symbol < lengths.length; symbol++) {
		if (lengths[symbol]) symbols[offsets[lengths[symbol]]++] = symbol;
	}
	return { counts, symbols };
}

/** Raw DEFLATE, RFC 1951. Only reached when the platform has no DecompressionStream. */
function inflate(data: Uint8Array): Uint8Array {
	let bitAt = 0;
	let out = new Uint8Array(Math.max(1024, data.length * 4));
	let outAt = 0;

	const grow = (needed: number) => {
		if (outAt + needed > LIMITS.partBytes) throw new Error('part too large');
		if (outAt + needed <= out.length) return;
		let size = out.length * 2;
		while (size < outAt + needed) size *= 2;
		const next = new Uint8Array(size);
		next.set(out.subarray(0, outAt));
		out = next;
	};

	const bit = (): number => {
		const at = bitAt >>> 3;
		// Past the end of the part there is nothing to read, and reading it anyway gives back a zero
		// every time: `data[at]` is undefined and `undefined >>> n` is 0. The block header then says
		// "not the last block, stored, length nothing" for ever, which advances four bytes and writes
		// none, so the size limit never fires and the loop never ends. A part that stops early has to
		// stop the reader with it. DecompressionStream throws on a truncated part and this is what
		// catches it, so every phone reaches here, not only the old ones it was written for.
		if (at >= data.length) throw new Error('part ended early');
		const value = (data[at] >>> (bitAt & 7)) & 1;
		bitAt++;
		return value;
	};
	const bits = (count: number): number => {
		let value = 0;
		for (let i = 0; i < count; i++) value |= bit() << i;
		return value;
	};

	const decode = (tree: Huffman): number => {
		let code = 0;
		let first = 0;
		let index = 0;
		for (let length = 1; length < 16; length++) {
			code |= bit();
			const count = tree.counts[length];
			if (code - first < count) return tree.symbols[index + (code - first)];
			index += count;
			first = (first + count) << 1;
			code <<= 1;
		}
		throw new Error('bad huffman code');
	};

	let fixedLiterals: Huffman | null = null;
	let fixedDistances: Huffman | null = null;

	for (;;) {
		const last = bit();
		const type = bits(2);

		if (type === 0) {
			// Stored: skip to the byte boundary, then copy the run verbatim.
			bitAt = (bitAt + 7) & ~7;
			const at = bitAt >>> 3;
			// Its own header and the run it promises, both of which a truncated part can be missing.
			if (at + 4 > data.length || at + 4 + (data[at] | (data[at + 1] << 8)) > data.length)
				throw new Error('part ended early');
			const length = data[at] | (data[at + 1] << 8);
			grow(length);
			out.set(data.subarray(at + 4, at + 4 + length), outAt);
			outAt += length;
			bitAt = (at + 4 + length) << 3;
		} else {
			let literals: Huffman;
			let distances: Huffman;
			if (type === 1) {
				if (!fixedLiterals) {
					const lengths = new Int32Array(288);
					for (let i = 0; i < 288; i++)
						lengths[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
					fixedLiterals = buildHuffman(lengths);
					fixedDistances = buildHuffman(new Int32Array(30).fill(5));
				}
				literals = fixedLiterals;
				distances = fixedDistances!;
			} else if (type === 2) {
				const literalCount = bits(5) + 257;
				const distanceCount = bits(5) + 1;
				const codeCount = bits(4) + 4;
				const codeLengths = new Int32Array(19);
				for (let i = 0; i < codeCount; i++) codeLengths[CODE_ORDER[i]] = bits(3);
				const codeTree = buildHuffman(codeLengths);

				const lengths = new Int32Array(literalCount + distanceCount);
				for (let i = 0; i < lengths.length; ) {
					const symbol = decode(codeTree);
					if (symbol < 16) lengths[i++] = symbol;
					else if (symbol === 16) {
						const previous = lengths[i - 1];
						for (let n = bits(2) + 3; n > 0; n--) lengths[i++] = previous;
					} else if (symbol === 17) for (let n = bits(3) + 3; n > 0; n--) lengths[i++] = 0;
					else for (let n = bits(7) + 11; n > 0; n--) lengths[i++] = 0;
				}
				literals = buildHuffman(lengths.subarray(0, literalCount));
				distances = buildHuffman(lengths.subarray(literalCount));
			} else {
				throw new Error('bad block type');
			}

			for (;;) {
				const symbol = decode(literals);
				if (symbol === 256) break;
				if (symbol < 256) {
					grow(1);
					out[outAt++] = symbol;
					continue;
				}
				const lengthIndex = symbol - 257;
				const length = LENGTH_BASE[lengthIndex] + bits(LENGTH_EXTRA[lengthIndex]);
				const distanceIndex = decode(distances);
				const distance = DIST_BASE[distanceIndex] + bits(DIST_EXTRA[distanceIndex]);
				grow(length);
				for (let i = 0; i < length; i++, outAt++) out[outAt] = out[outAt - distance];
			}
		}

		if (last) break;
	}

	return out.subarray(0, outAt);
}
