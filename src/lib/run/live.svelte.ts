import {
	addFix,
	currentPace,
	emptyTrack,
	paceOf,
	replayTracked,
	HEART_MIN_SAMPLES,
	type TrackState,
	type TrackedFix
} from '$lib/domain/run/track';
import {
	flatten,
	workoutPace,
	workoutTotals,
	type BlockKind,
	type RunStep,
	type RunWorkout
} from '$lib/domain/run/workout';
import { elapsed, emptyLive, type RunRecord, type StepResult } from '$lib/domain/running';
import { appendRunPoints, clearRunPoints, listRunPoints, updateRun } from '$lib/db/repository';
import { screenLock } from '$lib/ui/wakeLock';
import { zoneOf } from '$lib/domain/run/zones';
import { autoPauseRuns, maxHeartRate } from '$lib/prefs';
import { get } from 'svelte/store';
import { commit, tap, warn } from '$lib/haptics';
import { trackingSource, type Source, type StartFailure } from './source';
import { acceptHeart, acceptRunCommands, endMirroredRun, mirrorRun } from '$lib/watch/mirror';
import { handDown, takeBack } from './handover';
import type { RunFrame } from '$lib/watch/link';
import type { RunCommand, RunStatus } from '$lib/watch/protocol';

/**
 * A run as it happens: the clock, the totals, the block being run, and the writing of all three.
 *
 * It owns the clock rather than reading one off the fixes, because a run is paused at crossings and
 * a pause has to stop the time without stopping the recording. Everything it works out comes from
 * domain/run, so what is here is the sequencing: when to ask for fixes, when to write, and what a
 * button means.
 *
 * Nothing is kept only in memory. The clock, the step being run and the totals are written to the
 * activity every few seconds and every time a button is pressed, so a phone that kills the app mid
 * run loses seconds rather than a run, see doc/running.md.
 */

/** How often the fixes gathered by the service are taken and the totals redrawn. */
const POLL_MS = 1000;
/** How often the run is written down while nothing else is happening. */
const SAVE_MS = 5000;
/**
 * How often the wrist is told, when nothing has happened worth telling it about at once. A run is a
 * screen that changes every second, but a watch reading a second old clock is reading the run, and
 * halving the writes halves what the link has to carry for a whole hour.
 */
const MIRROR_MS = 2000;
/**
 * How old a beat may be before it is no longer what the runner's heart is doing. The watch sends one
 * every few seconds; past this the wrist is out of range or the sensor has lost the skin, and a fix
 * stamped with it would be claiming a reading nobody took.
 */
const BEAT_STALE_MS = 20_000;
/** An hour of a beat every few seconds, which is longer than any fix still waiting to be written. */
const BEAT_LOG_MOST = 1200;
/**
 * How long a run goes nowhere before it holds its own clock, where that has been asked for. Long
 * enough that a fix rejected at a corner is not a pause, short enough that a crossing is.
 */
const STILL_MS = 12_000;

export class LiveRun {
	activityId = $state('');
	record = $state<RunRecord | null>(null);
	track = $state<TrackState>(emptyTrack());
	/** Ticked by the poll so every derived clock on screen redraws together. */
	now = $state(Date.now());
	/** Why tracking could not start, shown in place of the numbers rather than in a dialog. */
	failure = $state<StartFailure | null>(null);
	/** False in a browser, where a tab put to sleep stops receiving: the screen says so. */
	background = $state(true);
	/**
	 * Held by the app rather than by the runner, and let go again by itself the moment they move.
	 *
	 * A pause of its own kind: the clock stops but the receiver is left listening, because a run
	 * that stopped listening could never notice the runner starting again. It also means the
	 * standing about is visible in the stored track, which is what draws it on the graph afterwards.
	 */
	autoHeld = $state(false);

	private source: Source | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private lastSaved = 0;
	private lock = screenLock(() =>
		'wakeLock' in navigator ? navigator.wakeLock.request('screen') : undefined
	);
	private pending: TrackedFix[] = [];
	private lastMirrored = 0;
	/**
	 * Beats off the wrist waiting for a fix to be written on. A list rather than the last one,
	 * because a page that has been frozen takes back everything the service heard while it slept and
	 * has to put each sample where it belongs rather than stamping a whole batch with the newest.
	 */
	private beatLog: { bpm: number; at: number }[] = [];
	/** The run's beats as they are written, kept as a total rather than as a list of every one. */
	private beats = { sum: 0, count: 0, max: 0 };
	/** When the run last covered any ground, which is the only thing auto pause is judged on. */
	private movedAt = 0;
	/** What the wrist was last told, so a block change or a pause is sent the moment it happens. */
	private mirroredCue = -1;
	private mirroredStatus = '';

