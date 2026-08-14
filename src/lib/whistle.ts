import { get } from 'svelte/store';
import { BLASTS, type Signal } from './domain/timer';
import { timerVolume } from './prefs';

/**
 * The signals a shooting line runs on, synthesised rather than sampled.
 *
 * World Archery publishes the meaning of the blasts, not the sound of them: the recordings used at
 * competitions belong to whoever made them, so shipping one would be shipping somebody's property.
 * So the shape of the sound is measured off a recording and rebuilt here from oscillators, which
 * the Web Audio API makes honestly and in a few hundred bytes rather than a few hundred kilobytes.
 *
 * What the measurement says a pea whistle is: a tone near 2.6 kHz with almost no harmonic above it,
 * a pitch thrown about 400 Hz either way roughly fourteen times a second, an amplitude that swells
 * and nearly closes with it, and a wide band of breath noise around the tone that carries most of
 * its width. A steady sine has none of that and reads as a microwave.
 */

/** Body of one blast, then the pause before the next. Measured off the recording at just over half a second. */
const BLAST_MS = 560;
const GAP_MS = 260;
const ATTACK_S = 0.035;
/** It stops blowing rather than being cut off, which is most of what makes it sound like a whistle. */
const RELEASE_S = 0.18;

/** A referee's whistle sits around here, high enough to carry over a field. */
const PITCH_HZ = 2650;
/** The pea rattling: fast and deep, and the single biggest thing separating a whistle from a beep. */
const TRILL_HZ = 14;
const TRILL_DEPTH_HZ = 420;
/** A second, slower swing, so the trill never repeats exactly the way a lone oscillator would. */
const WOBBLE_HZ = 6.3;
const WOBBLE_DEPTH_HZ = 90;
/** The same rattle heard as loudness: the blast pulses rather than holding one level. */
const ROUGH_HZ = 7.5;
const ROUGH_DEPTH = 0.45;
/** Breath, filtered around the tone. Wide, because it is what gives the real thing its width. */
const NOISE_LEVEL = 0.55;
const NOISE_Q = 2.4;

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return null;
	context ??= new Ctor();
	return context;
}

/** One second of white noise, made once and looped: every blast breathes out of the same air. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
	if (noise) return noise;
	noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
	const samples = noise.getChannelData(0);
	for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
	return noise;
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
	const end = at + BLAST_MS / 1000;

	const tone = ctx.createOscillator();
	tone.type = 'sine';
	tone.frequency.value = PITCH_HZ;

	const trill = ctx.createOscillator();
	const trillDepth = ctx.createGain();
	trill.frequency.value = TRILL_HZ;
	trillDepth.gain.value = TRILL_DEPTH_HZ;
	trill.connect(trillDepth).connect(tone.frequency);

	const wobble = ctx.createOscillator();
	const wobbleDepth = ctx.createGain();
	wobble.frequency.value = WOBBLE_HZ;
	wobbleDepth.gain.value = WOBBLE_DEPTH_HZ;
	wobble.connect(wobbleDepth).connect(tone.frequency);

	const breath = ctx.createBufferSource();
	const band = ctx.createBiquadFilter();
	const breathGain = ctx.createGain();
	breath.buffer = noiseBuffer(ctx);
	breath.loop = true;
	band.type = 'bandpass';
	band.frequency.value = PITCH_HZ;
	band.Q.value = NOISE_Q;
	breathGain.gain.value = NOISE_LEVEL;

	// Loudness rides the same rattle as the pitch, which is why the two are one sound and not two.
	const rough = ctx.createOscillator();
	const roughDepth = ctx.createGain();
	const pulse = ctx.createGain();
	rough.frequency.value = ROUGH_HZ;
	roughDepth.gain.value = ROUGH_DEPTH;
	pulse.gain.value = 1 - ROUGH_DEPTH;
	rough.connect(roughDepth).connect(pulse.gain);

	// Tone and breath sum above one, so the shape carries the level rather than the parts.
	const shape = ctx.createGain();
	const peak = volume * 0.65;
	shape.gain.setValueAtTime(0.0001, at);
	shape.gain.linearRampToValueAtTime(peak, at + ATTACK_S);
	shape.gain.setValueAtTime(peak, end - RELEASE_S);
	shape.gain.exponentialRampToValueAtTime(0.0001, end);

	tone.connect(pulse);
	breath.connect(band).connect(breathGain).connect(pulse);
	pulse.connect(shape).connect(ctx.destination);

	for (const source of [tone, trill, wobble, rough, breath]) {
		source.start(at);
		source.stop(end);
	}
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
