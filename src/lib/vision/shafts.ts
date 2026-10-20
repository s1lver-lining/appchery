import { toFaceCoords, toImageCoords } from './face';
import type { Frame, FaceLocation } from './types';

/**
 * Shafts found as lines, and read by a small learned model along each line.
 *
 * The written proposer looks for pixels darker than the paper, and that is what loses arrows on the
 * faces where it matters most: a light grey shaft is lighter than the black and blue rings it crosses,
 * and as light as worn paper, so it comes back in pieces and fails the ridge test. Measured against
 * nocks placed by hand, 81% of shafts were found as a run, 42% kept, and the tip read within 0.05 radii
 * on 23%.
 *
 * Here a shaft is a line that stands out from both its sides either way, darker or lighter. Ridges are
 * read from the Hessian, voted for along their own bearing, and walked; that finds 85 to 90% of the
 * labelled shafts among a frame's forty best lines. Which of them are shafts, and where along each the
 * arrow enters the paper, is left to a network reading a straightened strip of pixels along the line,
 * trained on the labelled nocks. Holding whole sessions out of the training, it kept 80 to 90% of the
 * shafts of October recordings and read the tip within 0.05 radii on 45 to 60%, letting through about
 * 5% of the false lines.
 *
 * Every step is the one `shafts.py` in the training folder takes, because the network learnt from
 * exactly those numbers: a sample read differently here is a strip it never saw.
 */
export interface ShaftModel {
	/** Positions along the strip. */
	positions: number;
	/** How far either side of the face's middle the strip reaches, in face radii. */
	half: number;
	/** Samples either side of the line, a hundredth of a radius times `spacing` apart. */
	across: number;
	spacing: number;
	layers: { inputs: number; outputs: number; kernel: number; dilation: number; weight: number[]; bias: number[] }[];
	tip: { weight: number[]; bias: number };
	none: { weight: number[]; bias: number };
	/** How sure the network must be that a line is a shaft. */
	threshold: number;
}

export interface Shaft {
	/** Where the arrow enters the paper, in the frame's pixels and in face coordinates. */
	imageX: number;
	imageY: number;
	x: number;
	y: number;
	/** The far end of the line that was walked, in pixels. */
	farX: number;
	farY: number;
	length: number;
	confidence: number;
	/** Which of the extra lines handed in this was read from, when it was one of them. */
	from?: number;
}

const SIGMA = 1.2;
/** The share of the face's pixels, strongest ridges first, that vote for lines. */
const VOTERS = 0.06;
const BEARINGS = 360;
const MAX_LINES = 30;
const VOTE_REACH = 1.3;
const WALK_REACH = 3;
const BRIDGE = 0.06;
const MIN_LENGTH = 0.12;
const CONTRAST = 8;
const CLIMB = 0.2;
const MAX_RADIUS = 1.05;

/**
 * Shafts read off the lines found here and, as well, off any `extra` lines handed in, such as the runs
 * the written proposer found: each is read by the same network, which says whether it is a shaft and
 * where along it the tip is.
 */
