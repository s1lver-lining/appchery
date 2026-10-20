<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import { scoreAt } from '$lib/domain/rounds/geometry';
	import { WA_10_RING } from '$lib/domain/rounds/seed';
	import { downscale } from '$lib/vision/pixels';
	import type { Frame } from '$lib/vision/types';
	import { DOUBT_SCALE, fitAgreement, seenOn } from './doubt';
	import { textureTurn, unroll } from './texture';
	import { FACE_TYPES, arrowsOn, empty, turned, type Point } from './format';
	import { bestTurn, ringsOf, type Tap } from './fit';
	import Stage, { type Guess } from './Stage.svelte';
	import Player from './Player.svelte';
	import { SCORERS, LATEST, LATEST_SCORER, choiceOf } from '$lib/vision/scorers';
	import {
		Saver,
		options,
		setNocks,
		stepsShown,
		view,
		addFace,
		removeFace,
		setReference,
		arrowsChecked,
		arrowsPlaced,
		bestFrame,
		countOf,
		ensureFrame,
		faceDecided,
		faceOf,
		fitHere,
		frameFace,
		hasFace,
		labelsOf,
		nextTask,
		nockFrames,
		nocksWanted,
		progressOf,
		setHidden,
		type Recording,
		type Step
	} from './session.svelte';

	let recordings = $state<Recording[]>([]);
	let readOnly = $state(false);
	let loading = $state(true);
	let current = $state(0);
	let frame = $state(0);
	let step = $state<Step>('face');
	let listOpen = $state(false);
	let todoOnly = $state(true);
	let help = $state(false);
	let playing = $state(false);

	let image = $state<HTMLImageElement | null>(null);
	let pixels = $state<ImageData | null>(null);
	let guesses = $state<Guess[]>([]);
	let selected = $state<number | null>(null);
	let target = $state<number | null>(null);
	let taps = $state<Tap[]>([]);
	let tapRing = $state<number | null>(null);
	let stage = $state<ReturnType<typeof Stage> | null>(null);
	let toast = $state<{ text: string; undo?: () => void } | null>(null);
	let flash = $state(0);
	let party = $state(0);
	let scorecard = $state<{ state: 'idle' | 'running' | 'done' | 'failed'; result?: Record<string, number | string | null>; error?: string }>({ state: 'idle' });

	const saver = new Saver(() => readOnly);
	const rec = $derived(recordings[current] as Recording | undefined);
	const face = $derived(rec ? faceOf(rec) : null);
	const progress = $derived(rec ? progressOf(rec) : null);
	const totals = $derived.by(() => {
		let done = 0;
		let work = 0;
		let all = 0;
		for (const r of recordings) {
			const p = progressOf(r);
			if (p.done) done += 1;
			work += p.faces + p.checked + p.nocked;
			all += p.frames * 2 + p.nockGoal;
		}
		return { done, work, all };
	});
	const shown = $derived(
		recordings.map((r, i) => ({ r, i, p: progressOf(r) })).filter(({ p, i }) => !todoOnly || !p.done || i === current)
	);
	const placing = $derived(step === 'arrows' && face !== null && (face.placedOn === null || face.placedOn === frame));
	const wanted = $derived(rec && step === 'nocks' ? nocksWanted(rec, frame) : []);

	onMount(async () => {
		const answer = await (await fetch('/__label/manifest')).json();
		readOnly = answer.readOnly;
		// Made here, never on the way through a derived value, where writing state is not allowed.
		recordings = answer.recordings.map((r: Recording) => ({ ...r, labels: r.labels ?? empty() }));
		unprepared = answer.unprepared ?? [];
		loading = false;
		const first = recordings.findIndex((r) => !progressOf(r).done);
		open(first < 0 ? 0 : first);
	});

	/** Every state this recording has been in since it was opened, newest last, for undo. */
	let history: string[] = [];
	const snapshot = (r: Recording) => JSON.stringify($state.snapshot(labelsOf(r)));

	function changed() {
		if (!rec) return;
		const now = snapshot(rec);
		if (now !== history[history.length - 1]) {
			history.push(now);
			if (history.length > 300) history.shift();
		}
		saver.soon(rec);
		rejudge();
	}

	function undo() {
		if (!rec || history.length < 2) return say('Nothing to undo.');
		history.pop();
		rec.labels = JSON.parse(history[history.length - 1]);
		selected = null;
		stage?.clearTaps();
		if (placing) guess();
		if (step === 'nocks') target = nocksWanted(rec, frame)[0] ?? null;
		saver.soon(rec);
	}

	/** Opens a recording at the first thing it still wants. */
	function open(index: number) {
		current = index;
		listOpen = false;
		scorecard = { state: 'idle' };
		const r = recordings[index];
		if (!r) return;
		history = [snapshot(r)];
		const task = nextTask(r);
		view.face = task.face;
		fitDoubts = {};
		smalls.clear();
		void judgeAll(r);
		go(task.frame, task.step);
	}

	/**
	 * Frames whose rings do not read the colours they should. Arrows are not judged: the detector they would
	 * be judged against is the thing being measured, and it flagged frames that were right.
	 */
	let fitDoubts = $state<Record<number, string>>({});
	const smalls = new Map<string, Frame>();

	async function smallOf(r: Recording, i: number): Promise<Frame | null> {
		const key = `${r.video}/${i}`;
		const known = smalls.get(key);
		if (known) return known;
		const img = new Image();
		img.src = `/__label/image/${encodeURIComponent(r.video)}/${r.samples[i]}`;
		try {
			await img.decode();
		} catch {
			return null;
		}
		const off = document.createElement('canvas');
		off.width = Math.floor(img.naturalWidth / DOUBT_SCALE);
		off.height = Math.floor(img.naturalHeight / DOUBT_SCALE);
		const c = off.getContext('2d', { willReadFrequently: true })!;
		c.drawImage(img, 0, 0, off.width, off.height);
		const small = { width: off.width, height: off.height, data: c.getImageData(0, 0, off.width, off.height).data };
		smalls.set(key, small);
		return small;
	}

	async function judge(r: Recording, i: number) {
		const small = await smallOf(r, i);
		if (!small || recordings[current] !== r) return;
		const f = faceOf(r);
		if (!hasFace(r, i)) {
			delete fitDoubts[i];
			return;
		}
		const agree = fitAgreement(small, fitHere(r, i), f.type);
		if (agree !== null && agree < 0.5) fitDoubts[i] = `Rings match only ${Math.round(agree * 100)}% of the colours`;
		else delete fitDoubts[i];
	}

	async function judgeAll(r: Recording) {
		for (let i = 0; i < r.chosen.length; i++) {
			if (recordings[current] !== r) return;
			await judge(r, i);
			await new Promise((done) => setTimeout(done, 0));
		}
	}

	let judging: ReturnType<typeof setTimeout> | null = null;
	function rejudge() {
		const r = rec;
		const i = frame;
		if (!r) return;
		if (judging) clearTimeout(judging);
		judging = setTimeout(() => void judge(r, i), 300);
	}

	const doubts = $derived(step === 'face' ? fitDoubts : {});

	function nextDoubt() {
		if (!rec) return;
		const frames = rec.chosen.length;
		for (let k = 1; k <= frames; k++) {
			const i = (frame + k) % frames;
			if (doubts[i]) return void go(i);
		}
		say('No doubtful frames here.');
	}

	function pickFace(id: string) {
		if (!rec) return;
		view.face = id;
		fitDoubts = {};
		void judgeAll(rec);
		go(step === 'arrows' ? (faceOf(rec).placedOn ?? bestFrame(rec)) : frame);
	}

	function newFace() {
		if (!rec) return;
		const id = addFace(rec);
		changed();
		pickFace(id);
		go(frame, 'face');
		say('New face added below. Drag it onto its spot.');
	}

	function dropFace() {
		if (!rec || labelsOf(rec).faces[0].id === view.face) return;
		removeFace(rec, view.face);
		changed();
		pickFace(labelsOf(rec).faces[0].id);
	}

	let unprepared = $state<string[]>([]);
	let preparing = $state<{ done: number; of: number; error?: string } | null>(null);

	/** Prepares the recordings not prepared yet, one at a time, and adds each to the queue as it is ready. */
	async function prepareAll() {
		const names = [...unprepared];
		preparing = { done: 0, of: names.length };
		for (const name of names) {
			const response = await fetch(`/__label/prepare/${encodeURIComponent(name)}`, { method: 'POST' });
			if (!response.ok) {
				preparing = { ...preparing, error: await response.text() };
				return;
			}
			const added: Recording = await response.json();
			recordings = [...recordings, { ...added, labels: added.labels ?? empty() }].sort((a, b) =>
				(a.shotAt ?? a.video).localeCompare(b.shotAt ?? b.video)
			);
			unprepared = unprepared.filter((n) => n !== name);
			preparing = { done: preparing.done + 1, of: names.length };
		}
		preparing = null;
	}

	async function go(to: number, toStep: Step = step) {
		if (!rec) return;
		frame = Math.max(0, Math.min(rec.chosen.length - 1, to));
		step = toStep;
		selected = null;
		guesses = [];
		stage?.clearTaps();
		if (step === 'nocks') target = nocksWanted(rec, frame)[0] ?? null;
		await load();
	}

	let loadingFor = '';
	/** The recording the view was last fitted for. */
	let viewedVideo = '';
	async function load() {
		if (!rec) return;
		const key = `${rec.video}/${frame}`;
		loadingFor = key;
		const img = new Image();
		img.src = `/__label/image/${encodeURIComponent(rec.video)}/${rec.samples[frame]}`;
		try {
			await img.decode();
		} catch {
			return;
		}
		if (loadingFor !== key) return;
		const off = document.createElement('canvas');
		off.width = img.naturalWidth;
		off.height = img.naturalHeight;
		const c = off.getContext('2d', { willReadFrequently: true })!;
		c.drawImage(img, 0, 0);
		pixels = c.getImageData(0, 0, off.width, off.height);
		image = img;
		await tick();
		// Fitted when a recording opens, then left where the archer put it: the next frame is the same view.
		if (viewedVideo !== rec.video) {
			viewedVideo = rec.video;
			stage?.fitFace();
		}
		if (step === 'arrows') setTimeout(() => arrive(key), 30);
	}

	/** What the still detector sees on this frame, read through this frame's own fit. */
	function seen(): { x: number; y: number }[] {
		if (!rec || !pixels) return [];
		return seenOn(downscale({ width: pixels.width, height: pixels.height, data: pixels.data }, DOUBT_SCALE), fitHere(rec, frame));
	}

	/** On reaching a frame in the arrows step: guesses to place from, or the turn that lays the arrows right. */
	function arrive(key: string) {
		if (!rec || !face || loadingFor !== key || step !== 'arrows' || !hasFace(rec, frame)) return;
		if (placing) return guess();
		const here = frameFace(rec, frame);
		if (here?.arrowsOk || here?.moved || face.arrows.length === 0) return;
		void autoTurn(true);
	}

	/** The turn that lines this frame's paper up with the reference frame's: holes and tears do not move. */
	async function paperTurn(r: Recording, i: number): Promise<number | null> {
		const f = faceOf(r);
		if (f.placedOn === null || f.placedOn === i) return null;
		const [ref, here] = await Promise.all([smallOf(r, f.placedOn), smallOf(r, i)]);
		if (!ref || !here) return null;
		const a = unroll(ref, fitHere(r, f.placedOn), DOUBT_SCALE);
		const b = unroll(here, fitHere(r, i), DOUBT_SCALE);
		return a && b ? textureTurn(a, b) : null;
	}

	/** Every frame not checked yet turned to the reference, which is most of what checking arrows was. */
	async function alignAll() {
		if (!rec || !face || face.placedOn === null) return say('Place the arrows first.');
		const r = rec;
		say('Aligning frames to the reference…');
		let turnedCount = 0;
		let unread = 0;
		for (let i = 0; i < r.chosen.length; i++) {
			const here = frameFace(r, i);
			if (i === face.placedOn || !hasFace(r, i) || here?.arrowsOk || here?.moved) continue;
			const angle = await paperTurn(r, i);
			if (recordings[current] !== r) return;
			if (angle === null) {
				unread += 1;
				continue;
			}
			if (Math.abs(angle) < 0.004) continue;
			const target = ensureFrame(r, i);
			target.state = 'ok';
			target.fit = turned(target.fit as Point[], angle);
			turnedCount += 1;
		}
		changed();
		void judgeAll(r);
		say(`Turned ${turnedCount} frame${turnedCount === 1 ? '' : 's'} to match the reference${unread ? `, ${unread} unreadable` : ''}.`, undo);
	}

	/** The detector's guesses, less those already placed. */
	function guess() {
		if (!rec || !face) return;
		const placed = arrowsOn(labelsOf(rec), frame, face.id);
		const kept: Guess[] = [];
		// One guess a shaft: the detector often reads the same one twice.
		for (const g of seen()) {
			if ([...placed, ...kept].some((a) => Math.hypot(a.x - g.x, a.y - g.y) < 0.05)) continue;
			kept.push(g);
		}
		guesses = kept;
	}

	async function autoTurn(quiet = false) {
		if (!rec || !face) return;
		const r = rec;
		const at = frame;
		// The paper first, which does not need the shafts to be seen; the shafts when the paper cannot say.
		const angle = (await paperTurn(r, at)) ?? bestTurn(face.arrows, seen());
		if (rec !== r || frame !== at) return;
		if (angle !== null && Math.abs(angle) < 0.004) return;
		if (angle === null) {
			if (!quiet) say('Not enough shafts seen to turn.');
			return;
		}
		const here = ensureFrame(rec, frame);
		here.state = 'ok';
		here.fit = turned(here.fit as Point[], angle);
		changed();
		say(`Turned ${Math.round((angle * 180) / Math.PI)}° to match the reference.`, undo);
	}

	function say(text: string, undo?: () => void) {
		toast = { text, undo };
		const shownToast = toast;
		setTimeout(() => {
			if (toast === shownToast) toast = null;
		}, 4000);
	}

	function celebrate() {
		flash += 1;
	}

	/** On to the next thing this step wants, or the next step when it wants nothing more. */
	function advance() {
		if (!rec) return;
		const frames = rec.chosen.length;
		const after = (want: (i: number) => boolean) => {
			for (let k = 1; k <= frames; k++) {
				const i = (frame + k) % frames;
				if (want(i)) return i;
			}
			return -1;
		};
		if (step === 'face') {
			const next = after((i) => !faceDecided(rec, i));
			if (next >= 0) return go(next);
			say('Faces done. Now the arrows.');
			return go(faceOf(rec).placedOn ?? bestFrame(rec), 'arrows');
		}
		if (step === 'arrows') {
			if (!arrowsPlaced(rec)) return say(`Place all ${countOf(rec) || 'the'} arrows first, or say how many there are.`);
			const next = after((i) => !arrowsChecked(rec, i));
			if (next >= 0) return go(next);
			say(options.nocks ? 'Arrows done. Now the nocks.' : 'Arrows done.');
			const nocks = nockFrames(rec).find((i) => nocksWanted(rec, i).length > 0);
			return faceOf(rec).empty || nocks === undefined ? go(frame, 'score') : go(nocks, 'nocks');
		}
		if (step === 'nocks') {
			const next = nockFrames(rec).find((i) => nocksWanted(rec, i).length > 0);
			if (next !== undefined) return go(next);
			return go(frame, 'score');
		}
		if (step === 'score') nextRecording();
	}

	function nextRecording() {
		const next = recordings.findIndex((r, i) => i !== current && !progressOf(r).done);
		if (next >= 0) open(next);
		else say('All recordings labelled.');
	}

	$effect(() => {
		if (progress?.done && rec) {
			const key = rec.video;
			if (doneOnce !== key) {
				doneOnce = key;
				party += 1;
			}
		}
	});
	let doneOnce = '';

	function acceptFace() {
		if (!rec) return;
		const here = ensureFrame(rec, frame);
		here.state = 'ok';
		here.fit ??= fitHere(rec, frame);
		changed();
		celebrate();
		advance();
	}

	function noFace() {
		if (!rec) return;
		(labelsOf(rec).frames[frame] ??= {})[faceOf(rec).id] = { state: 'none' };
		changed();
		advance();
	}

	function copyPrevious() {
		if (!rec) return;
		for (let i = frame - 1; i >= 0; i--) {
			if (!hasFace(rec, i) || !frameFace(rec, i)) continue;
			const here = ensureFrame(rec, frame);
			here.state = 'ok';
			here.fit = fitHere(rec, i).map(([x, y]) => [x, y] as Point);
			changed();
			return;
		}
		say('No earlier checked fit to copy.');
	}

	function resetFit() {
		if (!rec) return;
		const faces = labelsOf(rec).frames[frame];
		if (faces) delete faces[faceOf(rec).id];
		stage?.clearTaps();
		changed();
	}

	/** Whether checking a frame's arrows moves on to the next frame to check. */
	let autoNext = $state(storedFlag('labelling.autoNext', true));

	function storedFlag(key: string, fallback: boolean): boolean {
		try {
			const value = localStorage.getItem(key);
			return value === null ? fallback : value === '1';
		} catch {
			return fallback;
		}
	}

	function setAutoNext(on: boolean) {
		autoNext = on;
		try {
			localStorage.setItem('labelling.autoNext', on ? '1' : '0');
		} catch {
			// Forgotten on reload, nothing worse.
		}
	}

	function checkArrows() {
		if (!rec || !face) return;
		if (!arrowsPlaced(rec)) {
			const missing = countOf(rec) - face.arrows.length;
			return say(`${missing} arrow${missing === 1 ? '' : 's'} still to place on frame ${(face.placedOn ?? frame) + 1}, or change the count.`);
		}
		ensureFrame(rec, frame).arrowsOk = true;
		changed();
		celebrate();
		if (autoNext || placing) advance();
	}

	function makeReference() {
		if (!rec) return;
		const problem = setReference(rec, frame);
		if (problem) return say(problem);
		changed();
		say(`Frame ${frame + 1} is now the reference.`, undo);
	}

	function toggleHidden(n = selected) {
		if (!rec || !face || n === null) return say('Pick an arrow first (click it or press its number).');
		if (face.placedOn === frame) return say('Arrows can’t be hidden on the reference frame.');
		selected = n;
		const hidden = frameFace(rec, frame)?.hidden?.includes(n) ?? false;
		setHidden(rec, frame, n, !hidden);
		changed();
	}

	function removeArrow(n = selected) {
		if (!rec || !face || n === null) return;
		if (face.placedOn === frame) {
			face.arrows = face.arrows.filter((a) => a.n !== n);
			for (const faces of Object.values(labelsOf(rec).frames)) {
				const here = faces[face.id];
				if (here?.moved) delete here.moved[n];
				if (here?.nocks) delete here.nocks[n];
				if (here?.nockCut) here.nockCut = here.nockCut.filter((c) => c !== n);
				if (here?.hidden) here.hidden = here.hidden.filter((h) => h !== n);
			}
			if (face.arrows.length === 0) face.placedOn = null;
		} else {
			const here = frameFace(rec, frame);
			if (here?.moved) delete here.moved[n];
		}
		selected = null;
		if (placing) guess();
		changed();
	}

	function takeGuesses() {
		if (!rec || !face || !placing) return;
		const room = (face.count ?? 6) - face.arrows.length;
		for (const g of guesses.slice(0, Math.max(0, room))) {
			const n = face.arrows.reduce((m, a) => Math.max(m, a.n + 1), 0);
			face.arrows.push({ n, x: g.x, y: g.y });
		}
		face.placedOn = frame;
		ensureFrame(rec, frame).arrowsOk = true;
		guesses = [];
		changed();
	}

	function setCount(n: number) {
		if (!face) return;
		face.count = n;
		face.empty = n === 0;
		changed();
	}

	function setType(id: string) {
		if (!face) return;
		face.type = id;
		changed();
	}

	function toggleNocks(on: boolean) {
		setNocks(on);
		if (!on && step === 'nocks') go(frame, 'score');
	}

	/** Each arrow in sight on this frame and what its nock says, for the list beside the picture. */
	const nockRows = $derived.by(() => {
		if (!rec || step !== 'nocks') return [];
		const here = frameFace(rec, frame);
		return arrowsOn(labelsOf(rec), frame, faceOf(rec).id)
			.filter((arrow) => !arrow.hidden)
			.map((arrow) => {
				const nock = here?.nocks?.[arrow.n];
				const state = nock === undefined ? 'to do' : nock === null ? "can't see" : here?.nockCut?.includes(arrow.n) ? 'leaves the picture' : 'placed';
				return { n: arrow.n, state };
			});
	});

	function removeNock(n: number) {
		if (!rec) return;
		const here = frameFace(rec, frame);
		if (!here?.nocks || !(n in here.nocks)) return;
		delete here.nocks[n];
		if (here.nockCut) here.nockCut = here.nockCut.filter((c) => c !== n);
		target = n;
		changed();
	}

	function nockUnseen() {
		if (!rec || target === null) return;
		const here = ensureFrame(rec, frame);
		here.nocks = { ...(here.nocks ?? {}), [target]: null };
		changed();
		afterNock();
	}

	function afterNock() {
		if (!rec) return;
		const left = nocksWanted(rec, frame);
		if (left.length) target = left[0];
		else {
			celebrate();
			advance();
		}
	}

	function undoNock() {
		if (!rec) return;
		const here = frameFace(rec, frame);
		const keys = Object.keys(here?.nocks ?? {});
		if (!here?.nocks || keys.length === 0) return;
		const last = keys[keys.length - 1];
		delete here.nocks[last];
		if (here.nockCut) here.nockCut = here.nockCut.filter((c) => c !== Number(last));
		target = Number(last);
		changed();
	}

	let scorer = $state(choiceOf(storedText('labelling.scorer')));
	function storedText(key: string): string | null {
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	}
	function pickScorer(id: string) {
		scorer = id;
		scorecard = { state: 'idle' };
		try {
			localStorage.setItem('labelling.scorer', id);
		} catch {
			// A private window keeps the choice for this visit only.
		}
	}

	async function runScore() {
		if (!rec) return;
		await saver.flush();
		scorecard = { state: 'running' };
		try {
			const response = await fetch(`/__label/score/${encodeURIComponent(rec.video)}?scorer=${encodeURIComponent(scorer)}`, { method: 'POST' });
			if (!response.ok) throw new Error(await response.text());
			scorecard = { state: 'done', result: await response.json() };
		} catch (error) {
			scorecard = { state: 'failed', error: String(error) };
		}
	}

	function keydown(event: KeyboardEvent) {
		if (playing || !rec) return;
		if ((event.target as HTMLElement)?.closest('input, select, textarea')) return;
		const key = event.key;
		// Enter on a focused button would also click it, undoing the move: the frame clicked last took us back.
		if (key === 'Enter' && (event.target as HTMLElement)?.closest('button')) event.preventDefault();
		if (key === ' ') {
			event.preventDefault();
			stage?.setSpace(true);
			return;
		}
		if (key === '?') return void (help = !help);
		if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'z') {
			event.preventDefault();
			return undo();
		}
		if (key === 'u') return undo();
		if (key === 'ArrowRight') return void go(frame + 1);
		if (key === 'ArrowLeft') return void go(frame - 1);
		if (key === 'PageDown') return open(Math.min(recordings.length - 1, current + 1));
		if (key === 'PageUp') return open(Math.max(0, current - 1));
		if (key === '+' || key === '=') return stage?.zoom(1.25);
		if (key === '-') return stage?.zoom(0.8);
		if (key === '0') return stage?.fitView();
		if (key === 'v') return stage?.fitFace();
		const jump = ({ f: 'face', a: 'arrows', n: 'nocks', s: 'score' } as Record<string, Step>)[key];
		if (jump && stepsShown().includes(jump)) return openStep(jump);
		if (key === 'p') return void (playing = true);
		if (key === 'd') return nextDoubt();
		if (key === 'Tab' && rec && labelsOf(rec).faces.length > 1) {
			event.preventDefault();
			const faces = labelsOf(rec).faces;
			const at = faces.findIndex((f) => f.id === view.face);
			return pickFace(faces[(at + 1) % faces.length].id);
		}
		if (step === 'face') {
			if (key === 'Enter') return acceptFace();
			if (key === 'x') return noFace();
			if (key === 'c') return copyPrevious();
			if (key === 'r') return resetFit();
			if (key === 'Backspace') return stage?.undoTap();
			if (key === 'Escape') return resetTaps();
			const ring = ringsOf(face?.type).find((r) => r.key === key);
			if (ring) return stage?.retap(ring.r);
		}
		if (step === 'arrows') {
			if (key === 'Enter') return checkArrows();
			if (key === 'h') return toggleHidden();
			if (key === 'Delete' || key === 'Backspace') return removeArrow();
			if (key === 't') return autoTurn();
			if (key === 'r' && !placing) return makeReference();
			if (key === 'l') return void alignAll();
			if (key === 'g') return takeGuesses();
			if (key === 'Escape') return void (selected = null);
			if (/^[1-9]$/.test(key)) {
				const n = Number(key) - 1;
				if (face?.arrows.some((a) => a.n === n)) selected = n;
				return;
			}
		}
		if (step === 'nocks') {
			if (key === 'x') return nockUnseen();
			if (key === 'Backspace') return undoNock();
			if (key === 'Enter') return advance();
			if (/^[1-9]$/.test(key)) {
				const n = Number(key) - 1;
				if (face?.arrows.some((a) => a.n === n)) target = n;
				return;
			}
		}
		if (step === 'score' && key === 'Enter') return advance();
	}

	function keyup(event: KeyboardEvent) {
		if (event.key === ' ') stage?.setSpace(false);
	}

	function resetTaps() {
		if (!rec) return;
		stage?.clearTaps();
	}

	const STEP_NAMES: Record<Step, string> = { face: 'Face', arrows: 'Arrows', nocks: 'Nocks', score: 'Score' };
	const STEP_HELP: Record<Step, string> = {
		face: 'Check the face fit on each frame',
		arrows: 'Place the arrows, then check each frame',
		nocks: 'Click the shaft ends on a few frames',
		score: 'How the detector does here'
	};

	function openStep(s: Step) {
		if (!rec) return;
		go(s === 'arrows' ? (face?.placedOn ?? bestFrame(rec)) : s === 'nocks' ? (nockFrames(rec)[0] ?? 0) : frame, s);
	}

	function cellTitle(i: number, state: string): string {
		const name = `Frame ${i + 1}`;
		if (state === 'none') return `${name}: no face`;
		if (step === 'face') return state === 'done' ? `${name}: fit checked` : `${name}: to check`;
		if (step === 'arrows') return state === 'done' ? `${name}: arrows checked` : `${name}: to check`;
		if (step === 'nocks') return state === 'off' ? `${name}: no nocks needed` : state === 'done' ? `${name}: nocks done` : `${name}: nocks to do`;
		return name;
	}

	function stepCount(s: Step): string {
		if (!progress || !rec) return '';
		if (s === 'face') return `${progress.faces}/${progress.frames}`;
		if (s === 'arrows') return arrowsPlaced(rec) ? `${progress.checked}/${progress.frames}` : `${face?.arrows.length ?? 0}/${countOf(rec) || '?'}`;
		if (s === 'nocks') return `${progress.nocked}/${progress.nockGoal}`;
		return progress.done ? '✓' : '';
	}

	function cellState(i: number): string {
		if (!rec) return '';
		const here = frameFace(rec, i);
		if (step === 'face') return here?.state === 'none' ? 'none' : here ? 'done' : '';
		if (!hasFace(rec, i)) return 'none';
		if (step === 'arrows') return arrowsChecked(rec, i) && arrowsPlaced(rec) ? 'done' : '';
		if (step === 'nocks') return nockFrames(rec).includes(i) ? (nocksWanted(rec, i).length === 0 ? 'done' : 'wanted') : 'off';
		return '';
	}

	const when = (r: Recording) => (r.shotAt ?? r.video).replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})$/, '$3/$2 $4:$5:$6');
	const endOf = (r: Recording) => r.video.match(/-s\d+-(e\d+)-/)?.[1] ?? '';
	const share = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));