	get steps(): RunStep[] {
		return this.record?.workout ? flatten(this.record.workout) : [];
	}

	get seconds(): number {
		return elapsed(this.record?.live ?? null, this.now);
	}

	get status() {
		return this.record?.live?.status ?? 'idle';
	}

	get distanceM(): number {
		return this.track.distanceM;
	}

	get pace(): number | null {
		return currentPace(this.track, this.seconds);
	}

	get averagePace(): number | null {
		return paceOf(this.track.distanceM, this.seconds);
	}

	/** The step being run, which is the one the runner jumped to or the one the clock has reached. */
	get step(): RunStep | null {
		const key = this.record?.live?.stepKey ?? null;
		return this.steps.find((step) => step.key === key) ?? null;
	}

	/** How far into the current block the run is, in its own unit, and how much of it is done. */
	get stepProgress(): { done: number; goal: number | null; share: number } {
		const from = this.record?.live?.stepFrom ?? { seconds: 0, distanceM: 0 };
		const step = this.step;
		const seconds = Math.max(0, this.seconds - from.seconds);
		const metres = Math.max(0, this.track.distanceM - from.distanceM);
		if (!step || step.goal.type === 'open') return { done: seconds, goal: null, share: 0 };
		const goal = step.goal.type === 'time' ? step.goal.seconds : step.goal.metres;
		const done = step.goal.type === 'time' ? seconds : metres;
		return { done, goal, share: goal > 0 ? Math.min(1, done / goal) : 0 };
	}

	/** Seconds per kilometre being held inside this block, which is what a target pace is judged against. */
	get stepPace(): number | null {
		const from = this.record?.live?.stepFrom ?? { seconds: 0, distanceM: 0 };
		return paceOf(this.track.distanceM - from.distanceM, this.seconds - from.seconds);
	}

	/** Counted up on every block change, so a watch can tell a new block from a redrawn one. */
	cue = $state(0);

	/**
	 * The beat as the wrist last reported it, for the screen. Held apart from the log because the
	 * log is written to be read by the fixes and this is written to be read by a page: it goes back
	 * to nothing the moment the wrist stops talking, so the run never shows a heart rate from
	 * five minutes ago as though it were the runner's now.
	 */
	heart = $state<number | null>(null);

	get glance(): RunGlance {
		const steps = this.steps;
		const step = this.step;
		const progress = this.stepProgress;
		const after = step ? steps[steps.findIndex((one) => one.key === step.key) + 1] : undefined;
		return {
			status: this.status,
			seconds: this.seconds,
			distanceM: this.distanceM,
			pace: this.pace,
			averagePace: this.averagePace,
			cue: this.cue,
			step: step
				? {
						kind: step.kind,
						label: step.label,
						index: this.steps.findIndex((one) => one.key === step.key) + 1,
						count: this.steps.length,
						repeat: step.repeat,
						repeatOf: step.repeatOf,
						targetPace: step.targetPace,
						leftSeconds:
							step.goal.type === 'time' && progress.goal !== null
								? Math.max(0, progress.goal - progress.done)
								: null,
						leftMetres:
							step.goal.type === 'distance' && progress.goal !== null
								? Math.max(0, progress.goal - progress.done)
								: null,
						goalSeconds: step.goal.type === 'time' ? step.goal.seconds : null,
						goalMetres: step.goal.type === 'distance' ? step.goal.metres : null
					}
				: null,
			freeSeconds: this.freeSeconds,
			zone: zoneOf(this.heart, get(maxHeartRate)),
			next: after
				? {
						kind: after.kind,
						targetPace: after.targetPace,
						goalSeconds: after.goal.type === 'time' ? after.goal.seconds : null,
						goalMetres: after.goal.type === 'distance' ? after.goal.metres : null
					}
				: null,
			planned: this.record?.workout ? plannedOf(this.record.workout) : null
		};
	}

