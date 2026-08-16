/**
 * A QR code encoder, byte mode, error correction level M, versions 1 to 10.
 *
 * Written here rather than pulled in: the app ships offline to three targets, and the one code it
 * ever draws is a short URL. See doc/architecture.md for the dependency stance.
 */

/** Total codewords, data and error correction together, for versions 1 to 10. */
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
/** Error correction codewords per block, and how many blocks, at level M. */
const EC_M: [ec: number, blocks: number][] = [
	[10, 1],
	[16, 1],
	[26, 1],
	[18, 2],
	[24, 2],
	[16, 4],
	[18, 4],
	[22, 4],
	[22, 5],
	[26, 5]
];
/** Row and column centres of the alignment patterns, per version. */
const ALIGNMENT = [
	[],
	[6, 18],
	[6, 22],
	[6, 26],
	[6, 30],
	[6, 34],
	[6, 22, 38],
	[6, 24, 42],
	[6, 26, 46],
	[6, 28, 50]
];

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
	EXP[i] = x;
	LOG[x] = i;
	// The field is built on x^8 = x^4 + x^3 + x^2 + 1, the polynomial QR fixes for its arithmetic.
	x = x << 1;
	if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The generator polynomial whose roots are the first `degree` powers of two in the field. */
function generator(degree: number): number[] {
	let poly = [1];
	for (let i = 0; i < degree; i++) {
		const next = new Array(poly.length + 1).fill(0);
		for (let j = 0; j < poly.length; j++) {
			next[j] ^= poly[j];
			next[j + 1] ^= mul(poly[j], EXP[i]);
		}
		poly = next;
	}
	return poly;
}

/** The remainder of the data divided by the generator: the block's error correction codewords. */
function remainder(data: number[], degree: number): number[] {
	const gen = generator(degree);
	const out = new Array(degree).fill(0);
	for (const byte of data) {
		const factor = byte ^ out[0];
		out.shift();
		out.push(0);
		for (let i = 0; i < degree; i++) out[i] ^= mul(gen[i + 1], factor);
	}
	return out;
}

export class QrTooLongError extends Error {}

/** The message as codewords: mode, length, payload, terminator, padding, then the EC blocks woven in. */
function codewords(text: string, version: number): number[] {
	const bytes = [...new TextEncoder().encode(text)];
	const [ecPerBlock, blocks] = EC_M[version - 1];
	const dataCount = TOTAL_CODEWORDS[version - 1] - ecPerBlock * blocks;

	const bits: number[] = [];
	const push = (value: number, width: number) => {
		for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
	};
	push(0b0100, 4);
	// Versions 1 to 9 count the payload in eight bits, 10 and up in sixteen.
	push(bytes.length, version < 10 ? 8 : 16);
	for (const byte of bytes) push(byte, 8);
	for (let i = 0; i < 4 && bits.length < dataCount * 8; i++) bits.push(0);
	while (bits.length % 8) bits.push(0);

	const data: number[] = [];
	for (let i = 0; i < bits.length; i += 8) {
		data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
	}
	// The two pad bytes the standard names, alternating from the first one until the capacity is full.
	for (let i = 0; data.length < dataCount; i++) data.push(i % 2 === 0 ? 0xec : 0x11);

	const short = Math.floor(dataCount / blocks);
	const longs = dataCount % blocks;
	const dataBlocks: number[][] = [];
	const ecBlocks: number[][] = [];
	for (let i = 0, at = 0; i < blocks; i++) {
		const size = short + (i >= blocks - longs ? 1 : 0);
		const block = data.slice(at, at + size);
		at += size;
		dataBlocks.push(block);
		ecBlocks.push(remainder(block, ecPerBlock));
	}

	// Interleaved so a scratch across the print damages a little of every block rather than all of one.
	const out: number[] = [];
	for (let i = 0; i <= short; i++) {
		for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
	}
	for (let i = 0; i < ecPerBlock; i++) for (const block of ecBlocks) out.push(block[i]);
	return out;
}