export function detectShafts(
	frame: Frame,
	face: FaceLocation,
	model: ShaftModel,
	extra: { ax: number; ay: number; bx: number; by: number }[] = [],
	ownLines = true
): Shaft[] {
	const { width, height } = frame;
	const grey = new Float32Array(width * height);
	for (let i = 0; i < grey.length; i++) {
		grey[i] = 0.299 * frame.data[i * 4] + 0.587 * frame.data[i * 4 + 1] + 0.114 * frame.data[i * 4 + 2];
	}
	const centre = toImageCoords(face, 0, 0);
	let around = 0;
	for (let i = 0; i < 64; i++) {
		const a = (i / 64) * Math.PI * 2;
		const p = toImageCoords(face, Math.cos(a), Math.sin(a));
		around += Math.hypot(p.x - centre.x, p.y - centre.y);
	}
	const radius = around / 64;

	const lines: (Line & { from?: number })[] = ownLines ? findLines(frame, grey, face, radius, centre) : [];
	extra.forEach((run, from) => {
		const span = Math.hypot(run.bx - run.ax, run.by - run.ay);
		if (!(span > 0)) return;
		const ux = (run.bx - run.ax) / span;
		const uy = (run.by - run.ay) / span;
		lines.push({ ...run, ux, uy, length: span / radius, fill: 1, from });
	});
	const found: Shaft[] = [];
	for (const line of lines) {
		// The strip is laid from the point of the line nearest the face's middle, as it was in training.
		const s = (centre.x - line.ax) * line.ux + (centre.y - line.ay) * line.uy;
		const ox = line.ax + line.ux * s;
		const oy = line.ay + line.uy * s;
		const { features, step } = strip(frame, grey, face, ox, oy, line.ux, line.uy, radius, model);
		const { at, confidence } = run(model, features);
		if (confidence < model.threshold) continue;
		const t = (at - (model.positions - 1) / 2) * step;
		const imageX = ox + line.ux * t;
		const imageY = oy + line.uy * t;
		const point = toFaceCoords(face, imageX, imageY);
		if (Math.hypot(point.x, point.y) >= MAX_RADIUS) continue;
		const toA = Math.hypot(line.ax - imageX, line.ay - imageY);
		const toB = Math.hypot(line.bx - imageX, line.by - imageY);
		found.push({
			imageX,
			imageY,
			x: point.x,
			y: point.y,
			farX: toA > toB ? line.ax : line.bx,
			farY: toA > toB ? line.ay : line.by,
			length: Math.max(toA, toB),
			confidence,
			from: line.from
		});
	}

	// Two lines read off one shaft, its two edges or a fragment, put the tip in one place: the surer stays.
	found.sort((a, b) => b.confidence - a.confidence);
	const kept: Shaft[] = [];
	for (const shaft of found) {
		if (kept.some((other) => Math.hypot(other.x - shaft.x, other.y - shaft.y) < 0.03)) continue;
		kept.push(shaft);
	}
	return kept;
}

interface Line {
	ax: number;
	ay: number;
	bx: number;
	by: number;
	ux: number;
	uy: number;
	length: number;
	fill: number;
}

