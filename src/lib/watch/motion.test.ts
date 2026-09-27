import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { decode, findShots, parse } from './motion';

/** Written the way Motion.java writes it, so the two halves are held to one format. */
function recording(samples: [kind: number, tenths: number, x: number, y: number, z: number][]) {
	const bytes: number[] = [0x41, 0x4d, 0x4f, 1];
	const short = (v: number) => bytes.push(v & 0xff, (v >> 8) & 0xff);
	short(1000);
	short(200);
	const previous = [
		[0, 0, 0],
		[0, 0, 0]
	];
	let last = 0;
	for (const [kind, tenths, ...values] of samples) {
		bytes.push(kind);
		const delta = tenths - last;
		if (delta >= 0xffff) {
			short(0xffff);
			short(tenths & 0xffff);
			short(tenths >>> 16);
		} else {
			short(delta);
		}
		last = tenths;
		values.forEach((value, axis) => {
			short((value - previous[kind][axis]) & 0xffff);
			previous[kind][axis] = value;
		});
	}
	return new Uint8Array(bytes);
}

describe('wrist motion', () => {
	it('reads back both sensors in their own units', () => {
		const raw = recording([
			[0, 0, 1000, -2000, 0],
			[1, 50, 1962, 0, -200],
			[0, 100, 1500, -2500, 32767]
		]);
		const samples = parse(raw);
		expect(samples.gyro.t).toEqual([0, 10]);
		expect(samples.gyro.x).toEqual([1, 1.5]);
		expect(samples.gyro.y).toEqual([-2, -2.5]);
		expect(samples.gyro.z).toEqual([0, 32.767]);
		expect(samples.accel.t).toEqual([5]);
		expect(samples.accel.x).toEqual([9.81]);
		expect(samples.accel.z).toEqual([-1]);
	});

	it('survives a difference that wraps past sixteen bits', () => {
		const samples = parse(recording([
			[0, 0, -32000, 0, 0],
			[0, 10, 32000, 0, 0]
		]));
		expect(samples.gyro.x).toEqual([-32, 32]);
	});

	it('takes a stalled sensor as a jump in time rather than folding it back', () => {
		const samples = parse(recording([
			[0, 0, 0, 0, 0],
			[0, 100_000, 0, 0, 0]
		]));
		expect(samples.gyro.t).toEqual([0, 10_000]);
	});

	it('inflates what the watch deflated', async () => {
		const raw = recording([[1, 0, 1, 2, 3]]);
		const samples = await decode(new Uint8Array(deflateSync(raw)));
		expect(samples.accel.y).toEqual([0.01]);
	});

	it('refuses anything else', () => {
		expect(() => parse(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow();
	});
});

describe('finding shots', () => {
	/** A wrist at rest, or turning at `spin` rad/s, with a jolt of `jolt` m/s² at each time given. */
	function wrist(ms: number, jolts: number[], spin = 0.1, jolt = 35) {
		const samples = { gyro: { t: [], x: [], y: [], z: [] }, accel: { t: [], x: [], y: [], z: [] } } as {
			gyro: { t: number[]; x: number[]; y: number[]; z: number[] };
			accel: { t: number[]; x: number[]; y: number[]; z: number[] };
		};
		for (let t = 0; t < ms; t += 19) {
			samples.gyro.t.push(t);
			samples.gyro.x.push(spin);
			samples.gyro.y.push(0);
			samples.gyro.z.push(0);
			samples.accel.t.push(t);
			samples.accel.x.push(jolts.some((j) => t >= j && t < j + 19) ? jolt : 9.8);
			samples.accel.y.push(0);
			samples.accel.z.push(0);
		}
		return samples;
	}

	it('counts a release after a still hold', () => {
		expect(findShots(wrist(20_000, [5000, 12_000])).length).toBe(2);
	});

	it('ignores a jolt from an arm that was moving', () => {
		expect(findShots(wrist(20_000, [5000], 1.5))).toEqual([]);
	});

	it('takes a release ringing on as the same shot', () => {
		expect(findShots(wrist(20_000, [5000, 5500])).length).toBe(1);
	});

	it('needs a hold on record before it', () => {
		expect(findShots(wrist(20_000, [100]))).toEqual([]);
	});
});