	/**
	 * Woken by the phone being picked up rather than by a tick. A paused run has no fixes and no
	 * ticks, so nothing else would ever ask the service what happened while the screen was off.
	 */
	async resumed() {
		if (!this.activityId || !this.record) return;
		if (this.status === 'running' || this.status === 'paused') {
			await this.adopt();
			this.now = Date.now();
			if (this.status === 'running') this.startPolling();
		}
	}

	async open(activityId: string, record: RunRecord) {
		this.activityId = activityId;
		this.record = record;
		this.source = trackingSource();
		this.background = this.source.background;
		// The buttons on the wrist, which ask rather than decide: the run is driven from one place.
		acceptRunCommands((command) => void this.command(command));
		// And what the wrist measures rather than asks for, which travels the other way.
		acceptHeart((bpm, at) => this.heard(bpm, at));
		const stored = await listRunPoints(activityId);
		this.track = replayTracked(stored);
		// Carried on from what is already written, so a run reopened averages over the whole of it.
		this.beats = { sum: 0, count: 0, max: 0 };
		this.heart = null;
		for (const point of stored) this.count(point.heartRate ?? null);
		this.now = Date.now();
		// A run reopened while it was still running carries on: the service never stopped.
		if (record.live?.status === 'running') await this.begin(false);
		else if (record.live?.status === 'paused') {
			await this.adopt();
			this.tick();
		}
		else await this.mirror(true);
	}

	/** A button on the watch. Refused where it makes no sense, so a stale wrist cannot restart a run. */
	async command(command: RunCommand) {
		if (command === 'lap') await this.lap();
		else if (command === 'go' && this.status === 'idle') await this.start();
		else if (command === 'resume' && this.status === 'paused') await this.start();
		else if (command === 'pause' && this.status === 'running') await this.pause();
		else if (command === 'stop' && (this.status === 'running' || this.status === 'paused')) {
			await this.stop();
		}
	}

	async close() {
		this.stopPolling();
		await this.flush();
		if (this.status === 'running' || this.status === 'paused') {
			/*
			 * Left mid run, going or held. Nothing is stopped: the service is what keeps this
			 * process alive, and a paused run whose service was stopped is a run nobody can start
			 * again, from the wrist or from here. The wrist keeps the run, so its buttons have to
			 * keep reaching this page for as long as it lasts.
			 */
			acceptRunCommands((command) => void this.command(command));
			return;
		}
		this.lock.release();
		await this.source?.stop();
		// The wrist is given its screen back: a run page left behind would sit there for good.
		await this.mirror(true, 'd');
		endMirroredRun();
	}

	async start() {
		const live = this.record?.live;
		if (!live || live.status === 'running') return;
		this.autoHeld = false;
		this.movedAt = Date.now();
		const fresh = live.status === 'idle';
		if (fresh) await clearRunPoints(this.activityId);
		live.startedAt = live.startedAt ?? Date.now();
		live.legStartedAt = Date.now();
		live.status = 'running';
		if (fresh && live.stepKey === null) live.stepKey = this.steps[0]?.key ?? null;
		commit();
		await this.begin(fresh);
		await this.save();
		await this.mirror(true);
	}

	async pause() {
		const live = this.record?.live;
		if (!live || live.status !== 'running') return;
		// Asked for by hand, so the app has no business letting go of it again.
		this.autoHeld = false;
		live.baseSeconds = elapsed(live, Date.now());
		live.legStartedAt = null;
		live.status = 'paused';
		tap();
		// Held rather than stopped: the service is what keeps this process alive to be resumed.
		await this.source?.hold();
		this.lock.release();
		await this.save();
		await this.mirror(true);
	}

	async stop() {
		const live = this.record?.live;
		if (!live || !this.record) return;
		if (live.status === 'running') live.baseSeconds = elapsed(live, Date.now());
		live.legStartedAt = null;
		// Whatever the service gathered and nobody has taken yet: the last minutes of a run ended
		// from the wrist are in that buffer, and a run that stops before draining it loses them.
		await this.ingest().catch(() => undefined);
		live.status = 'done';
		this.closeStep();
		this.stopPolling();
		await this.source?.stop();
		this.lock.release();
		// The two numbers every other part of the app reads, filled from what was measured.
		this.record.distanceM = Math.round(this.track.distanceM) || null;
		this.record.durationSeconds = Math.round(live.baseSeconds) || null;
		this.record.splits = this.track.splits;
		this.record.elevationGainM = Math.round(this.track.elevationGainM);
		this.writeBeats();
		commit();
		await this.flush();
		await this.save();
		await this.mirror(true);
		endMirroredRun();
	}