function findLines(
	frame: Frame,
	grey: Float32Array,
	face: FaceLocation,
	radius: number,
	centre: { x: number; y: number }
): Line[] {
	const { width, height } = frame;
	// Only the face and a little round it can vote, so the ridges are read over its box and no further.
	let left = width, right = 0, top = height, bottom = 0;
	for (let i = 0; i < 64; i++) {
		const a = (i / 64) * Math.PI * 2;
		const p = toImageCoords(face, Math.cos(a) * VOTE_REACH, Math.sin(a) * VOTE_REACH);
		left = Math.min(left, p.x); right = Math.max(right, p.x);
		top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
	}
	const margin = 8;
	const bx = Math.max(0, Math.floor(left) - margin);
	const by = Math.max(0, Math.floor(top) - margin);
	const bw = Math.min(width, Math.ceil(right) + margin + 1) - bx;
	const bh = Math.min(height, Math.ceil(bottom) + margin + 1) - by;
	if (bw < 3 || bh < 3) return [];
	const part = new Float32Array(bw * bh);
	for (let y = 0; y < bh; y++) part.set(grey.subarray((by + y) * width + bx, (by + y) * width + bx + bw), y * bw);
	const { strength, bearing } = ridges(part, bw, bh);

	const inside = new Uint8Array(bw * bh);
	const values = new Float32Array(bw * bh);
	let count = 0;
	const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = face.inverse;
	const reach2 = VOTE_REACH * VOTE_REACH;
	for (let y = 0; y < bh; y++) {
		for (let x = 0; x < bw; x++) {
			// The face's inverse written out, one pixel at a time being most of what this costs.
			const X = x + bx;
			const Y = y + by;
			const w = h6 * X + h7 * Y + h8;
			const u = (h0 * X + h1 * Y + h2) / w;
			const v = (h3 * X + h4 * Y + h5) / w;
			if (u * u + v * v < reach2) {
				inside[y * bw + x] = 1;
				values[count++] = strength[y * bw + x];
			}
		}
	}
	if (count === 0) return [];
	const sorted = values.subarray(0, count).sort();
	const bar = quantile(sorted, 1 - VOTERS);

	// Distances are measured from the face's middle, and only as far as a line through the voting area
	// can be, so the table is the face's size and not the frame's.
	const reach = Math.ceil(Math.hypot(bw, bh)) + 1;
	const rhos = 2 * reach + 1;
	const votes = new Float32Array(BEARINGS * rhos);
	const cosines = new Float32Array(BEARINGS);
	const sines = new Float32Array(BEARINGS);
	for (let a = 0; a < BEARINGS; a++) {
		cosines[a] = Math.cos((a * Math.PI) / BEARINGS);
		sines[a] = Math.sin((a * Math.PI) / BEARINGS);
	}
	for (let i = 0; i < bw * bh; i++) {
		if (!inside[i] || !(strength[i] > bar)) continue;
		const x = (i % bw) + bx - centre.x;
		const y = Math.floor(i / bw) + by - centre.y;
		const own = Math.round((bearing[i] / Math.PI) * BEARINGS);
		for (let d = -2; d <= 2; d++) {
			const a = (((own + d) % BEARINGS) + BEARINGS) % BEARINGS;
			const rho = Math.round(x * -sines[a] + y * cosines[a]) + reach;
			votes[a * rhos + rho] += strength[i];
		}
	}

	// A peak is a cell no lower than any within four bearings and three distances, the bearings wrapping
	// round, found as a maximum along the distances and then along the bearings.
	const along = new Float32Array(BEARINGS * rhos);
	for (let a = 0; a < BEARINGS; a++) {
		const row = a * rhos;
		for (let r = 0; r < rhos; r++) {
			let most = -Infinity;
			for (let q = Math.max(0, r - 3); q <= Math.min(rhos - 1, r + 3); q++) most = Math.max(most, votes[row + q]);
			along[row + r] = most;
		}
	}
	const peaks: { a: number; r: number; votes: number }[] = [];
	for (let a = 0; a < BEARINGS; a++) {
		for (let r = 0; r < rhos; r++) {
			const n = votes[a * rhos + r];
			if (!(n > 0)) continue;
			let top = true;
			for (let da = -4; da <= 4; da++) {
				if (along[((a + da + BEARINGS) % BEARINGS) * rhos + r] > n) {
					top = false;
					break;
				}
			}
			if (top) peaks.push({ a, r, votes: n });
		}
	}
	peaks.sort((p, q) => q.votes - p.votes);

	const lines: Line[] = [];
	for (const peak of peaks.slice(0, MAX_LINES * 3)) {
		const theta = (peak.a * Math.PI) / BEARINGS;
		const ux = Math.cos(theta);
		const uy = Math.sin(theta);
		const nx = -uy;
		const ny = ux;
		const rho = peak.r - reach;
		const x0 = centre.x + nx * rho;
		const y0 = centre.y + ny * rho;
		const t0 = (centre.x - x0) * ux + (centre.y - y0) * uy;
		const ts: number[] = [];
		for (let t = t0 - 2.2 * radius; t < t0 + 2.2 * radius; t += 1) ts.push(t);
		const n = ts.length;
		const hit = new Uint8Array(n);
		const r = new Float32Array(n);
		let usable = 0;
		for (let i = 0; i < n; i++) {
			const x = x0 + ux * ts[i];
			const y = y0 + uy * ts[i];
			const p = toFaceCoords(face, x, y);
			r[i] = Math.hypot(p.x, p.y);
			if (!(x > 5 && y > 5 && x < width - 6 && y < height - 6 && r[i] < WALK_REACH)) continue;
			usable++;
			if (eitherWay(grey, width, height, x, y, nx, ny) > CONTRAST) hit[i] = 1;
		}
		if (usable < MIN_LENGTH * radius) continue;

		// The longest run of the line standing out, bridging gaps of up to BRIDGE radii.
		let best: [number, number] | null = null;
		let start = -1;
		let last = -1;
		let gap = 0;
		for (let i = 0; i < n; i++) {
			if (hit[i]) {
				if (start < 0) start = i;
				last = i;
				gap = 0;
			} else if (start >= 0) {
				gap++;
				if (gap > BRIDGE * radius) {
					if (!best || last - start > best[1] - best[0]) best = [start, last];
					start = -1;
				}
			}
		}
		if (start >= 0 && (!best || last - start > best[1] - best[0])) best = [start, last];
		if (!best || best[1] - best[0] < MIN_LENGTH * radius) continue;
		const [s0, s1] = best;
		let covered = 0;
		let low = Infinity;
		let high = -Infinity;
		for (let i = s0; i <= s1; i++) {
			covered += hit[i];
			low = Math.min(low, r[i]);
			high = Math.max(high, r[i]);
		}
		// It has to touch the paper, and cross rings rather than follow one.
		if (low > MAX_RADIUS) continue;
		if ((high - low) / Math.max(1e-6, (s1 - s0) / radius) < CLIMB) continue;
		lines.push({
			ax: x0 + ux * ts[s0],
			ay: y0 + uy * ts[s0],
			bx: x0 + ux * ts[s1],
			by: y0 + uy * ts[s1],
			ux,
			uy,
			length: (s1 - s0) / radius,
			fill: covered / (s1 - s0 + 1)
		});
	}

	lines.sort((p, q) => q.length * q.fill - p.length * p.fill);
	const kept: Line[] = [];
	for (const line of lines) {
		const repeat = kept.some((other) => {
			if (Math.abs(line.ux * other.uy - line.uy * other.ux) >= Math.sin((3 * Math.PI) / 180)) return false;
			const mx = (line.ax + line.bx) / 2 - other.ax;
			const my = (line.ay + line.by) / 2 - other.ay;
			return Math.abs(mx * other.uy - my * other.ux) < 0.025 * radius;
		});
		if (!repeat) kept.push(line);
	}
	return kept.slice(0, MAX_LINES);
}

