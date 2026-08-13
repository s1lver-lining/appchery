<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { getScoreSet, roundNeedsVerification } from '$lib/domain/rounds/seed';
	import {
		endSlots,
		scorableZones,
		missZone,
		scoreAt,
		groupMetrics,
		sortShotsDescending,
		type EndSlot
	} from '$lib/domain/rounds/geometry';
	import { celebratedBests, sortArrowsDescending, showArrowNumbers } from '$lib/prefs';
	import { formatDistance, mmToInches, inchesToMm } from '$lib/domain/units';
	import { getTemplate } from '$lib/domain/tuning/templates';
	import { schemaFor, diffSettings, type BowSettings, type SettingField } from '$lib/domain/equipment/schemas';
	import type { BowType } from '$lib/domain/tuning/templates';
	import type { RoundDefinition, Shot, Zone } from '$lib/domain/rounds/types';
	import TargetFace from '$lib/ui/TargetFace.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import AutoScore from '$lib/ui/AutoScore.svelte';
	import Fireworks, { type Award } from '$lib/ui/Fireworks.svelte';
	import Scorecard from '$lib/ui/Scorecard.svelte';
	import Match from '$lib/pages/Match.svelte';
	import type { CardData, WeatherGlyph } from '$lib/ui/scorecard';
	import { formatTemperature, formatWind, weatherIcon } from '$lib/conditions';
	import { isPersonalBest } from '$lib/domain/stats';
	import { maxScore } from '$lib/domain/rounds/geometry';
	import { dateFormats } from '$lib/prefs';
	import Toggle from '$lib/ui/Toggle.svelte';
	import { setPageUp, withOrigin } from '$lib/nav';
	import {
		getActivity,
		listAllActivities,
		awardBadges,
		getSession,
		getBow,
		currentRevision,
		createRevision,
		linkResultingRevision,
		loadSheet,
		recordEnd,
		updateShot,
		updateActivity,
		deleteActivity,
		restoreActivity,
		deleteLastEnd,
		shotFromZone,
		shotFromPlot,
		type ActivityRow,
		type EndRow,
		type ShotRow,
		type BowRow
	} from '$lib/db/repository';
	import { closeOnBack } from '$lib/ui/dismiss.svelte';
	import { offerUndo } from '$lib/ui/undo.svelte';

	const activityId = $derived($page.params.id as string);

	let activity = $state<ActivityRow | null>(null);
	// The route sits at the top level but the activity belongs to a session, so back climbs to it.
	$effect(() => setPageUp(activity ? `/sessions/${activity.sessionId}` : '/sessions'));
	let stored = $state<{ end: EndRow; shots: ShotRow[] }[]>([]);
	/**
	 * Ends committed locally whose write has not landed yet. Keeping a list rather than a single
	 * slot is what lets the archer keep scoring while the previous end is still being written.
	 */
	let queued = $state<{ key: string; shots: Omit<Shot, 'ordinal'>[] }[]>([]);
	/** Rows hidden by an undo that is still in flight. */
	let hiddenTail = $state(0);
	let pending = $state<Omit<Shot, 'ordinal'>[]>([]);
	let editing = $state<{ endId: string; shotId: string; endNo: number; ordinal: number } | null>(
		null
	);
	/** Index into `pending`: the end being entered has no rows yet, so it cannot be edited by shot id. */
	let editingPending = $state<number | null>(null);
	let plotting = $state(false);
	let openEnd = $state<number | null>(null);
	/** Shot id being retapped inside the end modal. */
	let modalEditing = $state<string | null>(null);
	let observations = $state('');
	let adjustment = $state('');
	let saved = $state(false);
	let autoScoring = $state(false);

	let bow = $state<BowRow | null>(null);
	let session = $state<Awaited<ReturnType<typeof getSession>>>(null);
	let draft = $state<BowSettings>({});
	let savedSettings = $state<BowSettings>({});
	let applied = $state(false);

	let sheetScroller = $state<HTMLDivElement | null>(null);

	const round = $derived<RoundDefinition | null>(
		activity?.roundDefinition ? JSON.parse(activity.roundDefinition) : null
	);
	const scoreSet = $derived(round ? getScoreSet(round.scoreSetId) : null);
	const unverified = $derived(round ? roundNeedsVerification(round) : false);
	const slots = $derived(round ? endSlots(round) : []);
	const keypad = $derived<Zone[]>(scoreSet ? scorableZones(scoreSet) : []);
	const template = $derived(activity?.templateKey ? getTemplate(activity.templateKey) : undefined);

	interface SheetRow {
		key: string;
		shots: {
			id: string | null;
			ordinal: number;
			zoneLabel: string;
			x: number | null;
			y: number | null;
		}[];
		subtotal: number;
		endId: string | null;
	}

	function displayOrder<T extends { value: number; zoneLabel: string }>(shots: T[]): T[] {
		return $sortArrowsDescending ? sortShotsDescending(shots) : shots;
	}

	const sheetRows = $derived<SheetRow[]>(
		[
			...stored.map((row) => ({
				key: row.end.id,
				endId: row.end.id,
				subtotal: row.end.subtotal,
				// Arrows are stored in the order they were called: the sheet sorts only if asked to.
				shots: displayOrder(row.shots).map((s) => ({
					id: s.id,
					ordinal: s.ordinal,
					zoneLabel: s.zoneLabel,
					x: s.x,
					y: s.y
				}))
			})),
			...queued.map((q) => ({
				key: q.key,
				endId: null,
				subtotal: q.shots.reduce((sum, s) => sum + s.value, 0),
				shots: displayOrder(q.shots).map((s, i) => ({
					id: null,
					ordinal: i + 1,
					zoneLabel: s.zoneLabel,
					x: s.x,
					y: s.y
				}))
			}))
		].slice(0, stored.length + queued.length - hiddenTail)
	);

	/** Counted from what is on screen, so the next end opens the moment the last one is entered. */
	const currentSlot = $derived(slots[sheetRows.length] ?? null);
	const complete = $derived(slots.length > 0 && sheetRows.length >= slots.length);

	/**
	 * A record is announced the moment the last arrow lands, rather than being read off the stats page
	 * later. Armed only once the sheet is on screen and the round is still unfinished, so opening a
	 * round that was finished long ago is silent.
	 */
	let armed = false;
	/** A round can set a record and earn badges with the same last arrow: they are shown together. */
	let celebrations = $state<Award[]>([]);
	$effect(() => {
		if (!round || !sheetLoaded) return;
		if (!complete) {
			armed = true;
			return;
		}
		if (!armed) return;
		armed = false;
		announceBest();
	});

	async function announceBest() {
		// The end that finished the round has to be written before the history can be asked about it.
		await writes;
		const queue: typeof celebrations = [];
		if (!$celebratedBests.includes(activityId)) queue.push(...(await recordWon()));
		// A badge is only ever awarded once, so it needs no guard of its own against a second look.
		for (const key of await awardBadges()) {
			queue.push({ title: $t('badges.new'), subtitle: $t(`badges.list.${key}.name`), score: null });
		}
		celebrations = queue;
	}

	/** The record this round set, if it set one, as the card that announces it. */
	async function recordWon() {
		const history = (await listAllActivities())
			.filter((a) => a.kind === 'scoring')
			.map((a) => ({
				id: a.id,
				sessionId: a.sessionId,
				startedAt: a.startedAt,
				totalScore: a.totalScore,
				arrowsShot: a.arrowsShot,
				count10s: a.count10s,
				countX: a.countX,
				roundDefinitionId: a.roundDefinitionId,
				round: a.roundDefinition ? (JSON.parse(a.roundDefinition) as RoundDefinition) : null
			}));
		const mine = history.find((a) => a.id === activityId);
		if (!mine || !isPersonalBest(mine, history)) return [];
		// Remembered before it is shown, and only the recent ones: this is a guard, not a history.
		celebratedBests.update((list) => [...list, activityId].slice(-50));
		return [
			{
				title: $t('home.newBest'),
				subtitle: mine.round?.name ?? $t('round.custom'),
				score: mine.totalScore
			}
		];
	}

	const runningTotals = $derived(
		sheetRows.reduce<number[]>((acc, row) => {
			acc.push((acc[acc.length - 1] ?? 0) + row.subtotal);
			return acc;
		}, [])
	);

	/**
	 * Totals shown come from the sheet, not from the stored activity row. The row is refreshed a
	 * moment later, and reading it here made the header lag behind every commit and undo.
	 */
	const shownShots = $derived(sheetRows.flatMap((r) => r.shots));
	const shownTotal = $derived(runningTotals[runningTotals.length - 1] ?? 0);
	const shownTens = $derived(
		shownShots.filter((s) => s.zoneLabel === '10' || s.zoneLabel === 'X').length
	);
	const shownXs = $derived(shownShots.filter((s) => s.zoneLabel === 'X').length);

	/**
	 * The round as a card worth sharing. Read from the sheet on screen rather than from the stored
	 * row, for the same reason the header is: the row is a moment behind every arrow.
	 */
	let sharing = $state(false);
	let shareIsBest = $state(false);

	/** The sky at the time, in the shapes the card can draw. Null when nothing was recorded. */
	const cardWeather = $derived.by(() => {
		const raw = session?.weather ? JSON.parse(session.weather) : null;
		if (!raw) return null;
		return {
			icon: weatherIcon(raw.code) as WeatherGlyph,
			temperature: formatTemperature(raw),
			wind: formatWind(raw)
		};
	});

	async function openShare() {
		// Asked once, when the card is opened: a record is worth saying on the card that goes out.
		const history = (await listAllActivities())
			.filter((a) => a.kind === 'scoring')
			.map((a) => ({
				id: a.id,
				sessionId: a.sessionId,
				startedAt: a.startedAt,
				totalScore: a.totalScore,
				arrowsShot: a.arrowsShot,
				count10s: a.count10s,
				countX: a.countX,
				roundDefinitionId: a.roundDefinitionId,
				round: a.roundDefinition ? (JSON.parse(a.roundDefinition) as RoundDefinition) : null
			}));
		const mine = history.find((a) => a.id === activityId);
		shareIsBest = mine ? isPersonalBest(mine, history) : false;
		sharing = true;
	}

	const cardData = $derived<Omit<CardData, 'options'>>({
		roundName: round?.name ?? $t('round.custom'),
		score: shownTotal,
		max: round && scoreSet && complete ? maxScore(round, scoreSet) : null,
		arrows: shownShots.length,
		tens: shownTens,
		xs: shownXs,
		sheet: sheetRows.map((row, i) => ({
			arrows: row.shots.map((shot) => shot.zoneLabel),
			subtotal: row.subtotal,
			running: runningTotals[i] ?? 0
		})),
		date: activity ? $dateFormats.date(activity.startedAt) : '',
		place: session?.location ?? null,
		bow: bow?.name ?? null,
		category: session ? $t(`sessions.${session.kind}`) : null,
		sessionName: session?.label ?? null,
		weather: cardWeather,
		isBest: shareIsBest,
		labels: {
			points: $t('score.total'),
			arrows: $t('score.arrowsColumn'),
			tens: $t('score.tens'),
			xs: $t('score.xs'),
			average: $t('share.average'),
			end: $t('share.end'),
			endTotal: $t('share.endTotal'),
			runningTotal: $t('share.running'),
			personalBest: $t('stats.personalBest'),
			tagline: $t('share.tagline')
		}
	});

	function toShots(list: { x: number | null; y: number | null; zoneLabel: string }[]): Shot[] {
		return list.map((s, i) => ({
			ordinal: i + 1,
			value: 0,
			zoneLabel: s.zoneLabel,
			x: s.x,
			y: s.y,
			source: 'plotted' as const
		}));
	}

	const storedPlotted = $derived<Shot[]>(toShots(shownShots).filter((s) => s.x !== null));
	const livePlotted = $derived<Shot[]>(toShots(pending).filter((s) => s.x !== null));

	/** The arrow being replaced, wherever it lives: one of this end's, or one already written. */
	const selectedShot = $derived.by(() => {
		if (editingPending !== null) return pending[editingPending] ?? null;
		if (!editing) return null;
		return stored.flatMap((row) => row.shots).find((shot) => shot.id === editing?.shotId) ?? null;
	});
	const selecting = $derived(editing !== null || editingPending !== null);
	/** Only an arrow that was plotted has a place to ring: one typed in as a number has none yet. */
	const selectedPlot = $derived(
		selectedShot && selectedShot.x !== null && selectedShot.y !== null
			? { x: selectedShot.x, y: selectedShot.y }
			: null
	);

	/**
	 * While shooting, the end in progress stands out against the faded ones already entered. Once the
	 * round is over there is no end in progress, so every arrow is drawn alike. An arrow being
	 * replaced joins the full strength layer wherever it came from, so the ring always sits on a mark.
	 */
	const scoringNow = $derived(currentSlot !== null || editing !== null);
	const editedPlot = $derived<Shot[]>(
		editing && selectedPlot
			? [{ ordinal: 1, value: 0, zoneLabel: '', x: selectedPlot.x, y: selectedPlot.y, source: 'plotted' }]
			: []
	);
	const faceShots = $derived(scoringNow ? [...livePlotted, ...editedPlot] : storedPlotted);
	const faceOther = $derived(scoringNow ? storedPlotted : []);

	const openRow = $derived(openEnd !== null ? sheetRows[openEnd] : null);
	const openRowShots = $derived<Shot[]>(
		openRow ? toShots(openRow.shots).filter((s) => s.x !== null) : []
	);
	const openMetrics = $derived(groupMetrics(openRowShots));
	/**
	 * Group size in centimetres: face coordinates run to 1.0 at the edge, so a normalised distance is
	 * half the face diameter. Reported as a real measurement because that is how archers compare groups.
	 */
	const openGroupCm = $derived(
		openMetrics && openEnd !== null && slots[openEnd]
			? (openMetrics.diameter * slots[openEnd].stage.faceSize) / 2
			: null
	);

	/**
	 * Follow the shooting: the row being filled must stay in view, whether that is on first load of a
	 * part shot round or after each arrow pushes the sheet down.
	 */
	$effect(() => {
		// Touch both so the effect reruns as arrows and ends are added.
		void sheetRows.length;
		void pending.length;
		if (!sheetScroller) return;
		const el = sheetScroller;
		requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
	});

	async function loadRows() {
		const { ends, shotsByEnd } = await loadSheet(activityId);
		return ends.map((end) => ({ end, shots: shotsByEnd.get(end.id) ?? [] }));
	}

	/** Until the ends are read back, an unfinished round and a finished one look exactly alike. */
	let sheetLoaded = $state(false);

	async function refresh() {
		activity = await getActivity(activityId);
		observations = activity?.observations ?? '';
		adjustment = activity?.adjustmentMade ?? '';
		stored = await loadRows();
		sheetLoaded = true;

		// The session carries the place and the bow, which the card names and tuning adjusts.
		session = activity ? await getSession(activity.sessionId) : null;
		bow = session?.bowId ? await getBow(session.bowId) : null;

		if (activity?.kind === 'tuning') {
			const revision = bow ? await currentRevision(bow.id) : null;
			savedSettings = revision ? JSON.parse(revision.settings) : {};
			draft = { ...savedSettings };
		}
	}
	$effect(() => {
		refresh();
	});

	// Writes are chained so ends reach the database in the order they were shot.
	let writes = Promise.resolve();

	/**
	 * Footage recorded for the end being scored, if any, kept until that end is written.
	 *
	 * Held here rather than in the camera modal because the two can part company: an archer may film
	 * an end, dismiss the detections, and type the arrows in by hand. The video still belongs to that
	 * end, and pairing the two is the entire reason the recording is worth keeping.
	 */
	let endVideo = $state<string | null>(null);

	/**
	 * Names the file after the end it belongs to. The activity id makes it unique across the app, and
	 * the stage and end number make it findable by anyone reading the exported sheet beside it.
	 */
	function videoNameFor(slot: EndSlot): string {
		const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		return `appchery-${activityId}-s${slot.stageIndex + 1}-e${slot.endNo}-${stamp}.webm`;
	}

	function enqueueEnd(slot: EndSlot, shots: Omit<Shot, 'ordinal'>[]) {
		// Stored as shot, so the sheet can present either order without losing what actually happened.
		const ordered = [...shots];
		const key = crypto.randomUUID();
		const video = endVideo;
		endVideo = null;
		queued = [...queued, { key, shots: ordered }];
		pending = [];

		writes = writes.then(async () => {
			await recordEnd(activityId, slot.stageIndex, slot.endNo, ordered, video);
			const fresh = await loadRows();
			// Swap both together so the row never exists twice or vanishes between the two updates.
			stored = fresh;
			queued = queued.filter((q) => q.key !== key);
			activity = await getActivity(activityId);
		});
	}

	async function tapZone(zone: Zone) {
		// An arrow of the end being entered is replaced in place, never appended as another one.
		if (editingPending !== null) {
			pending = pending.map((shot, i) => (i === editingPending ? shotFromZone(zone) : shot));
			editingPending = null;
			return;
		}
		if (editing) {
			await updateShot(editing.shotId, editing.endId, activityId, zone);
			editing = null;
			await refresh();
			return;
		}
		if (!currentSlot || pending.length >= currentSlot.arrows) return;

		const next = [...pending, shotFromZone(zone)];
		if (next.length < currentSlot.arrows) {
			pending = next;
			return;
		}
		enqueueEnd(currentSlot, next);
	}

	/** Plotting derives the value from where the arrow landed, so score and position cannot disagree. */
	async function plot(x: number, y: number) {
		if (!scoreSet) return;
		const zone = scoreAt(scoreSet, x, y);

		if (editingPending !== null) {
			pending = pending.map((shot, i) =>
				i === editingPending ? shotFromPlot(zone, x, y) : shot
			);
			editingPending = null;
			return;
		}
		if (editing) {
			await updateShot(editing.shotId, editing.endId, activityId, zone, { x, y });
			editing = null;
			await refresh();
			return;
		}
		if (!currentSlot || pending.length >= currentSlot.arrows) return;

		const next = [...pending, shotFromPlot(zone, x, y)];
		if (next.length < currentSlot.arrows) {
			pending = next;
			return;
		}
		enqueueEnd(currentSlot, next);
	}

	/**
	 * Detected arrows arrive as a batch, so they are folded in one at a time: the last one completing
	 * the end commits it, exactly as tapping them in would have.
	 */
	async function acceptDetected(points: { x: number; y: number }[]) {
		autoScoring = false;
		if (!scoreSet || !currentSlot) return;

		let next = [...pending];
		for (const point of points) {
			if (next.length >= currentSlot.arrows) break;
			next = [...next, shotFromPlot(scoreAt(scoreSet, point.x, point.y), point.x, point.y)];
		}

		if (next.length >= currentSlot.arrows) enqueueEnd(currentSlot, next);
		else pending = next;
	}

	function closeModal() {
		openEnd = null;
		modalEditing = null;
	}

	// Each sheet over the sheet: the camera, an end being reviewed, the card, the record itself.
	closeOnBack(() => autoScoring, () => (autoScoring = false));
	closeOnBack(() => openEnd !== null, closeModal);
	closeOnBack(() => celebrations.length > 0, () => (celebrations = []));

	/** Editing from the modal keeps it open, so several arrows of one end can be fixed in a row. */
	async function editModalShot(zone: Zone) {
		const row = openRow;
		if (!modalEditing || !row?.endId) return;
		await updateShot(modalEditing, row.endId, activityId, zone);
		modalEditing = null;
		stored = await loadRows();
		activity = await getActivity(activityId);
	}

	/** Retapping on the face moves the arrow and rescores it together, so the two cannot disagree. */
	async function editModalPlot(x: number, y: number) {
		const row = openRow;
		if (!modalEditing || !row?.endId || !scoreSet) return;
		await updateShot(modalEditing, row.endId, activityId, scoreAt(scoreSet, x, y), { x, y });
		modalEditing = null;
		stored = await loadRows();
		activity = await getActivity(activityId);
	}

	function undo() {
		pending = pending.slice(0, -1);
	}

	/** Undo for an end already entered: hide it at once, then wait for queued writes before deleting. */
	async function undoEnd() {
		if (sheetRows.length === 0) return;
		hiddenTail += 1;
		try {
			await writes;
			await deleteLastEnd(activityId);
			stored = await loadRows();
			activity = await getActivity(activityId);
		} finally {
			hiddenTail = Math.max(0, hiddenTail - 1);
		}
	}

	async function saveTuning() {
		await updateActivity(activityId, { observations, adjustmentMade: adjustment });
		saved = true;
		setTimeout(() => (saved = false), 1500);
	}

	const bowType = $derived((bow?.type ?? 'recurve') as BowType);
	const bowFields = $derived(bow ? schemaFor(bowType) : []);
	const settingChanges = $derived(bow ? diffSettings(bowType, savedSettings, draft) : []);

	function displayValue(field: SettingField): string {
		const value = draft[field.key];
		if (value === null || value === undefined || value === '') return '';
		if (field.kind === 'lengthMm') return String(Math.round(mmToInches(Number(value)) * 100) / 100);
		return String(value);
	}

	function setValue(field: SettingField, raw: string) {
		if (raw === '') draft = { ...draft, [field.key]: null };
		else if (field.kind === 'lengthMm')
			draft = { ...draft, [field.key]: Math.round(inchesToMm(Number(raw)) * 10) / 10 };
		else if (field.kind === 'number') draft = { ...draft, [field.key]: Number(raw) };
		else draft = { ...draft, [field.key]: raw };
	}

	function formatStored(field: SettingField, value: string | number | null): string {
		if (value === null || value === '') return '—';
		if (field.kind === 'lengthMm') return `${Math.round(mmToInches(Number(value)) * 100) / 100}"`;
		return field.unit ? `${value} ${field.unit}` : String(value);
	}

	/**
	 * Closes the loop: the adjustment becomes a bow revision, and the activity records which
	 * revision it produced, so a later score traces back to the test that caused the change.
	 */
	async function applyAdjustment() {
		if (!bow || settingChanges.length === 0) return;
		const reason = [template?.name, adjustment.trim() || observations.trim()]
			.filter(Boolean)
			.join(': ');
		const revisionId = await createRevision(bow.id, draft, reason);
		await linkResultingRevision(activityId, revisionId);
		await updateActivity(activityId, { observations, adjustmentMade: adjustment });
		applied = true;
		await refresh();
	}

	async function remove() {
		const sessionId = activity?.sessionId;
		await deleteActivity(activityId);
		offerUndo({
			message: $t('undo.activityDeleted'),
			label: $t('undo.action'),
			undo: async () => {
				await restoreActivity(activityId);
				goto(`/activities/${activityId}`);
			}
		});
		goto(sessionId ? `/sessions/${sessionId}` : '/sessions');
	}

	function zoneFor(label: string): Zone {
		if (!scoreSet) throw new Error('No score set');
		return scoreSet.zones.find((z) => z.label === label) ?? missZone(scoreSet);
	}

	/** A miss has no fill of its own, so it borrows the surface instead of rendering invisible. */
	function chipStyle(label: string): string {
		const zone = zoneFor(label);
		if (!zone.countsAsHit) return 'background-color: var(--c-sunk); color: var(--c-muted);';
		return `background-color: ${zone.color}; color: ${zone.strokeColor}; box-shadow: inset 0 0 0 1px ${zone.strokeColor}59;`;
	}

	// Outline rather than ring: the chip sets an inline box-shadow, which a ring would lose to.
	const cursorClass = 'outline outline-2 outline-brand outline-offset-2';