	/**
	 * A lap, taken by hand.
	 *
	 * The kilometres are arithmetic and a lap is a decision: the top of the hill, the lamp post
	 * somebody sprinted to, the moment the interval actually started. It is measured from the last
	 * one rather than from the start, because what a lap is worth is what it took on its own.
	 */
	async lap() {
		const live = this.record?.live;
		if (!live || !this.record) return;
		if (live.status !== 'running' && live.status !== 'paused') return;
		const from = this.record.laps.reduce(
			(sum, lap) => ({ seconds: sum.seconds + lap.seconds, distanceM: sum.distanceM + lap.distanceM }),
			{ seconds: 0, distanceM: 0 }
		);
		const seconds = Math.round(Math.max(0, this.seconds - from.seconds));
		const distanceM = Math.round(Math.max(0, this.track.distanceM - from.distanceM));
		// A lap of nothing is a button pressed twice, which is not a lap.
		if (seconds < 1) return;
		this.record.laps = [
			...this.record.laps,
			{ index: this.record.laps.length + 1, distanceM, seconds }
		];
		commit();
		await this.save();
	}

	/** The block the runner says they are on, which always beats the one the clock thinks they are on. */
	async jumpTo(key: string) {
		const live = this.record?.live;
		if (!live) return;
		this.closeStep();
		live.stepKey = key;
		live.stepFrom = { seconds: this.seconds, distanceM: this.track.distanceM };
		this.cue++;
		tap();
		await this.save();
		await this.mirror(true);
	}

	/** The next block, which is what finishing one does and what the skip button does by hand. */
	async advance() {
		const steps = this.steps;
		const at = steps.findIndex((step) => step.key === this.record?.live?.stepKey);
		const next = steps[at + 1];
		if (next) await this.jumpTo(next.key);
		else await this.goFree();
	}

	/**
	 * The programme is done and the run is not.
	 *
	 * A finished programme used to stop the run, which is the app deciding that the session is over
	 * because the plan ran out. It is not: the way home from the track is a run, and a warm down
	 * nobody wrote down is still time on the feet. So the blocks end and the clock carries on with
	 * nothing to hold and nothing counting down, until the runner says otherwise.
	 */
	async goFree() {
		const live = this.record?.live;
		if (!live || live.stepKey === null) return;
		this.closeStep();
		live.stepKey = null;
		live.stepFrom = { seconds: this.seconds, distanceM: this.track.distanceM };
		// Felt like any other block change, because it is one: the last one has just ended.
		this.cue++;
		commit();
		await this.save();
		await this.mirror(true);
	}

	/**
	 * How long the run has been running to nothing, or null where it is not. Only after a programme:
	 * a run that never had one is free from the first stride and has a page of its own that says so.
	 */
	get freeSeconds(): number | null {
		const live = this.record?.live;
		if (!live || live.stepKey !== null || this.steps.length === 0) return null;
		if (live.status !== 'running' && live.status !== 'paused') return null;
		return Math.max(0, this.seconds - live.stepFrom.seconds);
	}

	private async begin(fresh: boolean) {
		this.failure = await (this.source?.start(fresh) ?? Promise.resolve('unsupported' as const));
		if (this.failure) {
			warn();
			const live = this.record?.live;
			if (live && live.status === 'running') {
				live.status = 'paused';
				live.baseSeconds = elapsed(live, Date.now());
				live.legStartedAt = null;
			}
			await this.save();
			return;
		}
		this.lock.acquire();
		this.startPolling();
	}

	private startPolling() {
		if (this.timer) return;
		this.timer = setInterval(() => void this.tick(), POLL_MS);
	}

	private stopPolling() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	/** One pass: the clock forward, the fixes in, the block checked, and the run written if it is due. */
	private async tick() {
		const slept = Date.now() - this.now > WOKE_MS;
		this.now = Date.now();
		// Frozen by Android and thawed again: the service ran the run in the meantime, so what it
		// did is taken back before anything here is worked out on top of a block it has left.
		if (slept && this.status === 'running') await this.adopt();
		// A run held by the app is still listening, or it could never hear the runner start again.
		if (this.status === 'running' || this.autoHeld) await this.ingest();
		await this.judgeStillness();
		if (this.status === 'running') this.checkStep();
		// The wrist gone quiet is not a heart that stopped, but it is not a heart rate either.
		if (this.heart !== null && Date.now() - (this.beatLog[this.beatLog.length - 1]?.at ?? 0) > BEAT_STALE_MS) {
			this.heart = null;
		}
		if (this.record && Date.now() - this.lastSaved > SAVE_MS) await this.save();
		await this.mirror();
	}