/** How strongly each pixel is a ridge either way, and the bearing of that ridge in [0, pi). */
function ridges(grey: Float32Array, width: number, height: number) {
	const smooth = gaussian(grey, width, height, SIGMA);
	const gx = gradient(smooth, width, height, 'x');
	const gy = gradient(smooth, width, height, 'y');
	const hxx = gradient(gx, width, height, 'x');
	const hxyA = gradient(gx, width, height, 'y');
	const hyx = gradient(gy, width, height, 'x');
	const hyy = gradient(gy, width, height, 'y');
	const strength = new Float32Array(width * height);
	const bearing = new Float32Array(width * height);
	for (let i = 0; i < strength.length; i++) {
		const xy = (hxyA[i] + hyx[i]) / 2;
		const trace = hxx[i] + hyy[i];
		const spread = Math.sqrt(((hxx[i] - hyy[i]) / 2) ** 2 + xy * xy);
		const l1 = trace / 2 + spread;
		const l2 = trace / 2 - spread;
		const firstBigger = Math.abs(l1) > Math.abs(l2);
		strength[i] = (Math.abs(firstBigger ? l1 : l2) - Math.abs(firstBigger ? l2 : l1)) * SIGMA * SIGMA;
		let normal = 0.5 * Math.atan2(2 * xy, hxx[i] - hyy[i]);
		if (!firstBigger) normal += Math.PI / 2;
		const along = normal + Math.PI / 2;
		bearing[i] = ((along % Math.PI) + Math.PI) % Math.PI;
	}
	return { strength, bearing };
}

/** A Gaussian blur reflecting at the edges, as scipy's own does, four sigmas wide. */
function gaussian(source: Float32Array, width: number, height: number, sigma: number): Float32Array {
	const half = Math.floor(4 * sigma + 0.5);
	const kernel: number[] = [];
	let sum = 0;
	for (let k = -half; k <= half; k++) {
		kernel.push(Math.exp((-0.5 * k * k) / (sigma * sigma)));
		sum += kernel[kernel.length - 1];
	}
	for (let k = 0; k < kernel.length; k++) kernel[k] /= sum;
	const reflect = (i: number, n: number) => {
		while (i < 0 || i >= n) i = i < 0 ? -i - 1 : 2 * n - i - 1;
		return i;
	};
	const across = new Float32Array(width * height);
	for (let y = 0; y < height; y++) {
		const row = y * width;
		for (let x = 0; x < width; x++) {
			let v = 0;
			if (x >= half && x < width - half) {
				for (let k = -half; k <= half; k++) v += kernel[k + half] * source[row + x + k];
			} else {
				for (let k = -half; k <= half; k++) v += kernel[k + half] * source[row + reflect(x + k, width)];
			}
			across[row + x] = v;
		}
	}
	const out = new Float32Array(width * height);
	for (let y = 0; y < height; y++) {
		const inner = y >= half && y < height - half;
		for (let x = 0; x < width; x++) {
			let v = 0;
			if (inner) {
				for (let k = -half; k <= half; k++) v += kernel[k + half] * across[(y + k) * width + x];
			} else {
				for (let k = -half; k <= half; k++) v += kernel[k + half] * across[reflect(y + k, height) * width + x];
			}
			out[y * width + x] = v;
		}
	}
	return out;
}