type Grid = { size: number; modules: Uint8Array; fixed: Uint8Array };

const at = (g: Grid, x: number, y: number) => g.modules[y * g.size + x];
const set = (g: Grid, x: number, y: number, dark: boolean, fixed = true) => {
	g.modules[y * g.size + x] = dark ? 1 : 0;
	if (fixed) g.fixed[y * g.size + x] = 1;
};

function finder(g: Grid, x: number, y: number) {
	for (let dy = -1; dy <= 7; dy++) {
		for (let dx = -1; dx <= 7; dx++) {
			const px = x + dx;
			const py = y + dy;
			if (px < 0 || py < 0 || px >= g.size || py >= g.size) continue;
			const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
			set(g, px, py, ring !== 2 && ring <= 3);
		}
	}
}

function patterns(g: Grid, version: number) {
	finder(g, 0, 0);
	finder(g, g.size - 7, 0);
	finder(g, 0, g.size - 7);

	for (let i = 8; i < g.size - 8; i++) {
		set(g, i, 6, i % 2 === 0);
		set(g, 6, i, i % 2 === 0);
	}

	const centres = ALIGNMENT[version - 1];
	for (const cy of centres) {
		for (const cx of centres) {
			// The three finder corners already own their space, so no alignment pattern sits on them.
			if ((cx === 6 && cy === 6) || (cx === 6 && cy === g.size - 7) || (cx === g.size - 7 && cy === 6))
				continue;
			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					set(g, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
				}
			}
		}
	}

	// Always dark, and never anything else: the one module the standard fixes by hand.
	set(g, 8, g.size - 8, true);

	// From version 7 the code says its own size, in a corner block beside two of the finders.
	if (version >= 7) {
		let rem = version;
		for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
		const info = (version << 12) | rem;
		for (let i = 0; i < 18; i++) {
			const dark = ((info >>> i) & 1) === 1;
			const a = g.size - 11 + (i % 3);
			const b = Math.floor(i / 3);
			set(g, a, b, dark);
			set(g, b, a, dark);
		}
	}
}

/** Written before the data is laid, so its modules are never taken for data positions. */
function formatInfo(g: Grid, mask: number) {
	// Level M is 0b00 in the format field, and the whole thing is scrambled by a fixed pattern.
	const value = (0b00 << 3) | mask;
	let rem = value;
	for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
	const info = (((value << 10) | rem) ^ 0x5412) >>> 0;
	const bit = (i: number) => ((info >>> i) & 1) === 1;

	// Written twice, so a damaged corner still says which mask was used.
	for (let i = 0; i <= 5; i++) set(g, 8, i, bit(i));
	set(g, 8, 7, bit(6));
	set(g, 8, 8, bit(7));
	set(g, 7, 8, bit(8));
	for (let i = 9; i < 15; i++) set(g, 14 - i, 8, bit(i));
	for (let i = 0; i < 8; i++) set(g, g.size - 1 - i, 8, bit(i));
	for (let i = 8; i < 15; i++) set(g, 8, g.size - 15 + i, bit(i));
}

/** Up the right hand side and back down, two columns at a time, skipping everything already fixed. */
function layout(g: Grid, data: number[]) {
	let bit = 0;
	let upward = true;
	for (let right = g.size - 1; right > 0; right -= 2) {
		if (right === 6) right = 5;
		for (let step = 0; step < g.size; step++) {
			const y = upward ? g.size - 1 - step : step;
			for (const x of [right, right - 1]) {
				if (g.fixed[y * g.size + x]) continue;
				const byte = data[bit >> 3];
				// Past the last codeword the remainder bits are light, which is what the standard asks.
				set(g, x, y, byte !== undefined && ((byte >> (7 - (bit & 7))) & 1) === 1, false);
				bit++;
			}
		}
		upward = !upward;
	}
}

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

/**
 * The four penalties of the standard, added up: the lowest scoring mask is the one that ships.
 *
 * The third of them, the finder's own 1:1:3:1:1 rhythm turning up in the data, is counted off the
 * last six runs of each line, with the quiet zone outside the symbol standing in for a light run.
 */
