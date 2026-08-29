import { describe, it, expect } from 'vitest';
import { encodeQr } from './qr';

/*
 * A reader for what the encoder draws, so the tests can say the code scans and not merely that it
 * came out the same as last time.
 *
 * qr.test.ts pins the exact grid, which catches a change but cannot tell a harmless one from a
 * broken one: faced with a failing grid the obvious move is to paste in the new one, and a QR nobody
 * can scan would be blessed on the spot. This reads the symbol back instead, and it is written from
 * the standard rather than from qr.ts, so what it agrees with is the specification.
 *
 * Reed-Solomon is what makes that agreement worth something. Every block, data and check bytes
 * together, has to be a multiple of the generator, so every syndrome is zero. A grid that decodes
 * with zero syndromes is one a scanner reads.
 */

const TOTAL = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const EC_M: [number, number][] = [
	[10, 1], [16, 1], [26, 1], [18, 2], [24, 2], [16, 4], [18, 4], [22, 4], [22, 5], [26, 5]
];
const ALIGNMENT = [
	[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
];

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
	EXP[i] = x;
	LOG[x] = i;
	x = x << 1;
	if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

const MASKS: ((x: number, y: number) => boolean)[] = [
	(x, y) => (x + y) % 2 === 0,
	(_x, y) => y % 2 === 0,
	(x) => x % 3 === 0,
	(x, y) => (x + y) % 3 === 0,
	(x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
	(x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
	(x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
	(x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
];

/** Everything the standard reserves, so what is left over is the data. */
function reserved(size: number, version: number, x: number, y: number): boolean {
	if (x < 9 && y < 9) return true;
	if (x >= size - 8 && y < 9) return true;
	if (x < 9 && y >= size - 8) return true;
	if (x === 6 || y === 6) return true;
	if (version >= 7) {
		if (x >= size - 11 && x <= size - 9 && y <= 5) return true;
		if (y >= size - 11 && y <= size - 9 && x <= 5) return true;
	}
	const centres = ALIGNMENT[version - 1];
	for (const cy of centres) {
		for (const cx of centres) {
			if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6))
				continue;
			if (Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2) return true;
		}
	}
	return false;
}

function decode(code: { size: number; modules: Uint8Array }): {
	text: string;
	mask: number;
	syndromes: string[];
} {
	const { size, modules } = code;
	const version = (size - 17) / 4;
	const dark = (x: number, y: number) => modules[y * size + x] === 1;

	// The format information, read from the copy beside the top left finder.
	let raw = 0;
	const order: [number, number][] = [];
	for (let i = 0; i <= 5; i++) order.push([8, i]);
	order.push([8, 7], [8, 8], [7, 8]);
	for (let i = 9; i < 15; i++) order.push([14 - i, 8]);
	order.forEach(([x, y], i) => {
		if (dark(x, y)) raw |= 1 << i;
	});
	const info = raw ^ 0x5412;
	const level = (info >>> 13) & 0b11;
	const mask = (info >>> 10) & 0b111;

	// The data modules, in the standard's zigzag, unmasked as they are read.
	const bits: number[] = [];
	let upward = true;
	for (let right = size - 1; right > 0; right -= 2) {
		if (right === 6) right = 5;
		for (let step = 0; step < size; step++) {
			const y = upward ? size - 1 - step : step;
			for (const x of [right, right - 1]) {
				if (reserved(size, version, x, y)) continue;
				bits.push((dark(x, y) ? 1 : 0) ^ (MASKS[mask](x, y) ? 1 : 0));
			}
		}
		upward = !upward;
	}

	const stream: number[] = [];
	for (let i = 0; i + 8 <= bits.length; i += 8)
		stream.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

	// De-interleave back into blocks.
	const [ecPerBlock, blocks] = EC_M[version - 1];
	const dataCount = TOTAL[version - 1] - ecPerBlock * blocks;
	const short = Math.floor(dataCount / blocks);
	const longs = dataCount % blocks;
	const sizes = Array.from({ length: blocks }, (_, i) => short + (i >= blocks - longs ? 1 : 0));

	const dataBlocks: number[][] = sizes.map(() => []);
	let at = 0;
	for (let i = 0; i <= short; i++) {
		for (let b = 0; b < blocks; b++) if (i < sizes[b]) dataBlocks[b].push(stream[at++]);
	}
	const ecBlocks: number[][] = sizes.map(() => []);
	for (let i = 0; i < ecPerBlock; i++) for (let b = 0; b < blocks; b++) ecBlocks[b].push(stream[at++]);

	// Every codeword and its check bytes together must be a multiple of the generator, so every
	// syndrome is zero. This is what proves the error correction is genuinely right.
	const bad: string[] = [];
	for (let b = 0; b < blocks; b++) {
		const whole = [...dataBlocks[b], ...ecBlocks[b]];
		for (let s = 0; s < ecPerBlock; s++) {
			let acc = 0;
			for (const c of whole) acc = mul(acc, EXP[s]) ^ c;
			if (acc !== 0) bad.push(`block ${b} syndrome ${s} = ${acc}`);
		}
	}

	// The payload itself.
	const flat = dataBlocks.flat();
	const payloadBits: number[] = [];
	for (const byte of flat) for (let i = 7; i >= 0; i--) payloadBits.push((byte >> i) & 1);
	const take = (n: number) => payloadBits.splice(0, n).reduce((a, b) => (a << 1) | b, 0);
	const mode = take(4);
	if (mode !== 0b0100) return { text: `<mode ${mode}, not byte>`, mask, syndromes: bad };
	const length = take(version < 10 ? 8 : 16);
	const out = new Uint8Array(length);
	for (let i = 0; i < length; i++) out[i] = take(8);

	// Level M is 0b00 in the format field, which is the level this encoder writes.
	if (level !== 0b00) bad.push(`format says level ${level}`);
	return { text: new TextDecoder().decode(out), mask, syndromes: bad };
}

describe('the code a scanner sees', () => {
	it('reads back as the text it was given', () => {
		const cases = [
			'https://appchery.pages.dev',
			'https://appchery.pages.dev/settings?from=%2Fhome&x=1234567890abcdefghijklmnop',
			// Multi byte, because byte mode counts bytes and the length field has to agree.
			'résultats · 結果 · 🎯',
			'a',
			'',
			// The capacities either side of every version boundary this encoder covers.
			'x'.repeat(14),
			'x'.repeat(15),
			'x'.repeat(26),
			'x'.repeat(62),
			'x'.repeat(122),
			'x'.repeat(152),
			'x'.repeat(180),
			'x'.repeat(213)
		];

		for (const text of cases) {
			const code = encodeQr(text);
			const read = decode(code);
			expect(read.syndromes, `error correction for ${text.length} characters`).toEqual([]);
			expect(read.text, `${text.length} characters`).toBe(text);
		}
	});

	/** Version 7 and up carry their own size in two corner blocks, which is data area if written wrong. */
	it('says its own size from version seven up', () => {
		for (const [length, version] of [
			[122, 7],
			[152, 8],
			[180, 9],
			[213, 10]
		]) {
			const code = encodeQr('x'.repeat(length));
			expect((code.size - 17) / 4).toBe(version);
			expect(decode(code).text).toBe('x'.repeat(length));
		}
	});

	it('picks a version that holds the text and no larger', () => {
		// One byte more than a version holds has to move up, and never before.
		for (const [length, version] of [
			[14, 1],
			[15, 2],
			[26, 2],
			[27, 3]
		]) {
			expect((encodeQr('x'.repeat(length)).size - 17) / 4).toBe(version);
		}
	});
});
