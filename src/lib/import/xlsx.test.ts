import { describe, it, expect } from 'vitest';
import { readWorkbook, looksLikeZip, WorkbookError } from './xlsx';

/**
 * The workbooks here are built byte by byte rather than checked in as fixtures, so each test can
 * damage exactly the one thing it is about: a stored entry instead of a deflated one, a missing
 * relationship, a row that skips columns, a sheet with no shared strings behind it.
 */

const SHEET = (rows: string) =>
	`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;

function inline(reference: string, value: string): string {
	return `<c r="${reference}" t="inlineStr"><is><t>${value}</t></is></c>`;
}

function number(reference: string, value: number): string {
	return `<c r="${reference}"><v>${value}</v></c>`;
}

const WORKBOOK_XML = `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sessions" sheetId="1" r:id="rId1"/><sheet name="Arrows" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const RELS_XML = `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`;

async function workbook(files: Record<string, string>, options: { deflate?: boolean } = {}) {
	return zip(files, options.deflate ?? true);
}

const SIMPLE = {
	'xl/workbook.xml': WORKBOOK_XML,
	'xl/_rels/workbook.xml.rels': RELS_XML,
	'xl/worksheets/sheet1.xml': SHEET(
		`<row r="1">${inline('A1', 'trainingDate')}${inline('B1', 'total')}</row>` +
			`<row r="2">${inline('A2', '2026-06-19')}${number('B2', 303)}</row>`
	),
	'xl/worksheets/sheet2.xml': SHEET(
		`<row r="1">${inline('A1', 'id')}${inline('B1', 'arrows')}</row>` +
			`<row r="2">${inline('A2', 'shoot-1')}${inline('B2', '10:0:0,9:0:0')}</row>`
	)
};