	/**
	 * The run on the wrist. A block change and a pause go out at once because they are what the
	 * runner is waiting to feel; everything else waits for the tick after the last one.
	 */
	private async mirror(now = false, as?: RunStatus) {
		if (!this.record || this.record.mode !== 'tracked') return;
		const glance = this.glance;
		const changed = glance.cue !== this.mirroredCue || glance.status !== this.mirroredStatus;
		if (!now && !changed && Date.now() - this.lastMirrored < MIRROR_MS) return;
		this.lastMirrored = Date.now();
		this.mirroredCue = glance.cue;
		this.mirroredStatus = glance.status;
		const status: RunStatus =
			as ??
			(glance.status === 'running' ? 'r' : glance.status === 'paused' ? 'p' : glance.status === 'done' ? 'd' : 'i');
		const frame: RunFrame = {
			status,
			seconds: glance.seconds,
			distanceM: glance.distanceM,
			pace: glance.pace,
			averagePace: glance.averagePace,
			cue: glance.cue,
			freeSeconds: glance.freeSeconds,
			zone: glance.zone,
			block: glance.step
				? {
						kind: glance.step.kind,
						label: glance.step.label,
						index: glance.step.index,
						count: glance.step.count,
						repeat: glance.step.repeat,
						repeatOf: glance.step.repeatOf,
						targetPace: glance.step.targetPace,
						leftSeconds: glance.step.leftSeconds,
						leftMetres: glance.step.leftMetres,
						goalSeconds: glance.step.goalSeconds,
						goalMetres: glance.step.goalMetres
					}
				: null,
			next: glance.next,
			planned: glance.planned
		};
		// A watch that is not there is not an error: the mirror is a no-op with no link.
		await mirrorRun(frame).catch(() => undefined);
		// And the same run handed to the service, which speaks for this page once Android stops
		// calling it: a run is spent with the screen off, see doc/running.md.
		await handDown(frame, this.steps, this.record.live);
	}

	/**
	 * What the service did while this page was frozen. Its own track is still the record, so only
	 * what cannot be rebuilt from that is adopted: which block the run reached, when it changed, and
	 * what the blocks it finished came to.
	 */
	private async adopt() {
		const taken = await takeBack();
		const live = this.record?.live;
		if (!taken || !live || !this.record) return;

		// Every beat the wrist reported while nobody here was listening, each back where it belongs.
		for (const sample of taken.hr ?? []) this.heard(sample.b, sample.at);
		this.beatLog.sort((a, b) => a.at - b.at);

		const steps = this.steps;
		for (const done of taken.done) {
			const step = steps[done.i];
			if (!step) continue;
			this.record.steps = [
				...this.record.steps.filter((result) => result.key !== step.key),
				{ key: step.key, distanceM: done.d, seconds: done.s }
			];
		}
		// The programme ran out while nobody was listening, and the run went on without it.
		if (taken.free && live.stepKey !== null) {
			live.stepKey = null;
			live.stepFrom = { seconds: taken.fs, distanceM: taken.fd };
			this.cue = Math.max(this.cue, taken.c);
		}
		const reached = taken.i >= 0 ? steps[taken.i] : null;
		if (reached && live.stepKey !== reached.key) {
			live.stepKey = reached.key;
			live.stepFrom = { seconds: taken.fs, distanceM: taken.fd };
			this.cue = Math.max(this.cue, taken.c);
		}

		/*
		 * And what the buttons on the wrist did. A run paused from the watch with the screen off was
		 * paused by the service, because a frozen page cannot answer a button: the page finds out
		 * here, and takes the clock the service stopped rather than the one it was running itself.
		 */
		if (taken.st === 'p' && live.status === 'running') {
			live.baseSeconds = taken.s;
			live.legStartedAt = null;
			live.status = 'paused';
			this.lock.release();
		} else if (taken.st === 'r' && live.status === 'paused') {
			live.baseSeconds = taken.s;
			live.legStartedAt = Date.now();
			live.status = 'running';
			await this.begin(false);
		} else if (taken.st === 'd' && live.status !== 'done') {
			live.baseSeconds = taken.s;
			live.legStartedAt = null;
			await this.stop();
			return;
		}
		await this.save();
	}