/** Central differences inside, one sided at the edges, as numpy's gradient. */
function gradient(source: Float32Array, width: number, height: number, axis: 'x' | 'y'): Float32Array {
	const out = new Float32Array(width * height);
	const n = axis === 'x' ? width : height;
	const stride = axis === 'x' ? 1 : width;
	if (n < 2) return out;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			const k = axis === 'x' ? x : y;
			if (k === 0) out[i] = source[i + stride] - source[i];
			else if (k === n - 1) out[i] = source[i] - source[i - stride];
			else out[i] = (source[i + stride] - source[i - stride]) / 2;
		}
	}
	return out;
}

function quantile(sorted: Float32Array, q: number): number {
	const at = (sorted.length - 1) * q;
	const below = Math.floor(at);
	const above = Math.min(sorted.length - 1, below + 1);
	return sorted[below] + (sorted[above] - sorted[below]) * (at - below);
}

/** Bilinear, holding to the edge outside the picture, as scipy's map_coordinates in its nearest mode. */
function sample(plane: Float32Array, width: number, height: number, x: number, y: number): number {
	x = Math.min(Math.max(x, 0), width - 1);
	y = Math.min(Math.max(y, 0), height - 1);
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const x1 = Math.min(x0 + 1, width - 1);
	const y1 = Math.min(y0 + 1, height - 1);
	const fx = x - x0;
	const fy = y - y0;
	return (
		plane[y0 * width + x0] * (1 - fx) * (1 - fy) +
		plane[y0 * width + x1] * fx * (1 - fy) +
		plane[y1 * width + x0] * (1 - fx) * fy +
		plane[y1 * width + x1] * fx * fy
	);
}

/** How much a point stands out from both sides of the line, darker or lighter, by the weaker side. */
function eitherWay(grey: Float32Array, width: number, height: number, x: number, y: number, nx: number, ny: number) {
	let centreLow = Infinity;
	let centreHigh = -Infinity;
	for (let o = -1.5; o <= 1.5; o += 0.5) {
		const v = sample(grey, width, height, x + nx * o, y + ny * o);
		centreLow = Math.min(centreLow, v);
		centreHigh = Math.max(centreHigh, v);
	}
	let leftLow = Infinity;
	let leftHigh = -Infinity;
	let rightLow = Infinity;
	let rightHigh = -Infinity;
	for (let k = 3; k <= 5; k++) {
		const l = sample(grey, width, height, x - nx * k, y - ny * k);
		const r = sample(grey, width, height, x + nx * k, y + ny * k);
		leftLow = Math.min(leftLow, l);
		leftHigh = Math.max(leftHigh, l);
		rightLow = Math.min(rightLow, r);
		rightHigh = Math.max(rightHigh, r);
	}
	const dark = Math.min(leftHigh - centreLow, rightHigh - centreLow);
	const light = Math.min(centreHigh - leftLow, centreHigh - rightLow);
	return Math.max(dark, light);
}

let planes: { frame: Frame; red: Float32Array; green: Float32Array; blue: Float32Array } | null = null;