describe('readWorkbook', () => {
	it('reads sheets, names and rows out of a deflated workbook', async () => {
		const sheets = await readWorkbook(await workbook(SIMPLE));
		expect(sheets.map((s) => s.name)).toEqual(['Sessions', 'Arrows']);
		expect(sheets[0].headers).toEqual(['trainingDate', 'total']);
		expect(sheets[0].rows[0]).toEqual({ trainingDate: '2026-06-19', total: '303' });
		expect(sheets[1].rows[0].arrows).toBe('10:0:0,9:0:0');
	});

	it('reads a workbook whose parts are stored uncompressed', async () => {
		const sheets = await readWorkbook(await workbook(SIMPLE, { deflate: false }));
		expect(sheets[0].rows[0].total).toBe('303');
	});

	it('reads shared strings, including ones split over runs', async () => {
		const shared = `<sst><si><t>trainingDate</t></si><si><r><t>Fleche </t></r><r><t>d'argent</t></r></si></sst>`;
		const sheets = await readWorkbook(
			await workbook({
				...SIMPLE,
				'xl/sharedStrings.xml': shared,
				'xl/worksheets/sheet1.xml': SHEET(
					`<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row>`
				)
			})
		);
		expect(sheets[0].rows[0].trainingDate).toBe("Fleche d'argent");
	});

	it('places cells by their reference, so a row that skips columns still lines up', async () => {
		const sheets = await readWorkbook(
			await workbook({
				...SIMPLE,
				'xl/worksheets/sheet1.xml': SHEET(
					`<row r="1">${inline('A1', 'a')}${inline('B1', 'b')}${inline('C1', 'c')}</row>` +
						`<row r="2">${inline('A2', 'one')}${inline('C2', 'three')}</row>`
				)
			})
		);
		expect(sheets[0].rows[0]).toEqual({ a: 'one', b: '', c: 'three' });
	});

	it('skips blank rows and finds the header wherever it starts', async () => {
		const sheets = await readWorkbook(
			await workbook({
				...SIMPLE,
				'xl/worksheets/sheet1.xml': SHEET(
					`<row r="3">${inline('A3', 'total')}</row><row r="4"/><row r="7">${inline('A7', '9')}</row>`
				)
			})
		);
		expect(sheets[0].headers).toEqual(['total']);
		expect(sheets[0].rows).toEqual([{ total: '9' }]);
	});

	it('keeps a sheet whose relationship is missing rather than losing its rows', async () => {
		const sheets = await readWorkbook(
			await workbook({ ...SIMPLE, 'xl/_rels/workbook.xml.rels': '<Relationships/>' })
		);
		expect(sheets.map((s) => s.name)).toEqual(['Sessions', 'Arrows']);
		expect(sheets[0].rows[0].total).toBe('303');
	});

	it('falls back to the stored order when there is no workbook part at all', async () => {
		const { 'xl/workbook.xml': _, ...rest } = SIMPLE;
		const sheets = await readWorkbook(await workbook(rest));
		expect(sheets).toHaveLength(2);
		expect(sheets[0].rows[0].total).toBe('303');
	});

	it('decodes entities and booleans', async () => {
		const sheets = await readWorkbook(
			await workbook({
				...SIMPLE,
				'xl/worksheets/sheet1.xml': SHEET(
					`<row r="1">${inline('A1', 'name')}${inline('B1', 'flag')}</row>` +
						`<row r="2">${inline('A2', 'S&#233;ance &amp; co')}<c r="B2" t="b"><v>1</v></c></row>`
				)
			})
		);
		expect(sheets[0].rows[0]).toEqual({ name: 'Séance & co', flag: 'true' });
	});

	it('refuses a file that is not a workbook', async () => {
		await expect(readWorkbook(new TextEncoder().encode('date,total\n2026-06-19,303'))).rejects.toBeInstanceOf(
			WorkbookError
		);
	});

	it('returns an empty sheet rather than failing on unreadable XML', async () => {
		const sheets = await readWorkbook(
			await workbook({ ...SIMPLE, 'xl/worksheets/sheet1.xml': 'not xml at all' })
		);
		expect(sheets[0].rows).toEqual([]);
		// The other sheet is still read, which is the whole reason for swallowing it.
		expect(sheets[1].rows[0].id).toBe('shoot-1');
	});

	it('recognises the shape of a zip', () => {
		expect(looksLikeZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe(true);
		expect(looksLikeZip(new TextEncoder().encode('hello'))).toBe(false);
	});
});

/**
 * A part that says it is deflated and then stops in the middle of itself. Every phone reaches the
 * hand written inflater with one of these, not only the old ones it was written for:
 * DecompressionStream throws on a truncated stream and the fallback is what catches that.
 */
function zipWithBrokenPart(body: Uint8Array): Uint8Array {
	const encoder = new TextEncoder();
	const nameBytes = encoder.encode('xl/workbook.xml');

	const local = new Uint8Array(30 + nameBytes.length);
	const view = new DataView(local.buffer);
	view.setUint32(0, 0x04034b50, true);
	view.setUint16(4, 20, true);
	// Deflated, says the header, and the bytes after it are not a deflate stream that ever ends.
	view.setUint16(8, 8, true);
	view.setUint32(18, body.length, true);
	view.setUint32(22, 1024, true);
	view.setUint16(26, nameBytes.length, true);
	local.set(nameBytes, 30);

	const entry = new Uint8Array(46 + nameBytes.length);
	const entryView = new DataView(entry.buffer);
	entryView.setUint32(0, 0x02014b50, true);
	entryView.setUint16(10, 8, true);
	entryView.setUint32(20, body.length, true);
	entryView.setUint32(24, 1024, true);
	entryView.setUint16(28, nameBytes.length, true);
	entryView.setUint32(42, 0, true);
	entry.set(nameBytes, 46);

	const end = new Uint8Array(22);
	const endView = new DataView(end.buffer);
	endView.setUint32(0, 0x06054b50, true);
	endView.setUint16(8, 1, true);
	endView.setUint16(10, 1, true);
	endView.setUint32(12, entry.length, true);
	endView.setUint32(16, local.length + body.length, true);

	return concat([local, body, entry, end]);
}

describe('a workbook that stops in the middle of itself', () => {
	/**
	 * Reading past the end of a part used to give back a zero every time, because the byte is
	 * undefined and `undefined >>> n` is 0. That reads as "not the last block, stored, length
	 * nothing", which advances four bytes and writes none, so the size limit never fired and the
	 * reader never returned. The app froze on a file it should simply have refused, and a share sheet
	 * is enough to hand it one.
	 */
	it('is refused rather than read for ever', async () => {
		await expect(readWorkbook(zipWithBrokenPart(new Uint8Array(8)))).rejects.toThrow(WorkbookError);
	});

	/**
	 * Answering is the whole of it. Refusing the file and reading an empty workbook out of it are
	 * both fine ends; not ending is the bug, and this test finds it by never finishing.
	 */
	it('answers, whatever the part stops in the middle of', async () => {
		const shapes = [
			new Uint8Array(0),
			new Uint8Array([0x00]),
			new Uint8Array([0xff, 0xff]),
			new Uint8Array([0x03, 0x00]),
			new Uint8Array([0x78, 0x9c, 0x00]),
			Uint8Array.from({ length: 64 }, (_, i) => (i * 37) & 0xff)
		];
		for (const shape of shapes) {
			const answered = await readWorkbook(zipWithBrokenPart(shape)).then(
				() => 'read',
				(error) => (error instanceof WorkbookError ? 'refused' : `fell over: ${error}`)
			);
			expect(answered).toMatch(/^(read|refused)$/);
		}
	});
});

/* A minimal ZIP writer, so the tests can build the files they need. */

async function zip(files: Record<string, string>, deflate: boolean): Promise<Uint8Array> {
	const encoder = new TextEncoder();
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const [name, text] of Object.entries(files)) {
		const raw = encoder.encode(text);
		const body = deflate ? await deflateRaw(raw) : raw;
		const nameBytes = encoder.encode(name);
		const crc = crc32(raw);

		const local = new Uint8Array(30 + nameBytes.length);
		const view = new DataView(local.buffer);
		view.setUint32(0, 0x04034b50, true);
		view.setUint16(4, 20, true);
		view.setUint16(8, deflate ? 8 : 0, true);
		view.setUint32(14, crc, true);
		view.setUint32(18, body.length, true);
		view.setUint32(22, raw.length, true);
		view.setUint16(26, nameBytes.length, true);
		local.set(nameBytes, 30);

		const entry = new Uint8Array(46 + nameBytes.length);
		const entryView = new DataView(entry.buffer);
		entryView.setUint32(0, 0x02014b50, true);
		entryView.setUint16(10, deflate ? 8 : 0, true);
		entryView.setUint32(16, crc, true);
		entryView.setUint32(20, body.length, true);
		entryView.setUint32(24, raw.length, true);
		entryView.setUint16(28, nameBytes.length, true);
		entryView.setUint32(42, offset, true);
		entry.set(nameBytes, 46);

		parts.push(local, body);
		central.push(entry);
		offset += local.length + body.length;
	}

	const directory = concat(central);
	const end = new Uint8Array(22);
	const endView = new DataView(end.buffer);
	endView.setUint32(0, 0x06054b50, true);
	endView.setUint16(8, central.length, true);
	endView.setUint16(10, central.length, true);
	endView.setUint32(12, directory.length, true);
	endView.setUint32(16, offset, true);

	return concat([...parts, directory, end]);
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(chunks: Uint8Array[]): Uint8Array {
	const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
}

function crc32(data: Uint8Array): number {
	let crc = ~0;
	for (const byte of data) {
		crc ^= byte;
		for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
	}
	return ~crc >>> 0;
}