	/**
	 * A beat off the wrist. Kept rather than written: it is stamped onto the next fix that lands, so
	 * the heart rate is read back exactly where the runner was when it was measured, which is what a
	 * GPX wants and what the graph draws.
	 */
	heard(bpm: number, at: number) {
		if (!Number.isFinite(bpm) || bpm <= 0) return;
		this.beatLog.push({ bpm: Math.round(bpm), at });
		this.heart = Math.round(bpm);
		// An hour of a beat every few seconds. Past that, the samples are older than any fix waiting.
		if (this.beatLog.length > BEAT_LOG_MOST) this.beatLog.splice(0, this.beatLog.length - BEAT_LOG_MOST);
	}

	/** What the beat does to the run's totals, counted once per fix it is written on. */
	private count(bpm: number | null) {
		if (!bpm || bpm <= 0) return;
		this.beats.sum += bpm;
		this.beats.count++;
		if (bpm > this.beats.max) this.beats.max = bpm;
	}

	/** The beat to write on a fix: the newest sample taken before it, while that is recent enough. */
	private beatFor(at: number): number | null {
		let found: { bpm: number; at: number } | null = null;
		for (const sample of this.beatLog) {
			if (sample.at > at) break;
			found = sample;
		}
		return found && at - found.at <= BEAT_STALE_MS ? found.bpm : null;
	}

	/**
	 * Whether the run is going anywhere, where the archer asked the app to care.
	 *
	 * Only while the page is awake. With the screen off the service is what keeps the run, and it
	 * has no opinion about this: a run in a pocket is timed the way it always was, see doc/running.md.
	 */
	private async judgeStillness() {
		if (!get(autoPauseRuns)) {
			if (this.autoHeld) await this.letGo();
			return;
		}
		if (this.status === 'running' && this.movedAt > 0 && Date.now() - this.movedAt > STILL_MS) {
			await this.hold();
		} else if (this.autoHeld && Date.now() - this.movedAt <= STILL_MS) {
			await this.letGo();
		}
	}

	/** The clock stopped without the receiver being stopped with it, which is what lets it start again. */
	private async hold() {
		const live = this.record?.live;
		if (!live || live.status !== 'running') return;
		live.baseSeconds = elapsed(live, Date.now());
		live.legStartedAt = null;
		live.status = 'paused';
		this.autoHeld = true;
		tap();
		this.lock.release();
		await this.save();
		await this.mirror(true);
	}

	/** Moving again, so the clock is too. */
	private async letGo() {
		const live = this.record?.live;
		this.autoHeld = false;
		if (!live || live.status !== 'paused') return;
		live.legStartedAt = Date.now();
		live.status = 'running';
		tap();
		this.lock.acquire();
		await this.save();
		await this.mirror(true);
	}

	private async ingest() {
		const fixes = (await this.source?.drain()) ?? [];
		if (fixes.length === 0) return;
		let state = this.track;
		const seconds = this.seconds;
		for (const fix of fixes) {
			// The clock as it was when the fix was taken, so a batch drained at once is not stamped alike.
			const at = Math.max(0, seconds - (this.now - fix.at) / 1000);
			const taken = addFix(state, fix, at);
			if (!taken.moved) continue;
			this.movedAt = Date.now();
			state = taken.state;
			const heartRate = this.beatFor(fix.at);
			this.count(heartRate);
			this.pending.push({ ...fix, elapsedSeconds: at, heartRate });
		}
		this.track = state;
		if (this.pending.length >= 10) await this.flush();
	}

	private async flush() {
		if (this.pending.length === 0 || !this.activityId) return;
		const writing = this.pending;
		this.pending = [];
		await appendRunPoints(this.activityId, writing);
	}

	/** A block ends when what it asked for is done, and the next one starts without a tap. */
	private checkStep() {
		const step = this.step;
		if (!step || step.goal.type === 'open') return;
		const { done, goal } = this.stepProgress;
		if (goal === null || done < goal) return;
		// Felt rather than read: the block changing is the one thing worth a buzz mid interval.
		commit();
		void this.advance();
	}

