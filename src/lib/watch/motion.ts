/**
 * Reading back what the watch recorded through an end. The format is written by `Motion.java` and
 * described in doc/llm-memory/wrist-motion.md; nothing here depends on the database or a device, so
 * scripts can decode an export with it too.
 */

export interface Axes {
	/** Milliseconds since recording began. */
	t: number[];
	x: number[];
	y: number[];
	z: number[];
}

export interface Samples {
	/** Radians a second, in the watch's own frame. */
	gyro: Axes;
	/** Metres a second squared, gravity included. */
	accel: Axes;
}

const GYRO = 0;
const ACCEL = 1;
const ESCAPE = 0xffff;

export async function inflate(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Decodes the samples once inflated. Throws on a file that is not one the watch wrote. */
export function parse(raw: Uint8Array): Samples {
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
	if (raw.length < 8 || raw[0] !== 0x41 || raw[1] !== 0x4d || raw[2] !== 0x4f || raw[3] !== 1) {
		throw new Error('not a wrist motion recording');
	}
	const scales = [view.getUint16(4, true), view.getUint16(6, true)];
	const out: Samples = { gyro: axes(), accel: axes() };
	const previous = [
		[0, 0, 0],
		[0, 0, 0]
	];
	let tenths = 0;
	let at = 8;
	while (at < raw.length) {
		const kind = raw[at];
		if (kind !== GYRO && kind !== ACCEL) throw new Error(`unknown sensor ${kind} at ${at}`);
		const delta = view.getUint16(at + 1, true);
		at += 3;
		if (delta === ESCAPE) {
			tenths = view.getUint32(at, true);
			at += 4;
		} else {
			tenths += delta;
		}
		const into = kind === GYRO ? out.gyro : out.accel;
		into.t.push(tenths / 10);
		const values = [into.x, into.y, into.z];
		for (let axis = 0; axis < 3; axis++) {
			// Sixteen bit arithmetic, wrapping exactly as the watch's did when it took the difference.
			const value = ((previous[kind][axis] + view.getInt16(at, true)) << 16) >> 16;
			previous[kind][axis] = value;
			values[axis].push(value / scales[kind]);
			at += 2;
		}
	}
	return out;
}

export async function decode(data: Uint8Array): Promise<Samples> {
	return parse(await inflate(data));
}

function axes(): Axes {
	return { t: [], x: [], y: [], z: [] };
}

/**
 * The shot rule the watch counts training arrows with, kept identical to `Motion.java`: a release
 * is a jolt above `RELEASE` that follows a still wrist, and anything within `REFRACTORY_MS` of the
 * last one is the same shot ringing on. Measured on the first recordings, see
 * doc/llm-memory/wrist-motion.md.
 */
export const SHOT = {
	/** m/s², gravity included: a release measured 27 to 47, a wrist at rest 9.8. */
	RELEASE: 25,
	/** rad/s, the mean over the hold: shots held at 0.10 to 0.29, arms moving about at 1.2 and up. */
	STILL: 0.4,
	HOLD_FROM_MS: 1500,
	HOLD_TO_MS: 200,
	REFRACTORY_MS: 3000
};

/** When each shot was released, in milliseconds since recording began. */
export function findShots(samples: Samples): number[] {
	const { gyro, accel } = samples;
	const spin = gyro.t.map((_, i) => Math.hypot(gyro.x[i], gyro.y[i], gyro.z[i]));
	const shots: number[] = [];
	let last = -Infinity;
	let from = 0;
	for (let i = 0; i < accel.t.length; i++) {
		const at = accel.t[i];
		if (at - last < SHOT.REFRACTORY_MS) continue;
		if (Math.hypot(accel.x[i], accel.y[i], accel.z[i]) <= SHOT.RELEASE) continue;
		while (from < gyro.t.length && gyro.t[from] < at - SHOT.HOLD_FROM_MS) from++;
		let sum = 0;
		let count = 0;
		for (let j = from; j < gyro.t.length && gyro.t[j] < at - SHOT.HOLD_TO_MS; j++) {
			sum += spin[j];
			count++;
		}
		// Too little hold on record to judge, which at the start of a segment is a draw cut in half.
		if (count < 10 || sum / count >= SHOT.STILL) continue;
		shots.push(at);
		last = at;
	}
	return shots;
}