/** The straightened strip along a line, channels outermost, in the order the network learnt them. */
function strip(
	frame: Frame,
	grey: Float32Array,
	face: FaceLocation,
	ox: number,
	oy: number,
	ux: number,
	uy: number,
	radius: number,
	model: ShaftModel
): { features: Float32Array[]; step: number } {
	const { width, height } = frame;
	if (planes?.frame !== frame) {
		const n = width * height;
		const red = new Float32Array(n);
		const green = new Float32Array(n);
		const blue = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			red[i] = frame.data[i * 4];
			green[i] = frame.data[i * 4 + 1];
			blue[i] = frame.data[i * 4 + 2];
		}
		planes = { frame, red, green, blue };
	}
	const colours = [planes.red, planes.green, planes.blue];
	const k = model.positions;
	const across = model.across;
	const step = (2 * model.half * radius) / (k - 1);
	const apart = (radius / 100) * model.spacing;
	const nx = -uy;
	const ny = ux;
	const features = Array.from({ length: 2 * across + 1 + 6 }, () => new Float32Array(k));
	const rows = 2 * across + 1;
	const values = new Float32Array(rows);
	for (let i = 0; i < k; i++) {
		const t = (i - (k - 1) / 2) * step;
		const x = ox + ux * t;
		const y = oy + uy * t;
		if (!(x >= 0 && y >= 0 && x <= width - 1 && y <= height - 1)) continue;
		for (let j = -across; j <= across; j++) {
			values[j + across] = sample(grey, width, height, x + nx * j * apart, y + ny * j * apart) / 255;
		}
		const background = (values[0] + values[rows - 1] + values[1] + values[rows - 2]) / 4;
		for (let j = 0; j < rows; j++) features[j][i] = values[j] - background;
		const side = across * apart;
		for (let c = 0; c < 3; c++) {
			const middle = sample(colours[c], width, height, x, y) / 255;
			const flanks =
				(sample(colours[c], width, height, x + nx * side, y + ny * side) +
					sample(colours[c], width, height, x - nx * side, y - ny * side)) /
				2 /
				255;
			features[rows + c][i] = middle - flanks;
		}
		features[rows + 3][i] = background;
		const p = toFaceCoords(face, x, y);
		features[rows + 4][i] = Math.hypot(p.x, p.y) / 3;
		features[rows + 5][i] = 1;
	}
	return { features, step };
}

/** The weights as typed arrays, laid out once per model rather than read from JSON lists on every line. */
const packed = new WeakMap<ShaftModel, { weights: Float32Array[]; biases: Float32Array[]; tip: Float32Array; none: Float32Array }>();

function packOf(model: ShaftModel) {
	let pack = packed.get(model);
	if (!pack) {
		pack = {
			weights: model.layers.map((layer) => Float32Array.from(layer.weight)),
			biases: model.layers.map((layer) => Float32Array.from(layer.bias)),
			tip: Float32Array.from(model.tip.weight),
			none: Float32Array.from(model.none.weight)
		};
		packed.set(model, pack);
	}
	return pack;
}

/** The network's forward pass: where along the strip the tip is, and how sure it is there is a shaft. */
export function run(model: ShaftModel, input: Float32Array[]): { at: number; confidence: number } {
	const k = model.positions;
	const pack = packOf(model);
	// Every plane of a layer in one buffer, channel after channel.
	let current = new Float32Array(input.length * k);
	input.forEach((plane, c) => current.set(plane, c * k));
	for (let l = 0; l < model.layers.length; l++) {
		const layer = model.layers[l];
		const weights = pack.weights[l];
		const biases = pack.biases[l];
		const next = new Float32Array(layer.outputs * k);
		const half = Math.floor(layer.kernel / 2);
		for (let o = 0; o < layer.outputs; o++) {
			const base = o * k;
			next.fill(biases[o], base, base + k);
			for (let c = 0; c < layer.inputs; c++) {
				const source = c * k;
				for (let q = 0; q < layer.kernel; q++) {
					const w = weights[(o * layer.inputs + c) * layer.kernel + q];
					if (w === 0) continue;
					const shift = (q - half) * layer.dilation;
					const from = Math.max(0, -shift);
					const to = Math.min(k, k - shift);
					const offset = source + shift;
					for (let i = from; i < to; i++) next[base + i] += w * current[offset + i];
				}
			}
			for (let i = base; i < base + k; i++) if (next[i] < 0) next[i] = 0;
		}
		current = next;
	}
	const channels = current.length / k;
	const logits = new Float32Array(k + 1);
	for (let i = 0; i < k; i++) {
		let v = model.tip.bias;
		for (let c = 0; c < channels; c++) v += pack.tip[c] * current[c * k + i];
		logits[i] = v;
	}
	let none = model.none.bias;
	for (let c = 0; c < channels; c++) {
		let most = -Infinity;
		for (let i = 0; i < k; i++) most = Math.max(most, current[c * k + i]);
		none += pack.none[c] * most;
	}
	logits[k] = none;
	let peak = -Infinity;
	for (let i = 0; i <= k; i++) peak = Math.max(peak, logits[i]);
	let total = 0;
	for (let i = 0; i <= k; i++) total += Math.exp(logits[i] - peak);
	let best = 0;
	for (let i = 1; i < k; i++) if (logits[i] > logits[best]) best = i;
	return { at: best, confidence: 1 - Math.exp(logits[k] - peak) / total };
}