	/** What the block just left actually came to, recorded before the next one starts counting. */
	private closeStep() {
		const live = this.record?.live;
		if (!live?.stepKey || !this.record) return;
		const result: StepResult = {
			key: live.stepKey,
			distanceM: Math.round(Math.max(0, this.track.distanceM - live.stepFrom.distanceM)),
			seconds: Math.round(Math.max(0, this.seconds - live.stepFrom.seconds))
		};
		this.record.steps = [...this.record.steps.filter((step) => step.key !== result.key), result];
	}

	/** The run's own heart figures, out of the totals kept as the fixes were written. */
	private writeBeats() {
		if (!this.record || this.beats.count < HEART_MIN_SAMPLES) return;
		this.record.averageHeartRate = Math.round(this.beats.sum / this.beats.count);
		this.record.maxHeartRate = this.beats.max;
	}

	/** An edit made on the page rather than by the run: the effort felt, a number put right afterwards. */
	async persist() {
		await this.save();
	}

	/** The programme this run will be made of, copied in so the library can be edited afterwards. */
	async setWorkout(workout: RunWorkout | null) {
		if (!this.record || this.status !== 'idle') return;
		this.record.workout = workout;
		this.record.live = { ...(this.record.live ?? { ...emptyLive() }), stepKey: null };
		await this.save();
		// The wrist is shown what it would be starting, so the programme picked reaches it at once.
		await this.mirror(true);
	}

	/** Tracked or typed, chosen before anything is recorded and never after. */
	async setMode(mode: 'manual' | 'tracked') {
		if (!this.record || this.status === 'running') return;
		this.record.mode = mode;
		this.record.live = mode === 'tracked' ? (this.record.live ?? emptyLive()) : null;
		await this.save();
	}

	private async save() {
		if (!this.record) return;
		this.lastSaved = Date.now();
		const live = this.record.live;
		// While it runs, the two numbers hold what it has come to, so a crash leaves a run worth keeping.
		if (this.record.mode === 'tracked' && live && live.status !== 'done') {
			this.record.distanceM = Math.round(this.track.distanceM) || null;
			this.record.durationSeconds = Math.round(this.seconds) || null;
			this.record.splits = this.track.splits;
			this.record.elevationGainM = Math.round(this.track.elevationGainM);
			this.writeBeats();
		}
		await updateRun(this.activityId, $state.snapshot(this.record) as RunRecord);
	}
}

/** Longer than a tick and shorter than a pause at a crossing: a gap this big is a page that slept. */
const WOKE_MS = 6000;

/**
 * The run in one small object, for a screen that is not this one.
 *
 * The watch shows what the phone shows and localises it itself, so what travels is numbers and a
 * block kind rather than sentences. `cue` counts block changes: the watch buzzes and lights up when
 * it goes up, which is the one thing a runner needs from a wrist mid interval, see doc/running.md.
 */
export interface RunGlance {
	status: 'idle' | 'running' | 'paused' | 'done';
	seconds: number;
	distanceM: number;
	pace: number | null;
	averagePace: number | null;
	cue: number;
	/** Seconds since the programme ran out, or null while there is still a block to run. */
	freeSeconds: number | null;
	/** Which zone the beat off the wrist is in, for the wrist to colour itself by. */
	zone: number | null;
	step: {
		kind: BlockKind;
		label: string | null;
		index: number;
		count: number;
		repeat: number;
		repeatOf: number;
		targetPace: number | null;
		/** What is left of the block, in seconds or in metres, which is what the watch counts down. */
		leftSeconds: number | null;
		leftMetres: number | null;
		/** What it asks for in total, which is what turns what is left into a proportion done. */
		goalSeconds: number | null;
		goalMetres: number | null;
	} | null;
	/** The block after this one, because knowing what is coming is half of running an interval. */
	next: {
		kind: BlockKind;
		targetPace: number | null;
		goalSeconds: number | null;
		goalMetres: number | null;
	} | null;
	/** What the programme asks for in total: the whole of what there is to show before the start. */
	planned: { seconds: number; metres: number; pace: number | null } | null;
}

function plannedOf(workout: RunWorkout) {
	const totals = workoutTotals(workout);
	return { seconds: totals.seconds, metres: totals.metres, pace: workoutPace(workout) };
}

/** What a workout's steps are called on screen when the runner named none of them. */
export function stepName(step: RunStep, names: Record<string, string>): string {
	return step.label?.trim() || names[step.kind] || step.kind;
}

export type { RunWorkout };
