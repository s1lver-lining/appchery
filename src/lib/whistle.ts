import { get } from 'svelte/store';
import { BLASTS, type Signal } from './domain/timer';
import { timerVolume } from './prefs';

/**
 * The signals a shooting line runs on, synthesised rather than sampled.
 *
 * World Archery publishes the meaning of the blasts, not the sound of them: the recordings used at
 * competitions belong to whoever made them, so shipping one would be shipping somebody's property.
 * A whistle is a narrow band tone with a warble on it, which the Web Audio API makes honestly and in
 * a few hundred bytes rather than a few hundred kilobytes.
 */

const BLAST_MS = 700;
const GAP_MS = 260;
/** A referee's whistle sits around here, high enough to carry over a field. */
const PITCH_HZ = 2600;
/**
 * A slow, shallow trill rather than a warble. The signal used at a shoot is close to a steady tone:
 * a pitch that swings a dozen times inside one blast reads as a siren, which is a different sound
 * with a different meaning.
 */
const WARBLE_HZ = 5;
const WARBLE_DEPTH_HZ = 26;

let context: AudioContext | null = null;

function audio(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return null;
	context ??= new Ctor();
	return context;
}

/**
 * Browsers only allow sound after the archer has touched something, so the page unlocks the context
 * on the first tap. Without this the start blast of the first end is silent and nothing says why.
 */
export function unlockSound() {
	const ctx = audio();
	if (ctx?.state === 'suspended') void ctx.resume();
}

function blast(ctx: AudioContext, at: number, volume: number) {
	const tone = ctx.createOscillator();
	const warble = ctx.createOscillator();
	const depth = ctx.createGain();
	const gain = ctx.createGain();

	tone.type = 'sine';
	tone.frequency.value = PITCH_HZ;
	// The warble is what separates a whistle from a beep: the pitch wanders while the air moves.
	warble.type = 'sine';
	warble.frequency.value = WARBLE_HZ;
	depth.gain.value = WARBLE_DEPTH_HZ;
	warble.connect(depth).connect(tone.frequency);

	const end = at + BLAST_MS / 1000;
	gain.gain.setValueAtTime(0, at);
	gain.gain.linearRampToValueAtTime(volume, at + 0.03);
	gain.gain.setValueAtTime(volume, end - 0.06);
	gain.gain.linearRampToValueAtTime(0, end);

	tone.connect(gain).connect(ctx.destination);
	tone.start(at);
	warble.start(at);
	tone.stop(end);
	warble.stop(end);
}

/** Two to come to the line, one to start, three to collect, five to stop everything. */
export function whistle(signal: Signal, volume = get(timerVolume)) {
	const ctx = audio();
	if (!ctx) return;
	if (ctx.state === 'suspended') void ctx.resume();

	const level = Math.min(1, Math.max(0, volume));
	if (level === 0) return;
	const step = (BLAST_MS + GAP_MS) / 1000;
	for (let i = 0; i < BLASTS[signal]; i++) blast(ctx, ctx.currentTime + i * step, level);
}

/** How long a signal takes to sound, so a countdown can wait for its own start blast. */
export function whistleMs(signal: Signal): number {
	return BLASTS[signal] * BLAST_MS + (BLASTS[signal] - 1) * GAP_MS;
}