function penalty(g: Grid): number {
	const n = g.size;
	let score = 0;

	/** Runs most recent first, the way the finder ratio is read backwards from where a run ends. */
	const remember = (history: number[], run: number) => {
		// The border outside the symbol is light, so the very first run of a line reaches into it.
		if (history[0] === 0) run += n;
		history.unshift(run);
		history.pop();
	};
	const finderLike = (history: number[]) => {
		const unit = history[1];
		const core =
			unit > 0 &&
			history[2] === unit &&
			history[4] === unit &&
			history[5] === unit &&
			history[3] === unit * 3;
		if (!core) return 0;
		return (
			(history[0] >= unit * 4 && history[6] >= unit ? 1 : 0) +
			(history[6] >= unit * 4 && history[0] >= unit ? 1 : 0)
		);
	};

	for (let i = 0; i < n; i++) {
		for (const horizontal of [true, false]) {
			const read = (j: number) => (horizontal ? at(g, j, i) : at(g, i, j));
			const history = [0, 0, 0, 0, 0, 0, 0];
			let colour = 0;
			let run = 0;
			for (let j = 0; j < n; j++) {
				if (read(j) === colour) {
					run++;
					if (run === 5) score += 3;
					else if (run > 5) score += 1;
				} else {
					remember(history, run);
					if (colour === 0) score += finderLike(history) * 40;
					colour = read(j);
					run = 1;
				}
			}
			if (colour === 1) {
				remember(history, run);
				run = 0;
			}
			remember(history, run + n);
			score += finderLike(history) * 40;
		}
	}

	for (let y = 0; y < n - 1; y++) {
		for (let x = 0; x < n - 1; x++) {
			const first = at(g, x, y);
			if (first === at(g, x + 1, y) && first === at(g, x, y + 1) && first === at(g, x + 1, y + 1))
				score += 3;
		}
	}

	let dark = 0;
	for (const module of g.modules) dark += module;
	const total = n * n;
	// How many fifths of a percent off an even split of dark and light the symbol is.
	score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
	return score;
}

/**
 * The modules of a code holding `text`, row major, 1 for dark. Level M throughout: a poster gets
 * scanned at an angle, in whatever light the room has.
 */
export function encodeQr(text: string): { size: number; modules: Uint8Array } {
	const length = new TextEncoder().encode(text).length;
	const version =
		EC_M.findIndex(([ec, blocks], i) => {
			const bits = (TOTAL_CODEWORDS[i] - ec * blocks) * 8 - 4 - (i + 1 < 10 ? 8 : 16);
			return Math.floor(bits / 8) >= length;
		}) + 1;
	if (version === 0) throw new QrTooLongError(`${length} bytes is more than version 10 holds`);

	const data = codewords(text, version);
	const size = version * 4 + 17;

	let best: Grid | null = null;
	let bestScore = Infinity;
	for (let mask = 0; mask < 8; mask++) {
		const grid: Grid = { size, modules: new Uint8Array(size * size), fixed: new Uint8Array(size * size) };
		patterns(grid, version);
		// Reserved before the data is laid: the format modules are not data positions.
		formatInfo(grid, mask);
		layout(grid, data);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				if (!grid.fixed[y * size + x] && MASKS[mask](x, y)) grid.modules[y * size + x] ^= 1;
			}
		}
		const score = penalty(grid);
		if (score < bestScore) {
			bestScore = score;
			best = grid;
		}
	}

	return { size, modules: best!.modules };
}

/** The dark modules as one SVG path, so a printer draws a single shape instead of a thousand rects. */
export function qrPath(code: { size: number; modules: Uint8Array }): string {
	const parts: string[] = [];
	for (let y = 0; y < code.size; y++) {
		for (let x = 0; x < code.size; x++) {
			if (code.modules[y * code.size + x]) parts.push(`M${x} ${y}h1v1h-1z`);
		}
	}
	return parts.join('');
}