</script>

{#if activity && activity.kind === 'match'}
	<Match {activity} onchange={refresh} />
{:else if activity && activity.kind === 'tuning'}
	<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4 pt-6">
		<header>
			<a href="/sessions/{activity.sessionId}" class="text-sm text-muted">‹ {$t('common.back')}</a>
			<h1 class="text-2xl font-bold tracking-tight">{template?.name ?? $t('tuning.title')}</h1>
			{#if bow}
				<p class="text-sm text-muted">{bow.name}</p>
			{/if}
		</header>

		{#if template}
			<section class="rounded-xl border border-line bg-surface p-4">
				<h2 class="mb-2 text-sm font-semibold">{$t('tuning.steps')}</h2>
				<ol class="list-decimal space-y-1 pl-5 text-sm">
					{#each template.steps as step (step)}
						<li>{step}</li>
					{/each}
				</ol>
			</section>

			<section class="rounded-xl border border-line bg-surface p-4">
				<h2 class="mb-2 text-sm font-semibold">{$t('tuning.interpretation')}</h2>
				<ul class="space-y-2 text-sm">
					{#each template.interpretation as row (row.observation)}
						<li>
							<span class="font-medium">{row.observation}</span>
							<span class="block text-muted">{row.suggests}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="space-y-3 rounded-xl border border-line bg-surface p-4">
			<label class="block text-sm font-semibold">
				{$t('tuning.observation')}
				<textarea
					class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
					rows="3"
					bind:value={observations}
				></textarea>
			</label>
			<label class="block text-sm font-semibold">
				{$t('tuning.adjustment')}
				<textarea
					class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
					rows="2"
					bind:value={adjustment}
				></textarea>
			</label>
			<button
				class="w-full rounded-lg border border-line py-2 font-semibold"
				onclick={saveTuning}
			>
				{saved ? $t('common.done') : $t('common.save')}
			</button>
		</section>

		{#if activity.resultingRevisionId}
			<section class="rounded-xl border border-brand bg-brand/10 p-4 text-sm">
				<p class="font-semibold">{$t('tuning.applied')}</p>
				<a class="text-brand-text" href="/equipment/{bow?.id}">{$t('tuning.viewHistory')}</a>
			</section>
		{:else if bow}
			<section class="rounded-xl border border-line bg-surface p-4">
				<h2 class="text-sm font-semibold">{$t('tuning.applyTitle')}</h2>
				<p class="mt-0.5 mb-3 text-sm text-muted">{$t('tuning.applyHint')}</p>

				<div class="grid gap-3 sm:grid-cols-2">
					{#each bowFields as field (field.key)}
						<label class="text-sm">
							{field.label}
							{#if field.unit}<span class="text-muted">({field.unit})</span>{/if}
							{#if field.kind === 'select'}
								<select
									class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
									value={displayValue(field)}
									oninput={(e) => setValue(field, e.currentTarget.value)}
								>
									<option value=""></option>
									{#each field.options ?? [] as option (option)}
										<option value={option}>{option}</option>
									{/each}
								</select>
							{:else}
								<input
									type={field.kind === 'text' ? 'text' : 'number'}
									step={field.kind === 'lengthMm' ? '0.05' : 'any'}
									class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
									value={displayValue(field)}
									oninput={(e) => setValue(field, e.currentTarget.value)}
								/>
							{/if}
						</label>
					{/each}
				</div>

				{#if settingChanges.length > 0}
					<ul class="mt-3 space-y-1 text-sm">
						{#each settingChanges as change (change.field.key)}
							<li class="flex justify-between gap-2">
								<span class="text-muted">{change.field.label}</span>
								<span>
									{formatStored(change.field, change.before)} → <strong
										>{formatStored(change.field, change.after)}</strong
									>
								</span>
							</li>
						{/each}
					</ul>
				{/if}

				<button
					class="mt-3 w-full rounded-lg bg-brand py-2 font-semibold text-brand-ink disabled:opacity-50"
					disabled={settingChanges.length === 0 || applied}
					onclick={applyAdjustment}
				>
					{$t('tuning.apply')}
				</button>
			</section>
		{:else}
			<p class="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
				{$t('tuning.noBowSelected')}
			</p>
		{/if}

		<button class="flex items-center gap-1.5 text-sm text-danger" onclick={remove}>
			<Icon name="trash" size={16} />
			{$t('activity.delete')}
		</button>
	</div>

{:else if activity && round && scoreSet}
	<div class="mx-auto flex w-full max-w-2xl flex-col">
		<!-- A fixed height, not a minimum: the sheet must scroll so the keypad stays on screen. -->
		<!-- Capped rather than fixed, so a short sheet leaves no dead space under the keypad. -->
<div class="safe-top flex max-h-[calc(100dvh-4.6rem)] flex-col gap-3 p-4 pt-6">
		<div class="shrink-0">
			<header class="flex items-center gap-2">
				<a
					href="/sessions/{activity.sessionId}"
					class="shrink-0 text-muted"
					aria-label={$t('common.back')}
				>
					<Icon name="back" size={22} />
				</a>
				<h1 class="min-w-0 flex-1 truncate text-center text-base font-bold">{round.name}</h1>
				<!-- The shooting clock, which belongs to the line rather than to this round in particular. -->
				<a
					class="shrink-0 rounded-lg p-1.5 text-muted"
					href={withOrigin('/timer', `/activities/${activityId}`)}
					aria-label={$t('timer.title')}
				>
					<Icon name="clock" size={20} />
				</a>
				<!-- The round as a picture, which is the only form of it worth showing anyone else. -->
				<button
					class="shrink-0 rounded-lg p-1.5 text-muted disabled:opacity-30"
					aria-label={$t('share.title')}
					disabled={shownShots.length === 0}
					onclick={openShare}
				>
					<Icon name="share" size={20} />
				</button>
				<div class="shrink-0 text-right">
					<p class="tabular text-xl leading-none font-bold">{shownTotal}</p>
					<p class="text-[10px] text-muted">{$t('score.total')}</p>
				</div>
			</header>

			{#if unverified}
				<p class="mt-2 rounded-lg border border-accent/50 bg-accent/10 p-2 text-xs">
					{$t('round.unverified')}
				</p>
			{/if}
		</div>

		<!-- Sized by its rows rather than stretched: an empty sheet should not draw a tall empty box. -->
		<!--
			Arrow squares grow with the screen, capped at 20% over the phone size. The floor is what
			guarantees six arrows still fit on one line on a narrow phone: 6 x 28px plus gaps sits
			inside the width left by the end, subtotal and running total columns.
		-->
		<section
			class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface"
			style="--chip: clamp(1.75rem, 1.441rem + 1.373vw, 2.1rem)"
		>
			<div
				class="flex shrink-0 items-center gap-1 border-b border-line bg-sunk px-2 py-1.5 text-[11px] font-semibold text-muted"
			>
				<span class="w-6 shrink-0">{$t('score.endColumn')}</span>
				<span class="flex-1">{$t('score.arrowsColumn')}</span>
				<span class="w-8 text-right" title={$t('score.endTotalLong')}>
					{$t('score.endTotalShort')}
				</span>
				<span class="w-9 text-right" title={$t('score.runningTotalLong')}>
					{$t('score.total')}
				</span>
			</div>

			<!-- The cap is what keeps the keypad on screen once the sheet has more ends than fit. -->
			<div bind:this={sheetScroller} class="max-h-[42dvh] overflow-y-auto">
				{#each sheetRows as row, i (row.key)}
					<div class="flex items-center gap-1 border-b border-line px-2 py-1">
						<button
							class="tabular w-6 shrink-0 text-left text-xs font-medium text-brand-text"
							onclick={() => (openEnd = i)}
							aria-label={$t('score.end', { n: i + 1 })}
						>
							{i + 1}
						</button>
						<div class="flex flex-1 gap-0.5">
							{#each row.shots as shot (shot.ordinal)}
								{#if shot.id}
									<button
										class="tabular relative h-[var(--chip)] w-[var(--chip)] shrink-0 rounded text-[calc(var(--chip)*0.46)] font-bold
											{editing?.shotId === shot.id ? cursorClass : ''}"
										style={chipStyle(shot.zoneLabel)}
										aria-label={$t('score.editArrow', { n: shot.ordinal, end: i + 1 })}
									onclick={() => {
										editingPending = null;
										editing =
											editing?.shotId === shot.id
												? null
												: {
														endId: row.endId as string,
														shotId: shot.id as string,
														endNo: i + 1,
														ordinal: shot.ordinal
													};
									}}
									>
										{shot.zoneLabel}
										<!-- The order it was called in, kept legible once the sheet is sorted by score. -->
										{#if $showArrowNumbers}
											<span
												class="absolute right-px bottom-px text-[calc(var(--chip)*0.28)] leading-none font-semibold opacity-70"
											>
												{shot.ordinal}
											</span>
										{/if}
									</button>
								{:else}
									<span
										class="tabular flex h-[var(--chip)] w-[var(--chip)] shrink-0 items-center justify-center rounded text-[calc(var(--chip)*0.46)] font-bold"
										style={chipStyle(shot.zoneLabel)}
									>
										{shot.zoneLabel}
									</span>
								{/if}
							{/each}
						</div>
						<span class="tabular w-8 text-right text-sm font-semibold">{row.subtotal}</span>
						<span class="tabular w-9 text-right text-sm text-muted">{runningTotals[i]}</span>
					</div>
				{/each}

				{#if currentSlot}
					<div class="flex items-center gap-1 bg-brand/5 px-2 py-1">
						<span class="tabular w-6 shrink-0 text-xs font-bold text-brand-text">{sheetRows.length + 1}</span>
						<div class="flex flex-1 gap-0.5">
							{#each Array(currentSlot.arrows) as _, i (i)}
								{#if pending[i]}
									<!-- Editable before the end is committed, so a mistap is fixed where it was made. -->
									<button
										class="tabular h-[var(--chip)] w-[var(--chip)] shrink-0 rounded text-[calc(var(--chip)*0.46)] font-bold
											{editingPending === i ? cursorClass : ''}"
										style={chipStyle(pending[i].zoneLabel)}
										aria-label={$t('score.editArrow', { n: i + 1, end: sheetRows.length + 1 })}
										onclick={() => {
											editing = null;
											editingPending = editingPending === i ? null : i;
										}}
									>
										{pending[i].zoneLabel}
									</button>
								{:else}
									<span
										class="h-[var(--chip)] w-[var(--chip)] shrink-0 rounded border border-dashed
											{i === pending.length && !editing && editingPending === null
											? 'border-brand bg-brand/15 ' + cursorClass
											: 'border-line'}"
									></span>
								{/if}
							{/each}
						</div>
						<span class="w-8"></span>
						<span class="w-9"></span>
					</div>
				{/if}
			</div>
		</section>

		<!--
			The input is one block, walled off from the sheet above it: a strip that says which end is
			being shot and how it is being entered, the keypad or the face under it, and the actions
			along the bottom. Everything about entering an arrow lives inside this border.
		-->
		{#if currentSlot || editing || complete}
			<section class="shrink-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
				<header
					class="flex items-center gap-2 border-b border-line bg-sunk/60 px-3 py-2 text-[11px] text-muted"
				>
					{#if currentSlot}
						<span class="min-w-0 flex-1 truncate">
							<span class="font-semibold text-ink">
								{$t('score.endOf', { n: sheetRows.length + 1, total: slots.length })}
							</span>
							·
							{currentSlot.stage.distance
								? formatDistance(currentSlot.stage.distance.value, currentSlot.stage.distance.unit)
								: $t('round.unmarked')}
							· {$t('round.face', { size: currentSlot.stage.faceSize })}
						</span>
					{:else}
						<span class="min-w-0 flex-1 truncate font-semibold text-ink">
							{editing ? $t('score.editing') : $t('score.roundComplete')}
						</span>
					{/if}

					<!-- The two ways of entering an arrow, as one switch rather than as a button that toggles. -->
					<div class="flex shrink-0 gap-0.5 rounded-lg bg-bg p-0.5">
						{#each [{ plot: false, label: $t('score.byNumber') }, { plot: true, label: $t('score.plotMode') }] as mode (mode.label)}
							<button
								class="rounded-md px-2 py-1 text-[11px] font-medium
									{plotting === mode.plot ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
								onclick={() => (plotting = mode.plot)}
							>
								{mode.label}
							</button>
						{/each}
					</div>
				</header>

				<div class="p-3">
					{#if plotting}
						<div class="mx-auto aspect-square w-full max-w-80">
							<TargetFace
								{scoreSet}
								shots={faceShots}
								otherShots={faceOther}
								interactive={scoringNow}
								showOtherToggle
								showCentreToggle
								highlight={selectedPlot}
								onplot={plot}
							/>
						</div>
						<!-- The line under the face says what the next touch will do, which changes with what
							is selected: place a new arrow, move the ringed one, or give a typed one a place. -->
						<p class="mt-2 text-center text-xs {selecting ? 'text-brand-text' : 'text-muted'}">
							{selecting
								? selectedPlot
									? $t('score.movePlot')
									: $t('score.placePlot')
								: $t('score.plotHint')}
						</p>
					{:else}
						<div class="grid grid-cols-4 gap-1.5 {scoringNow ? '' : 'opacity-40'}">
							{#each keypad as zone (zone.label)}
								<button
									class="tabular rounded-xl py-3 text-lg font-bold shadow-sm transition-transform active:scale-95"
									style={chipStyle(zone.label)}
									onclick={() => tapZone(zone)}
								>
									{zone.label}
								</button>
							{/each}
							<button
								class="rounded-xl border border-line py-3 text-lg font-bold text-muted transition-transform active:scale-95"
								onclick={() => tapZone(missZone(scoreSet))}
							>
								{$t('score.miss')}
							</button>
						</div>
					{/if}
				</div>

				<!-- The row below the keys: undoing, filming, and dropping the end already written. -->
				<div class="flex items-center gap-2 border-t border-line bg-sunk/60 px-3 py-2">
					{#if editing || editingPending !== null}
						<button
							class="flex-1 rounded-lg border border-line bg-surface px-4 py-2 text-sm"
							onclick={() => {
								editing = null;
								editingPending = null;
							}}
						>
							{$t('common.cancel')}
						</button>
					{:else}
						{#if currentSlot && !plotting}
							<button
								class="rounded-lg border border-line bg-surface px-3 py-2 text-sm disabled:opacity-40"
								disabled={pending.length === 0}
								onclick={undo}
							>
								{$t('common.undo')}
							</button>
							<button
								class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-brand px-3 py-2 text-sm font-semibold text-brand-text disabled:opacity-40"
								onclick={() => (autoScoring = true)}
							>
								<Icon name="camera" size={18} />
								{$t('auto.open')}
							</button>
						{/if}
						{#if sheetRows.length > 0}
							<button
								class="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted"
								onclick={undoEnd}
							>
								{$t('score.undoEnd')}
							</button>
						{/if}
					{/if}
				</div>
			</section>
		{/if}

		</div>

		<div class="space-y-3 p-4 pt-0">
		{#if complete}
			<p class="text-sm text-muted">{$t('score.roundComplete')}</p>
		{/if}

		<p class="text-sm text-muted">
			{$t('score.average')}:
			<strong class="tabular">
				{(shownTotal / Math.max(shownShots.length, 1)).toFixed(2)}
			</strong>
			· {$t('score.tens')} {shownTens} · {$t('score.xs')}
			{shownXs}
		</p>

		<div class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
			<div>
				<p class="text-sm font-medium">{$t('score.sortArrows')}</p>
				<p class="text-xs text-muted">{$t('score.sortArrowsHint')}</p>
			</div>
			<Toggle
				checked={$sortArrowsDescending}
				onchange={(v) => sortArrowsDescending.set(v)}
				label={$t('score.sortArrows')}
			/>
		</div>

		<div class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
			<div>
				<p class="text-sm font-medium">{$t('score.arrowNumbers')}</p>
				<p class="text-xs text-muted">{$t('score.arrowNumbersHint')}</p>
			</div>
			<Toggle
				checked={$showArrowNumbers}
				onchange={(v) => showArrowNumbers.set(v)}
				label={$t('score.arrowNumbers')}
			/>
		</div>

		<button class="flex items-center gap-1.5 text-sm text-danger" onclick={remove}>
			<Icon name="trash" size={16} />
			{$t('activity.delete')}
		</button>
		</div>
	</div>

	{#if openRow}
		<!-- The backdrop is a button so a tap outside closes, which is what a modal is expected to do. -->
		<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
			<button
				class="absolute inset-0 bg-black/40"
				aria-label={$t('common.close')}
				onclick={closeModal}
			></button>

			<div
				class="relative m-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl"
			>
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-lg font-bold">{$t('score.end', { n: (openEnd ?? 0) + 1 })}</h2>
					<button class="text-muted" aria-label={$t('common.close')} onclick={closeModal}>
						<Icon name="close" size={20} />
					</button>
				</div>

				<div class="mb-3 flex flex-wrap gap-1">
					{#each openRow.shots as shot (shot.ordinal)}
						{#if shot.id}
							<button
								class="tabular flex h-9 w-9 items-center justify-center rounded text-sm font-bold
									{modalEditing === shot.id ? cursorClass : ''}"
								style={chipStyle(shot.zoneLabel)}
								aria-label={$t('score.editArrow', { n: shot.ordinal, end: (openEnd ?? 0) + 1 })}
								onclick={() => (modalEditing = modalEditing === shot.id ? null : shot.id)}
							>
								{shot.zoneLabel}
							</button>
						{:else}
							<span
								class="tabular flex h-9 w-9 items-center justify-center rounded text-sm font-bold"
								style={chipStyle(shot.zoneLabel)}
							>
								{shot.zoneLabel}
							</span>
						{/if}
					{/each}
				</div>

				{#if modalEditing}
					<div class="mb-3 grid grid-cols-6 gap-1">
						{#each keypad as zone (zone.label)}
							<button
								class="tabular rounded py-2 text-sm font-bold"
								style={chipStyle(zone.label)}
								onclick={() => editModalShot(zone)}
							>
								{zone.label}
							</button>
						{/each}
						<button
							class="rounded border border-line py-2 text-sm font-bold"
							onclick={() => editModalShot(missZone(scoreSet))}
						>
							{$t('score.miss')}
						</button>
					</div>
				{:else}
					<dl class="mb-3 flex justify-between text-sm">
						<div>
							<dt class="text-muted">{$t('score.endTotalLong')}</dt>
							<dd class="tabular text-xl font-bold">{openRow.subtotal}</dd>
						</div>
						<div class="text-right">
							<dt class="text-muted">{$t('score.runningTotalLong')}</dt>
							<dd class="tabular text-xl font-bold">{runningTotals[openEnd ?? 0]}</dd>
						</div>
					</dl>

					{#if openGroupCm !== null}
						<p class="mb-3 text-sm text-muted">
							{$t('score.groupSize')}:
							<strong class="tabular text-ink">{openGroupCm.toFixed(1)} cm</strong>
						</p>
					{/if}
				{/if}

				{#if openRowShots.length > 0 || modalEditing}
					<div class="mx-auto aspect-square w-full max-w-64 rounded-xl border border-line p-2">
						<!-- Only this end's arrows, with their centre and spread on by default. -->
						<TargetFace
							{scoreSet}
							shots={openRowShots}
							showCentreToggle
							showCentreDefault
							showPerimeter
							interactive={modalEditing !== null}
							onplot={editModalPlot}
						/>
					</div>
					{#if modalEditing}
						<p class="mt-2 text-center text-xs text-muted">{$t('score.plotHint')}</p>
					{/if}
				{:else}
					<p class="text-center text-sm text-muted">{$t('score.noPlots')}</p>
				{/if}
			</div>
		</div>
	{/if}
{#if autoScoring && scoreSet && currentSlot}
	<AutoScore
		{scoreSet}
		remaining={currentSlot.arrows - pending.length}
		videoName={videoNameFor(currentSlot)}
		onaccept={acceptDetected}
		onrecorded={(name) => (endVideo = name)}
		onclose={() => (autoScoring = false)}
	/>
{/if}


{#if celebrations.length > 0}
	<Fireworks awards={celebrations} onclose={() => (celebrations = [])} />
{/if}

{#if sharing}
	<Scorecard data={cardData} onclose={() => (sharing = false)} />
{/if}

{:else}
	<p class="p-8 text-center text-muted">{$t('common.loading')}</p>
{/if}