</script>

<svelte:window onkeydown={keydown} onkeyup={keyup} />

<div class="fixed inset-0 z-[70] flex flex-col bg-bg text-ink">
	<header class="flex items-center gap-3 border-b border-line bg-surface px-3 py-2">
		<button class="press rounded-lg p-2 lg:hidden" aria-label="Recordings" onclick={() => (listOpen = !listOpen)}>
			<Icon name="list" size={20} />
		</button>
		<div class="flex min-w-0 items-center gap-2">
			<Icon name="target" size={22} />
			<h1 class="text-lg font-bold">Labelling</h1>
		</div>
		<div class="hidden min-w-0 flex-1 items-center gap-3 sm:flex">
			<div class="h-2 flex-1 overflow-hidden rounded-full bg-sunk">
				<div class="h-full rounded-full bg-brand transition-all duration-500" style="width: {share(totals.work, totals.all)}%"></div>
			</div>
			<span class="tabular shrink-0 text-xs text-muted">{totals.done}/{recordings.length} recordings · {share(totals.work, totals.all)}%</span>
		</div>
		<span class="ml-auto shrink-0 text-xs text-muted sm:ml-0">
			{#if readOnly}Read only{:else if saver.state === 'saving'}Saving…{:else if saver.state === 'failed'}<span class="text-danger">Not saved</span>{:else if saver.state === 'saved'}Saved{/if}
		</span>
		<button class="press rounded-lg border border-line px-2.5 py-1 text-sm" onclick={undo}>Undo <kbd>U</kbd></button>
		<button class="press rounded-lg border border-line px-2.5 py-1 text-sm" onclick={() => (help = !help)}>Keys <kbd>?</kbd></button>
	</header>

	{#if loading}
		<div class="grid flex-1 place-items-center text-muted">Loading the corpus…</div>
	{:else if !rec}
		<div class="grid flex-1 place-items-center p-6 text-center text-muted">
			Nothing prepared yet. Run <code>./scripts/labeling_tool.sh --prepare</code> first.
		</div>
	{:else}
		<div class="relative grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[16rem_minmax(0,1fr)_20rem] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
			<!-- The queue: every recording with how far along it is, the next one to do first. -->
			<aside
				class="absolute inset-y-0 left-0 z-20 w-72 flex-col border-r border-line bg-surface shadow-xl lg:static lg:flex lg:w-auto lg:shadow-none"
				class:hidden={!listOpen}
				class:flex={listOpen}
			>
				<div class="flex items-center justify-between gap-2 border-b border-line p-3">
					<button class="press flex-1 rounded-xl bg-brand py-2 text-sm font-semibold text-brand-ink" onclick={nextRecording}>Next to do</button>
					<label class="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" bind:checked={todoOnly} class="accent-brand" /> To do</label>
				</div>
				<ul class="min-h-0 flex-1 overflow-y-auto p-2">
					{#each shown as { r, i, p } (r.video)}
						<li>
							<button
								class="press flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm"
								class:bg-sunk={i === current}
								onclick={() => open(i)}
							>
								<span class="tabular min-w-0 flex-1 truncate">{when(r)} <span class="text-muted">{endOf(r)}</span></span>
								{#if p.done}
									<span class="text-win"><Icon name="check" size={16} /></span>
								{:else}
									<span class="h-1.5 w-12 overflow-hidden rounded-full bg-sunk">
										<span class="block h-full bg-brand" style="width: {share(p.faces + p.checked + p.nocked, p.frames * 2 + p.nockGoal)}%"></span>
									</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
				{#if unprepared.length > 0}
					<div class="border-t border-line p-3 text-xs text-muted">
						<p>{unprepared.length} recording{unprepared.length === 1 ? ' is' : 's are'} not prepared yet: its frames have not been chosen and fitted.</p>
						{#if preparing}
							<p class="mt-2 text-ink">Preparing {preparing.done + 1} of {preparing.of}… (≈2 min each)</p>
							{#if preparing.error}<p class="mt-1 break-words text-danger">{preparing.error}</p>{/if}
						{:else}
							<button class="press mt-2 w-full rounded-xl border border-line py-2 text-sm text-ink" disabled={readOnly} onclick={prepareAll}>Prepare {unprepared.length === 1 ? 'it' : 'them'}</button>
						{/if}
					</div>
				{/if}
			</aside>

			<main class="flex h-[78vh] min-h-0 min-w-0 flex-col lg:h-auto">
				<nav class="flex items-center gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-1.5">
					{#each stepsShown() as s (s)}
						<button
							class="press flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
							class:bg-brand={step === s}
							class:text-brand-ink={step === s}
							title={STEP_HELP[s]}
							onclick={() => openStep(s)}
						>
							{STEP_NAMES[s]} <span class="tabular text-xs opacity-70">{stepCount(s)}</span> <kbd>{s[0].toUpperCase()}</kbd>
						</button>
					{/each}
					<span class="ml-auto shrink-0 truncate px-2 text-xs text-muted">{when(rec)} {endOf(rec)}</span>
						<label class="flex shrink-0 items-center gap-1.5 px-2 text-xs text-muted" title="Add a step to click each shaft’s far end. Not used by the scorer; off by default.">
							<input type="checkbox" class="accent-brand" checked={options.nocks} onchange={(event) => toggleNocks(event.currentTarget.checked)} />
						Label nocks
					</label>
				</nav>

				<div class="relative min-h-0 flex-1">
					<Stage
						bind:this={stage}
						{rec}
						{frame}
						{step}
						{image}
						{pixels}
						bind:guesses
						bind:selected
						bind:target
						bind:taps
						bind:tapRing
						onchange={changed}
						onnock={afterNock}
					/>
					{#key flash}
						{#if flash > 0}
							<div class="pointer-events-none absolute inset-0 grid place-items-center">
								<span class="pop grid h-16 w-16 place-items-center rounded-full bg-win text-white shadow-lg"><Icon name="check" size={34} /></span>
							</div>
						{/if}
					{/key}
					{#key party}
						{#if party > 0}
							<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
								{#each Array.from({ length: 36 }) as _, k (k)}
									<span
										class="confetti absolute top-1/2 left-1/2 h-2 w-2 rounded-sm"
										style="--dx: {Math.cos(k * 2.4) * (120 + (k % 5) * 40)}px; --dy: {Math.sin(k * 2.4) * (120 + (k % 7) * 30) - 80}px; background: {['#ffe14d', '#e8453c', '#3aa0d8', '#3ddc84', '#d0912f'][k % 5]}; animation-delay: {(k % 6) * 25}ms"
									></span>
								{/each}
								<div class="pop absolute inset-x-0 top-6 text-center text-lg font-bold text-white drop-shadow">Recording labelled!</div>
							</div>
						{/if}
					{/key}
					{#if toast}
						<div class="absolute inset-x-0 bottom-3 flex justify-center px-3">
							<div class="flex items-center gap-3 rounded-xl bg-ink px-4 py-2 text-sm text-bg shadow-lg">
								{toast.text}
								{#if toast.undo}
									<button class="font-semibold text-brand" onclick={() => (toast?.undo?.(), (toast = null))}>Undo</button>
								{/if}
							</div>
						</div>
					{/if}
					<div class="absolute top-2 right-2 flex flex-col gap-1">
						<button class="press rounded-lg bg-surface/90 p-1.5 shadow" aria-label="Zoom in" onclick={() => stage?.zoom(1.25)}><Icon name="plus" size={18} /></button>
						<button class="press rounded-lg bg-surface/90 p-1.5 text-center text-lg leading-none font-bold shadow" aria-label="Zoom out" onclick={() => stage?.zoom(0.8)}>−</button>
						<button class="press rounded-lg bg-surface/90 p-1.5 shadow" aria-label="Fit the face" onclick={() => stage?.fitFace()}><Icon name="target" size={18} /></button>
						<button class="press rounded-lg bg-surface/90 p-1.5 shadow" aria-label="Whole picture" onclick={() => stage?.fitView()}><Icon name="expand" size={18} /></button>
					</div>
				</div>

				<!-- Every frame of the recording, so where the work is and where it is done is one look. -->
				<div class="flex gap-1 overflow-x-auto border-t border-line bg-surface p-2">
					{#each rec.chosen as _, i (i)}
						{@const state = cellState(i)}
						<button
							class="press tabular relative h-9 min-w-9 shrink-0 rounded-lg border text-xs font-semibold transition-transform"
							class:border-brand={i === frame}
							class:border-line={i !== frame}
							class:scale-110={i === frame}
							class:bg-win={state === 'done'}
							class:text-white={state === 'done'}
							class:bg-ink={state === 'none'}
							class:text-bg={state === 'none'}
							class:line-through={state === 'none'}
							class:bg-sunk={state === 'off'}
							class:text-muted={state === 'off'}
							class:ring-2={state === 'wanted'}
							class:ring-brand={state === 'wanted'}
							title={doubts[i] ? `${cellTitle(i, state)} · ⚠ ${doubts[i]}` : cellTitle(i, state)}
							onclick={() => go(i)}
						>
							{i + 1}
							{#if face && face.placedOn === i}<span class="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-brand" title="Reference frame: arrows are placed here"></span>{/if}
							{#if doubts[i]}<span class="absolute -top-1.5 -left-1.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-danger text-[0.6rem] leading-none font-bold text-white">!</span>{/if}
						</button>
					{/each}
				</div>
			</main>

			<aside class="min-h-0 overflow-y-auto border-l border-line bg-surface p-4 text-sm">
				{#if labelsOf(rec).faces.length > 1 || step === 'face'}
					<div class="mb-4 flex flex-wrap items-center gap-1.5" title="Faces on this boss (e.g. a 3 spot). Tab switches.">
						<span class="text-xs text-muted">Faces</span>
						{#each labelsOf(rec).faces as f, k (f.id)}
							<button
								class="press rounded-lg border px-2.5 py-1 text-xs font-semibold"
								class:bg-brand={view.face === f.id}
								class:text-brand-ink={view.face === f.id}
								class:border-brand={view.face === f.id}
								class:border-line={view.face !== f.id}
								onclick={() => pickFace(f.id)}>{String.fromCharCode(65 + k)}</button
							>
						{/each}
						{#if step === 'face'}
							<button class="press rounded-lg border border-line px-2.5 py-1 text-xs" title="Add another face, e.g. for a 3 spot" onclick={newFace}>+ Add a face</button>
							{#if labelsOf(rec).faces.length > 1 && labelsOf(rec).faces[0].id !== view.face}
								<button class="press rounded-lg border border-line px-2 py-1 text-xs text-danger" title="Remove this face and its labels" onclick={dropFace}>Remove</button>
							{/if}
						{/if}
					</div>
				{/if}
				{#if Object.keys(doubts).length > 0}
					<button class="press mb-4 flex w-full items-center gap-2 rounded-xl border border-danger/40 bg-danger/5 px-3 py-2 text-left text-xs" onclick={nextDoubt}>
						<span class="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-danger text-[0.6rem] font-bold text-white">!</span>
						<span class="flex-1">{doubts[frame] ? `This frame: ${doubts[frame]}` : `${Object.keys(doubts).length} doubtful frame${Object.keys(doubts).length === 1 ? '' : 's'}`}</span>
						<kbd>D</kbd>
					</button>
				{/if}
				{#if step === 'face'}
					<h2 class="text-base font-bold">Fit the face</h2>
					<p class="mt-1 text-muted">Rings on the printed rings? Press Enter. If not, fix them:</p>
					<div class="mt-3 flex flex-wrap gap-1.5">
						{#each FACE_TYPES as type (type.id)}
							<button
								class="press rounded-lg border px-2.5 py-1 text-xs"
								class:border-brand={face?.type === type.id}
								class:bg-brand={face?.type === type.id}
								class:text-brand-ink={face?.type === type.id}
								class:border-line={face?.type !== type.id}
								onclick={() => setType(type.id)}>{type.name}</button
							>
						{/each}
					</div>
					<ul class="mt-4 space-y-1.5 text-muted">
						<li><b class="text-ink">Drag inside</b> the outer ring to move it</li>
						<li><b class="text-ink">Drag the pink dot</b> to adjust the orientation</li>
						<li><b class="text-ink">Drag the outer ring</b> to stretch it</li>
						<li><b class="text-ink">Drag ↻</b> to turn it</li>
												<li><b class="text-ink">Click a ring edge</b> 3+ times to fit to it</li>
					</ul>
					{#if taps.length > 0}
						<div class="mt-3 rounded-xl border border-line bg-bg p-3">
							<div class="text-xs text-muted">{taps.length} click{taps.length === 1 ? '' : 's'} on the</div>
							<div class="mt-1.5 flex flex-wrap gap-1">
								{#each ringsOf(face?.type) as ring (ring.key)}
									<button
										class="press rounded-lg border px-2 py-0.5 text-xs"
										class:bg-brand={tapRing === ring.r}
										class:text-brand-ink={tapRing === ring.r}
										class:border-line={tapRing !== ring.r}
										onclick={() => stage?.retap(ring.r)}><kbd>{ring.key}</kbd> {ring.name}</button
									>
								{/each}
							</div>
							<div class="mt-2 flex gap-1.5">
								<button class="press rounded-lg border border-line px-2 py-1 text-xs" onclick={() => stage?.undoTap()}>Undo click <kbd>⌫</kbd></button>
								<button class="press rounded-lg border border-line px-2 py-1 text-xs" onclick={resetTaps}>Done <kbd>Esc</kbd></button>
							</div>
						</div>
					{/if}
					<div class="mt-4 grid grid-cols-2 gap-2">
						<button class="press col-span-2 rounded-xl bg-brand py-2.5 font-semibold text-brand-ink" onclick={acceptFace}>Good <kbd>Enter</kbd></button>
						<button class="press rounded-xl border border-line py-2" onclick={noFace}>No face <kbd>X</kbd></button>
						<button class="press rounded-xl border border-line py-2" onclick={copyPrevious}>Copy last <kbd>C</kbd></button>
						<button class="press col-span-2 rounded-xl border border-line py-2" onclick={resetFit}>Back to the automatic fit <kbd>R</kbd></button>
					</div>
				{:else if step === 'arrows'}
					<h2 class="text-base font-bold">{placing ? 'Place the arrows' : 'Check the arrows'}</h2>
					<div class="mt-2 flex items-center gap-1.5">
						<span class="text-xs text-muted">In this end</span>
						{#each [3, 6, 0] as n (n)}
							{@const active = n === 0 ? Boolean(face?.empty) : !face?.empty && countOf(rec) === n}
							<button
								class="press rounded-lg border px-2.5 py-1 text-xs"
								class:bg-brand={active}
								class:text-brand-ink={active}
								class:border-brand={active}
								class:border-line={!active}
								onclick={() => setCount(n)}>{n === 0 ? 'None' : `${n} arrows`}</button
							>
						{/each}
					</div>
					{#if placing}
						<p class="mt-3 text-muted">
							Click where each shaft enters the paper (hold to aim). Click a dashed <b class="text-ink">?</b> to take the detector's guess.
						</p>
						{#if guesses.length > 0}
							<button class="press mt-3 w-full rounded-xl border border-line py-2" onclick={takeGuesses}>Take all {guesses.length} guesses <kbd>G</kbd></button>
						{/if}
					{:else}
						<p class="mt-3 text-muted">
							On the shafts? Press Enter. All turned? Drag ↻ or press <kbd>T</kbd>. Drag one arrow to fix it here.
						</p>
					{/if}
					<ul class="mt-3 space-y-1">
						{#each arrowsOn(labelsOf(rec), frame, face?.id) as arrow (arrow.n)}
							{@const zone = scoreAt(WA_10_RING, arrow.x, arrow.y)}
							<li class="flex items-center gap-1 rounded-lg" class:bg-sunk={selected === arrow.n}>
								<button class="press flex flex-1 items-center gap-2 px-2 py-1 text-left" title="Pick #{arrow.n + 1} (key {arrow.n + 1})" onclick={() => (selected = arrow.n)}>
									<span class="tabular rounded bg-ink px-1.5 text-xs font-bold text-bg">#{arrow.n + 1}</span>
									<span class="tabular rounded-full px-2 text-xs font-bold" style="background-color: {zone.countsAsHit ? zone.color : '#555'}; color: {zone.countsAsHit ? zone.strokeColor : '#fff'}">{zone.label}</span>
									<span class="flex-1 text-xs" class:text-muted={arrow.hidden}>{arrow.hidden ? 'Out of sight here' : arrow.moved ? 'Moved on this frame' : face?.placedOn === frame ? 'Placed' : 'Carried here'}</span>
								</button>
								{#if face?.placedOn !== frame}
									<button
										class="press rounded p-1"
										title={arrow.hidden ? `Show #${arrow.n + 1} again from this frame on` : `Hide #${arrow.n + 1} from this frame until the next checked frame: it is behind another arrow or out of the picture`}
										aria-label={arrow.hidden ? 'Show' : 'Hide'}
										onclick={() => toggleHidden(arrow.n)}><Icon name={arrow.hidden ? 'eye' : 'eyeOff'} size={16} /></button
									>
								{:else}
									<span
										class="cursor-help rounded p-1 opacity-30"
										title="Can’t hide on the reference frame"
										><Icon name="eyeOff" size={16} /></span
									>
								{/if}
								<button
									class="press rounded p-1 text-danger"
									title={face?.placedOn === frame ? `Delete #${arrow.n + 1} from the whole recording` : `Put #${arrow.n + 1} back where it was placed, undoing a move on this frame`}
									aria-label="Remove"
									onclick={() => removeArrow(arrow.n)}><Icon name={face?.placedOn === frame ? 'trash' : 'refresh'} size={16} /></button
								>
							</li>
						{/each}
					</ul>
					{#if face?.placedOn !== null && arrowsPlaced(rec)}
						<button class="press mt-3 w-full rounded-xl border border-line py-2" title="Turn every unchecked frame to match the reference, from the paper's holes and marks" onclick={() => alignAll()}>Align all frames <kbd>L</kbd></button>
					{/if}
					{#if !placing}
						<p class="mt-2 text-xs text-muted">The eye hides an arrow out of sight from here on (<kbd>H</kbd>).</p>
					{/if}
					<div class="mt-4 grid grid-cols-2 gap-2">
						<div class="col-span-2 flex overflow-hidden rounded-xl bg-brand text-brand-ink">
							<button class="press flex-1 py-2.5 font-semibold" onclick={checkArrows}>{placing ? 'Done placing' : 'They land right'} <kbd>Enter</kbd></button>
							{#if !placing}
								<label class="flex cursor-pointer items-center gap-1.5 border-l border-brand-ink/20 px-3 text-xs font-medium" title="On: go to the next frame to check. Off: stay here.">
									<input type="checkbox" class="accent-brand-ink" checked={autoNext} onchange={(event) => setAutoNext(event.currentTarget.checked)} />
									Next
								</label>
							{/if}
						</div>
						{#if !placing}
							<button class="press col-span-2 rounded-xl border border-line py-2" title="Turn this frame to match the reference frame" onclick={() => autoTurn()}>Turn to fit <kbd>T</kbd></button>
							<button
								class="press col-span-2 rounded-xl border border-line py-2"
								title="Use this frame as the reference (orange dot). Fix its arrows first."
								onclick={makeReference}>Make this the reference frame <kbd>R</kbd></button
							>
						{/if}
					</div>
				{:else if step === 'nocks'}
					<h2 class="text-base font-bold">Click the nocks</h2>
					<p class="mt-1 text-muted">Click the far end of the shaft ringed in pink. If it runs off the picture, click where it leaves the edge. Drag a nock to move it.</p>
					{#if target !== null}
						<div class="mt-3 rounded-xl border border-line bg-bg p-3">Arrow <b>{target + 1}</b> · {wanted.length} left on this frame</div>
					{/if}
					{#if nockRows.length}
						<ul class="mt-3 divide-y divide-line rounded-xl border border-line bg-bg">
							{#each nockRows as row (row.n)}
								<li class="flex items-center gap-2 px-3 py-1.5 {target === row.n ? 'bg-brand/10' : ''}">
									<button class="press flex-1 text-left" title="Pick this arrow" onclick={() => (target = row.n)}>
										<b>#{row.n + 1}</b> <span class="text-muted">{row.state}</span>
									</button>
									{#if row.state !== 'to do'}
										<button class="press rounded-lg border border-line px-2 py-0.5 text-xs" title="Remove this nock" onclick={() => removeNock(row.n)}>Remove</button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
					<div class="mt-4 grid grid-cols-2 gap-2">
						<button class="press rounded-xl border border-line py-2" onclick={nockUnseen}>Can't see it <kbd>X</kbd></button>
						<button class="press rounded-xl border border-line py-2" onclick={undoNock}>Undo <kbd>⌫</kbd></button>
						<button class="press col-span-2 rounded-xl bg-brand py-2.5 font-semibold text-brand-ink" onclick={advance}>Next frame <kbd>Enter</kbd></button>
					</div>
				{:else}
					<h2 class="text-base font-bold">How the detector did</h2>
					<p class="mt-1 text-muted">The detector against your labels, same numbers as the reports.</p>
					<label class="mt-3 flex items-center gap-2 text-sm">
						<span class="text-muted">Scorer</span>
						<select class="flex-1 rounded-lg border border-line bg-bg px-2 py-1.5" value={scorer} onchange={(e) => pickScorer(e.currentTarget.value)}>
							<option value={LATEST}>Latest model ({LATEST_SCORER.name})</option>{#each SCORERS as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
						</select>
					</label>
					{#if scorecard.state === 'done' && scorecard.result}
						{@const r = scorecard.result}
						<div class="mt-3 grid grid-cols-2 gap-2">
							<div class="rounded-xl border border-line bg-bg p-3">
								<div class="tabular text-2xl font-bold">{r.hit}/{r.wanted}</div>
								<div class="text-xs text-muted">arrows found</div>
							</div>
							<div class="rounded-xl border border-line bg-bg p-3">
								<div class="tabular text-2xl font-bold">{r.spurious}</div>
								<div class="text-xs text-muted">wrong marks</div>
							</div>
							<div class="rounded-xl border border-line bg-bg p-3">
								<div class="tabular text-2xl font-bold">{r.sureHit}</div>
								<div class="text-xs text-muted">scored right</div>
							</div>
							<div class="rounded-xl border border-line bg-bg p-3">
								<div class="tabular text-2xl font-bold">{r.sureSpurious}</div>
								<div class="text-xs text-muted">scored wrong</div>
							</div>
						</div>
						{#if r.cause}<p class="mt-2 text-xs text-danger">{r.cause}</p>{/if}
					{:else if scorecard.state === 'done'}
						<p class="mt-3 text-muted">Skipped: no fitted frame has every arrow.</p>
					{:else if scorecard.state === 'failed'}
						<p class="mt-3 text-xs break-words text-danger">{scorecard.error}</p>
					{/if}
					<div class="mt-4 grid gap-2">
						<button class="press rounded-xl border border-line py-2" disabled={scorecard.state === 'running'} onclick={runScore}
							>{scorecard.state === 'running' ? 'Measuring… (as long as the video)' : 'Measure the detector'}</button
						>
						<button class="press inline-flex items-center justify-center gap-1.5 rounded-xl border border-line py-2" onclick={() => (playing = true)}><Icon name="play" size={16} /> Watch the live scorer <kbd>P</kbd></button>
						<button class="press rounded-xl bg-brand py-2.5 font-semibold text-brand-ink" onclick={nextRecording}>Next recording <kbd>Enter</kbd></button>
					</div>
				{/if}

				{#if step !== 'score'}
					<button class="press mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-xs text-muted" onclick={() => (playing = true)}
						><Icon name="play" size={14} /> Watch the live scorer <kbd>P</kbd></button
					>
				{/if}
			</aside>
		</div>
	{/if}

	{#if help}
		<div class="absolute inset-0 z-30 grid place-items-center bg-black/40 p-4" role="presentation" onclick={() => (help = false)}>
			<div class="w-full max-w-md rounded-2xl bg-surface p-5 text-sm shadow-xl" role="dialog" aria-label="Keys">
				<h2 class="text-base font-bold">Keys</h2>
				<dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
					<dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Previous and next frame</dd>
					<dt><kbd>PgUp</kbd> <kbd>PgDn</kbd></dt><dd>Previous and next recording</dd>
					<dt><kbd>Enter</kbd></dt><dd>Accept and move on</dd>
					<dt><kbd>U</kbd> or <kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd>Undo, as far back as the recording was opened</dd>
					<dt><kbd>X</kbd> <kbd>C</kbd> <kbd>R</kbd></dt><dd>No face, copy the last fit, automatic fit</dd>
					<dt><kbd>1</kbd>…<kbd>5</kbd></dt><dd>Which ring the clicks are on (face) or pick an arrow</dd>
					<dt><kbd>H</kbd> <kbd>T</kbd> <kbd>L</kbd></dt><dd>Hide an arrow, turn this frame, align all frames</dd>
					<dt><kbd>G</kbd> <kbd>R</kbd></dt><dd>Take the guesses, make this the reference frame</dd>
					<dt><kbd>F</kbd> <kbd>A</kbd> <kbd>N</kbd> <kbd>S</kbd></dt><dd>Go to the Face, Arrows, Nocks or Score step</dd>
					<dt><kbd>X</kbd> (nocks)</dt><dd>A nock that cannot be seen</dd>
					<dt><kbd>Space</kbd> + drag</dt><dd>Move the picture (or drag with the right button)</dd>
					<dt>Wheel, <kbd>+</kbd> <kbd>−</kbd> <kbd>0</kbd> <kbd>V</kbd></dt><dd>Zoom, whole picture, onto the face</dd>
					<dt><kbd>P</kbd></dt><dd>Watch the live scorer</dd>
					<dt><kbd>D</kbd></dt><dd>Next frame that looks doubtful (red !)</dd>
					<dt><kbd>Tab</kbd></dt><dd>Next face, on a boss with several</dd>
				</dl>
			</div>
		</div>
	{/if}

	{#if playing && rec}
		<Player video={rec.video} count={countOf(rec)} {scorer} onclose={() => (playing = false)} />
	{/if}
</div>

<style>
	kbd {
		display: inline-block;
		min-width: 1.4em;
		padding: 0 0.3em;
		border: 1px solid var(--c-line);
		border-bottom-width: 2px;
		border-radius: 0.3rem;
		font: 600 0.7rem/1.4 ui-monospace, monospace;
		text-align: center;
		color: var(--c-muted);
		background: var(--c-bg);
	}
	.pop {
		animation: pop 0.6s ease-out forwards;
	}
	@keyframes pop {
		0% {
			transform: scale(0.4);
			opacity: 0;
		}
		30% {
			transform: scale(1.1);
			opacity: 1;
		}
		100% {
			transform: scale(1);
			opacity: 0;
		}
	}
	.confetti {
		animation: burst 1.1s ease-out forwards;
	}
	@keyframes burst {
		from {
			transform: translate(0, 0) rotate(0);
			opacity: 1;
		}
		to {
			transform: translate(var(--dx), calc(var(--dy) + 160px)) rotate(540deg);
			opacity: 0;
		}
	}
</style>
