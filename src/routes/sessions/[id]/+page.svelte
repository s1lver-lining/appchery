<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import {
		ROUNDS,
		FIELD_AND_3D_ROUNDS,
		getScoreSet,
		roundNeedsVerification,
		SCORE_SETS
	} from '$lib/domain/rounds/seed';
	import { maxScore, totalArrows } from '$lib/domain/rounds/geometry';
	import { BOW_TYPES, templatesForBowType, type BowType } from '$lib/domain/tuning/templates';
	import { GUIDE_STEPS } from '$lib/domain/tuning/guide';
	import Sheet from '$lib/ui/Sheet.svelte';
	import {
		FACE_SIZES,
		DISTANCES_M,
		DISTANCES_YD,
		END_COUNTS,
		ARROWS_PER_END
	} from '$lib/domain/rounds/custom';
	import Toggle from '$lib/ui/Toggle.svelte';
	import {
		newMatch,
		parseConfig,
		tally,
		MATCH_FORMATS,
		type MatchConfig,
		type MatchEnd,
		type MatchFormat
	} from '$lib/domain/matches';
	import { summariseByRound, shapeKey, type ScoredActivity } from '$lib/domain/stats';
	import { formatDistance } from '$lib/domain/units';
	import { defaultNameKey } from '$lib/domain/sessions';
	import { registerBackGuard } from '$lib/nav';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import TabDeck from '$lib/ui/TabDeck.svelte';
	import WheelPicker from '$lib/ui/WheelPicker.svelte';
	import {
		captureConditions,
		formatTemperature,
		formatWind,
		weatherIcon,
		weatherLabelKey,
		autoLocation,
		autoWeather,
		autoPlaceName,
		LocationDeniedError
	} from '$lib/conditions';
	import type { RoundDefinition } from '$lib/domain/rounds/types';
	import {
		getSession,
		createSession,
		updateSession,
		listPlanSlots,
		deleteSession,
		listActivities,
		listAllActivities,
		listBows,
		createScoringActivity,
		createTuningActivity,
		createMatchActivity,
		loadMatch,
		addTrainingArrows,
		awardBadges,
		type ActivityRow,
		type PlanSlotRow
	} from '$lib/db/repository';
	import Icon from '$lib/ui/Icon.svelte';
	import TargetFace from '$lib/ui/TargetFace.svelte';
	import TuningDiagram from '$lib/ui/TuningDiagram.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import Fireworks, { type Award } from '$lib/ui/Fireworks.svelte';
	import { defaultBowId, formatDateTime, dateFormats } from '$lib/prefs';
	import { closeOnBack } from '$lib/ui/dismiss.svelte';

	const sessionId = $derived($page.params.id as string);

	/**
	 * A slot from a plan opens as a session that does not exist yet. Nothing is written until
	 * something is actually entered, so a week nobody shot leaves no empty sessions behind. The id
	 * carries the slot and the date it stands for: `plan-<slot>-<startedAt>`.
	 */
	const virtualSlotId = $derived(
		sessionId.startsWith('plan-') ? sessionId.slice(5, sessionId.lastIndexOf('-')) : null
	);
	const virtualAt = $derived(Number(sessionId.slice(sessionId.lastIndexOf('-') + 1)));

	let session = $state<Awaited<ReturnType<typeof getSession>>>(null);
	let activities = $state<ActivityRow[]>([]);
	let bows = $state<Awaited<ReturnType<typeof listBows>>>([]);
	let matchEnds = $state<Map<string, MatchEnd[]>>(new Map());
	let tab = $state<'overview' | 'settings'>('overview');
	const TABS = $derived([
		{ key: 'overview' as const, label: $t('session.overviewTab') },
		{ key: 'settings' as const, label: $t('session.settingsTab') }
	]);
	let adding = $state(false);
	let fetching = $state(false);
	let notice = $state<string | null>(null);
	/** The name reads as a heading until tapped, so the page does not look like a form. */
	let editingName = $state(false);
	let nameInput = $state<HTMLInputElement | null>(null);
	let confirmingDelete = $state(false);

	const weather = $derived(session?.weather ? JSON.parse(session.weather) : null);
	/** Arrows tapped in but not yet written, counted everywhere at once so the page never lags a tap. */
	let pending = $state(0);
	/** The point of the page: every arrow entered in this session, whatever it was shot at. */
	const sessionArrows = $derived(
		activities.reduce((sum, a) => sum + a.arrowsShot, 0) + pending
	);
	/** Arrows shot without scoring them. They live in one activity, shown as a counter, not a row. */
	const training = $derived(activities.find((a) => a.kind === 'training'));
	const listedActivities = $derived(activities.filter((a) => a.kind !== 'training'));

	/**
	 * Counted locally and written once the finger stops. A long press ticks several times a second,
	 * and each tick reaching the database would cost a row in the change log for an arrow nobody
	 * counted separately.
	 */
	const trainingArrows = $derived(Math.max(0, (training?.arrowsShot ?? 0) + pending));
	let flushTimer: ReturnType<typeof setTimeout> | null = null;

	function countArrows(delta: number) {
		if (trainingArrows + delta < 0) return;
		pending += delta;
		if (flushTimer) clearTimeout(flushTimer);
		flushTimer = setTimeout(flushArrows, 500);
	}

	async function flushArrows() {
		if (flushTimer) clearTimeout(flushTimer);
		flushTimer = null;
		const delta = pending;
		if (delta === 0) return;
		const id = await materialise();
		await addTrainingArrows(id, delta);
		await refresh();
		// Dropped only once the reload holds it, otherwise the counter blinks back for a frame.
		pending -= delta;
		// Arrows taken back off the counter cannot have won anything, so only additions are checked.
		if (delta > 0) await announceBadges();
	}

	/**
	 * Untargeted arrows count towards the volume and habit badges like any other, so a badge one of
	 * them earns is announced on the page it was earned on rather than waiting to be found later.
	 */
	let celebrations = $state<Award[]>([]);

	async function announceBadges() {
		const won = await awardBadges();
		// Left alone when nothing was won, so counting on past a badge does not clear it off the screen.
		if (won.length === 0) return;
		celebrations = won.map((key) => ({
			title: $t('badges.new'),
			subtitle: $t(`badges.list.${key}.name`)
		}));
	}

	/** Held down, the minus runs away with itself, faster the longer it is held. */
	let repeat: ReturnType<typeof setTimeout> | null = null;
	function startRepeat() {
		let wait = 380;
		const tick = () => {
			countArrows(-1);
			wait = Math.max(45, wait * 0.72);
			repeat = setTimeout(tick, wait);
		};
		repeat = setTimeout(tick, 450);
	}

	function stopRepeat() {
		if (repeat) clearTimeout(repeat);
		repeat = null;
	}

	/** The sheet exists to take a number, so the keyboard comes up with it rather than after a tap. */
	function focusNow(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	let countDialog = $state<'add' | 'set' | null>(null);
	let countDraft = $state<number | string>('');

	function openCount(mode: 'add' | 'set') {
		countDraft = mode === 'set' ? trainingArrows : '';
		countDialog = mode;
	}

	async function applyCount() {
		const value = Number(countDraft);
		const mode = countDialog;
		countDialog = null;
		if (!Number.isFinite(value)) return;
		countArrows(mode === 'set' ? Math.max(0, value) - trainingArrows : value);
		await flushArrows();
	}

	let notes = $state('');
	let notesLoaded = $state<string | null>(null);
	// Loaded once per session rather than on every refresh, so typing is never overwritten mid word.
	$effect(() => {
		if (!session || notesLoaded === session.id) return;
		notesLoaded = session.id;
		notes = session.notes ?? '';
	});

	let notesTimer: ReturnType<typeof setTimeout> | null = null;
	function saveNotes() {
		if (notesTimer) clearTimeout(notesTimer);
		// Written after a pause rather than per keystroke: every write costs a change log row.
		notesTimer = setTimeout(async () => {
			const id = await materialise();
			await updateSession(id, { notes: notes.trim() || null });
		}, 600);
	}
	/** Weather without a place still says something; a place name alone does too. */
	const hasConditions = $derived(Boolean(weather || session?.location));

	/** Local time, split the way the two native fields want it, so no timezone maths reaches the DB. */
	const pad = (n: number) => String(n).padStart(2, '0');
	const dateField = (at: number) => {
		const d = new Date(at);
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	};
	const timeField = (at: number) => {
		const d = new Date(at);
		return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	};

	/** A session entered days later is the common case, so whole days are one tap away. */
	const DAY_SHIFTS = [-7, -1, 1, 7];

	async function setStartedAt(date: string, time: string) {
		const [year, month, day] = date.split('-').map(Number);
		const [hour, minute] = time.split(':').map(Number);
		if (!year || !month || !day) return;
		const at = new Date(year, month - 1, day, hour || 0, minute || 0).getTime();
		const id = await materialise();
		await updateSession(id, { startedAt: at });
		await refresh();
	}

	async function shiftDays(days: number) {
		if (!session) return;
		const moved = new Date(session.startedAt);
		// Stepped through the Date constructor so a daylight saving change cannot drop an hour.
		moved.setDate(moved.getDate() + days);
		const id = await materialise();
		await updateSession(id, { startedAt: moved.getTime() });
		await refresh();
	}

	let goalDraft = $state<number | string>('');
	let editingGoal = $state(false);
	const GOAL_PRESETS = [36, 60, 72, 90, 120, 144];

	function openGoal() {
		goalDraft = session?.arrowGoal ?? '';
		editingGoal = true;
	}

	async function saveGoal(value: number | null) {
		editingGoal = false;
		const id = await materialise();
		await updateSession(id, { arrowGoal: value });
		await refresh();
	}

	const defaultName = $derived(
		session ? $t(defaultNameKey(session.kind, session.startedAt)) : ''
	);
	const selectedBowType = $derived<BowType | null>(
		(bows.find((b) => b.id === session?.bowId)?.type ?? session?.bowType ?? null) as BowType | null
	);
	const tuningTemplates = $derived(selectedBowType ? templatesForBowType(selectedBowType) : []);

	async function refresh() {
		bows = await listBows();
		if (virtualSlotId) {
			const slot = (await listPlanSlots()).find((s) => s.id === virtualSlotId);
			session = slot ? virtualSession(slot) : null;
			activities = [];
			return;
		}
		session = await getSession(sessionId);
		activities = await listActivities(sessionId);

		// A match's result lives in its ends, so the list reads them rather than the activity's score.
		const cards = await Promise.all(
			activities.filter((a) => a.kind === 'match').map(async (a) => [a.id, await loadMatch(a.id)] as const)
		);
		matchEnds = new Map(cards.map(([id, card]) => [id, card.ends]));
	}

	/** Shaped like a row so every part of the page reads it the same way, stored nowhere. */
	function virtualSession(slot: PlanSlotRow) {
		const now = Date.now();
		return {
			id: sessionId,
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
			deviceId: '',
			label: slot.label,
			startedAt: virtualAt,
			kind: 'planned',
			arrowGoal: slot.arrowGoal,
			bowId: $defaultBowId,
			bowType: null,
			bowRevisionId: null,
			location: null,
			latitude: null,
			longitude: null,
			weather: null,
			notes: null
		};
	}

	/**
	 * Writes the session a virtual page stands for and moves the URL onto it. Every write on this
	 * page goes through here, so anything the archer enters is kept and nothing else is.
	 */
	async function materialise(): Promise<string> {
		if (!virtualSlotId || !session) return sessionId;
		const id = await createSession({ kind: 'planned', bowId: $defaultBowId });
		await updateSession(id, {
			startedAt: session.startedAt,
			label: session.label,
			arrowGoal: session.arrowGoal
		});
		await goto(`/sessions/${id}`, { replaceState: true });
		return id;
	}
	$effect(() => {
		refresh();
	});

	/**
	 * Fetch once for a session that has none yet, so a slow permission prompt never blocks the UI.
	 * Never for a slot still standing in for a session: writing the conditions would write the
	 * session, and merely looking at a planned outing must not create one.
	 */
	let attempted = false;
	$effect(() => {
		if (virtualSlotId || !session || attempted || !$autoLocation || session.latitude !== null)
			return;
		attempted = true;
		fetchConditions();
	});

	async function setPlace(value: string) {
		const id = await materialise();
		await updateSession(id, { location: value.trim() || null });
		await refresh();
	}

	async function setBow(value: string) {
		const id = await materialise();
		if (value.startsWith('bow:')) await updateSession(id, { bowId: value.slice(4), bowType: null });
		else await updateSession(id, { bowId: null, bowType: value || null });
		await refresh();
	}

	async function fetchConditions() {
		notice = null;
		// Nothing asks the system for a position while the setting is off, since granting it would
		// still leave the archer with a switch that says location is not recorded.
		if (!$autoLocation) {
			notice = $t('session.locationOff');
			return;
		}
		const id = await materialise();
		fetching = true;
		try {
			const conditions = await captureConditions($autoWeather, $autoPlaceName);
			await updateSession(id, {
				latitude: conditions.latitude,
				longitude: conditions.longitude,
				location: conditions.place,
				weather: conditions.weather ? JSON.stringify(conditions.weather) : null
			});
			// Being offline at a range is normal, so a failed lookup says so rather than showing nothing.
			if (!$autoWeather) notice = $t('session.weatherOff');
			else if (!conditions.weather) notice = $t('session.weatherFailed');
			await refresh();
		} catch (error) {
			notice = error instanceof LocationDeniedError ? $t('session.locationDenied') : String(error);
		}
		fetching = false;
	}

	/** Every sheet on this page is a place of its own, and the back key leaves the innermost one. */
	closeOnBack(() => adding, () => (adding = false));
	closeOnBack(() => editingGoal, () => (editingGoal = false));
	closeOnBack(() => countDialog !== null, () => (countDialog = null));
	closeOnBack(() => celebrations.length > 0, () => (celebrations = []));

	async function startRound(round: RoundDefinition) {
		const id = await materialise();
		goto(`/activities/${await createScoringActivity(id, round)}`);
	}

	async function startTuning(key: string) {
		const id = await materialise();
		goto(`/activities/${await createTuningActivity(id, key)}`);
	}

	/** Points a set match can be played to: six for an individual, five for a team, or anything. */
	const SET_POINTS = Array.from({ length: 15 }, (_, i) => i + 1);
	/** Where the distance wheel opens, which is the distance a match is usually shot at. */
	const DEFAULT_DISTANCE = 70;
	/** Folded away until asked for: a match can be shot without naming anybody. */
	let showAdvanced = $state(false);

	/**
	 * A match is set up before it is opened: who it is against and under which rules is the whole of
	 * what a match is, and asking for it on the card while a first end is waiting is asking too late.
	 */
	let draftMatch = $state<MatchConfig | null>(null);

	function openMatch(format: MatchFormat) {
		// Seeded rather than left null: the wheel shows a distance, so the card had better record it.
		draftMatch = { ...newMatch(format, 'set'), distance: { value: DEFAULT_DISTANCE, unit: 'm' } };
		showAdvanced = false;
	}

	/** Where a match stands, read off its own ends rather than off the activity's score. */
	function matchState(a: ActivityRow) {
		const config = matchOf(a);
		const ends = matchEnds.get(a.id) ?? [];
		if (!config) return { winner: null, label: $t('match.inProgress') };
		const result = tally(config, ends);
		if (result.winner === 'us') return { winner: 'us' as const, label: $t('match.won') };
		if (result.winner === 'them') return { winner: 'them' as const, label: $t('match.lost') };
		if (result.needsShootOff) return { winner: null, label: $t('match.undecided') };
		return { winner: null, label: $t('match.inProgress') };
	}

	function matchSummary(a: ActivityRow) {
		const config = matchOf(a);
		if (!config) return $t('match.title');
		const result = tally(config, matchEnds.get(a.id) ?? []);
		const score =
			config.system === 'set'
				? `${result.ourPoints} – ${result.theirPoints}`
				: `${result.ourTotal} – ${result.theirTotal}`;
		return `${$t(`match.format.${config.format}`)} · ${score}`;
	}

	async function startMatch() {
		if (!draftMatch) return;
		const config = draftMatch;
		draftMatch = null;
		adding = false;
		const id = await materialise();
		goto(`/activities/${await createMatchActivity(id, config)}`);
	}

	closeOnBack(
		() => draftMatch !== null,
		() => (draftMatch = null)
	);

	// While the name is open the back key belongs to the editor, not to the way out of the session.
	$effect(() => {
		if (!editingName) return;
		return registerBackGuard(() => {
			editingName = false;
			return true;
		});
	});

	function startRename() {
		editingName = true;
		// Focus after the input exists, and select so a placeholder name is replaced by typing.
		queueMicrotask(() => nameInput?.select());
	}

	async function saveName(value: string) {
		editingName = false;
		const id = await materialise();
		await updateSession(id, { label: value.trim() || null });
		await refresh();
	}

	async function remove() {
		// A session that was never written has nothing to delete: leaving the page is the whole of it.
		if (!virtualSlotId) await deleteSession(sessionId);
		goto('/sessions');
	}

	/** A match is named by who it was against, since that is the whole of what it was. */
	const matchOf = (a: ActivityRow) => parseConfig(a.matchConfig);

	function activityTitle(a: ActivityRow) {
		if (a.kind === 'match') {
			const config = matchOf(a);
			return config?.opponent
				? `${$t('match.title')} ${$t('match.against', { name: config.opponent })}`
				: $t('match.title');
		}
		if (a.kind === 'tuning') return a.templateKey ?? $t('tuning.title');
		const round: RoundDefinition | null = a.roundDefinition ? JSON.parse(a.roundDefinition) : null;
		return round?.name ?? '';
	}

	/**
	 * What a stage is shot at, or nothing when there is no one answer: a marked field course carries
	 * a zero distance because every peg has its own, and "0m" is a distance nobody is standing at.
	 */
	function stageDistance(stage: RoundDefinition['stages'][number]): string | null {
		if (!stage.distance) return $t('round.unmarked');
		return stage.distance.value > 0
			? formatDistance(stage.distance.value, stage.distance.unit)
			: null;
	}

	function summarise(round: RoundDefinition) {
		const stages = round.stages.map(stageDistance).filter(Boolean).join(' · ');
		const arrows = $t('round.arrows', { n: totalArrows(round) });
		return stages ? `${stages} · ${arrows}` : arrows;
	}

	/**
	 * Every round ever scored, read once the picker is opened rather than with the session: it is a
	 * whole table, and it is only ever wanted by the cards that say what you usually score.
	 */
	let scored = $state<ScoredActivity[]>([]);
	let historyLoaded = false;
	$effect(() => {
		if (!adding || historyLoaded) return;
		historyLoaded = true;
		listAllActivities().then((rows) => {
			scored = rows
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
					round: a.roundDefinition ? JSON.parse(a.roundDefinition) : null
				}));
		});
	});

	const summaries = $derived(summariseByRound(scored));
	/** Matched on the shape rather than on the id, so a custom round of the same shape still counts. */
	const statsOf = (round: RoundDefinition) =>
		summaries.find((summary) => summary.key === shapeKey(round));

	const lastShotAt = $derived(
		scored.reduce<Map<string, number>>((acc, activity) => {
			const key = shapeKey(activity.round);
			return acc.set(key, Math.max(acc.get(key) ?? 0, activity.startedAt));
		}, new Map())
	);

	const CATALOGUE = [...ROUNDS, ...FIELD_AND_3D_ROUNDS];

	/** What this archer actually shoots, which is what the picker should open on. */
	const recent = $derived(
		CATALOGUE.filter((round) => lastShotAt.has(shapeKey(round)))
			.sort((a, b) => (lastShotAt.get(shapeKey(b)) ?? 0) - (lastShotAt.get(shapeKey(a)) ?? 0))
			.slice(0, 3)
	);

	/** Disciplines in the order the catalogue lists them, so target comes before the rarer shapes. */
	const disciplines = $derived([...new Set(CATALOGUE.map((round) => round.discipline))]);
	const roundsOf = (discipline: string) =>
		CATALOGUE.filter((round) => round.discipline === discipline);

	/** The picture a tuning procedure earns, taken from the guide that already names them. */
	const diagramOf = (templateKey: string) =>
		GUIDE_STEPS.find((step) => step.templateKey === templateKey)?.diagram ?? null;

	const whenShot = (round: RoundDefinition) => {
		const at = lastShotAt.get(shapeKey(round));
		return at ? $t('round.lastShot', { when: $dateFormats.date(at) }) : null;
	};
</script>

<!--
	One round, read at a glance: the face it is shot at, what it is made of, and what this archer
	usually scores on it. The face is drawn from the same zone map that scores a tap, so the picture
	on the card and the target in the activity cannot disagree.
-->
{#snippet roundCard(round: RoundDefinition, withDate: boolean)}
	{@const stats = statsOf(round)}
	<button
		class="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-left"
		onclick={() => startRound(round)}
	>
		<span class="h-11 w-11 shrink-0">
			<TargetFace scoreSet={getScoreSet(round.scoreSetId)} />
		</span>

		<span class="min-w-0 flex-1">
			<span class="flex items-start gap-1.5">
				<span class="min-w-0 flex-1 truncate font-medium">{round.name}</span>
				{#if round.governingBody}
					<!-- The body in the app's own type rather than its mark: a logo is somebody's property. -->
					<span
						class="shrink-0 rounded border border-line px-1 py-px text-[10px] font-semibold tracking-wide text-muted uppercase"
					>
						{round.governingBody}
					</span>
				{/if}
			</span>

			<span class="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted">
				{#each round.stages as stage, i (i)}
					{@const distance = stageDistance(stage)}
					{#if distance}
						<span class="tabular rounded bg-sunk px-1.5 py-0.5 font-medium">{distance}</span>
					{/if}
				{/each}
				<span class="tabular">{$t('round.arrows', { n: totalArrows(round) })}</span>
				<span class="text-line">·</span>
				<span class="tabular">
					{roundNeedsVerification(round)
						? $t('round.unverifiedShort')
						: $t('round.max', { n: maxScore(round, getScoreSet(round.scoreSetId)) })}
				</span>
			</span>

			<!-- The number to beat, and when it was last gone for: one line, the record leading. -->
			{#if stats || withDate}
				<span class="mt-1 flex items-baseline gap-2 text-[11px]">
					{#if stats}
						<span class="tabular text-brand-text">
							{$t('round.yourBest', { n: stats.best.totalScore })}
						</span>
					{/if}
					{#if withDate}
						<span class="ml-auto truncate text-muted">{whenShot(round)}</span>
					{/if}
				</span>
			{/if}
		</span>
	</button>
{/snippet}

{#if session}
	<PageHeader motif="session" subtitle={$formatDateTime(session.startedAt)}>
		{#snippet lead()}
			{@const named = session}
			<a href="/sessions" class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
				<Icon name="back" size={22} />
			</a>
			{#if editingName}
				<input
					bind:this={nameInput}
					class="mt-1 w-full rounded-lg border-2 border-brand bg-surface px-3 py-2 text-2xl font-bold tracking-tight text-ink outline-none"
					value={named?.label ?? ''}
					placeholder={defaultName}
					onblur={(e) => saveName(e.currentTarget.value)}
					onkeydown={(e) => {
						if (e.key === 'Enter') e.currentTarget.blur();
						if (e.key === 'Escape') editingName = false;
					}}
				/>
			{:else}
				<button
					class="-mx-1 mt-1 rounded-lg px-1 text-left text-2xl font-bold tracking-tight
						{named?.label ? 'text-ink' : 'text-muted'}"
					onclick={startRename}
				>
					{named?.label ?? defaultName}
				</button>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="mx-auto w-full max-w-2xl space-y-4 p-4">
		<TabDeck tabs={TABS} bind:value={tab}>
			{#snippet pane(key)}
				<!-- Guarded again here: the check outside does not narrow inside a snippet. -->
				{#if session}
					{#if key === 'overview'}
						<!-- What was shot leads, with the conditions beside it: they frame the figure. -->
						<div class="grid grid-cols-3 gap-3">
							<section
								class="rounded-xl border border-line bg-surface p-3.5 {hasConditions
									? 'col-span-2'
									: 'col-span-3'}"
							>
								<div class="flex items-end justify-between gap-2">
									<p class="tabular text-[2rem] leading-none font-bold text-brand-text">
										{sessionArrows}
									</p>
									{#if session.arrowGoal}
										<button class="tabular shrink-0 text-sm font-semibold text-muted" onclick={openGoal}>
											/ {session.arrowGoal}
										</button>
									{/if}
								</div>

								<!-- Label and goal share one line, which is the line this block used to spend twice. -->
								<p class="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
									<span>
										{$t('session.arrowsShot')}{session.arrowGoal ? ',' : ''}
									</span>
									{#if session.arrowGoal}
										<span>
											{Math.min(1, sessionArrows / session.arrowGoal) >= 1
												? $t('session.goalReached')
												: $t('session.goalLeft', { n: session.arrowGoal - sessionArrows })}
										</span>
										<!-- A goal set before the outing is the one most likely to need changing during it. -->
										<button
											class="text-brand-text"
											aria-label={$t('session.goalTitle')}
											onclick={openGoal}
										>
											<Icon name="edit" size={13} />
										</button>
									{:else}
										<span>·</span>
										<button
											class="flex items-center gap-0.5 font-medium text-brand-text"
											onclick={openGoal}
										>
											<Icon name="plus" size={13} />
											{$t('session.setGoal')}
										</button>
									{/if}
								</p>

								{#if session.arrowGoal}
									{@const done = Math.min(1, sessionArrows / session.arrowGoal)}
									<!-- One bar, no numbers repeated: the count above already says where it stands. -->
									<div class="mt-2 h-2 overflow-hidden rounded-full bg-sunk">
										<div
											class="h-full rounded-full transition-[width] duration-500 {done >= 1
												? 'bg-accent'
												: 'bg-brand'}"
											style="width: {Math.max(done * 100, sessionArrows > 0 ? 4 : 0)}%"
										></div>
									</div>
								{/if}
							</section>

							{#if hasConditions}
								<section
									class="flex flex-col items-center justify-center rounded-xl border border-line bg-surface p-3 text-center"
								>
									{#if weather}
										<!-- Icon and reading side by side once a place name takes the line below them. -->
										<div class="flex items-center justify-center gap-1.5">
											<Icon name={weatherIcon(weather.code)} size={session.location ? 26 : 30} />
											<p class="tabular text-sm leading-tight font-semibold">
												{formatTemperature(weather)}
											</p>
										</div>
										<p class="tabular text-[11px] leading-tight text-muted">{formatWind(weather)}</p>
									{/if}
									{#if session.location}
										<p class="mt-0.5 w-full truncate text-[11px] leading-tight text-muted">
											{session.location}
										</p>
									{/if}
								</section>
							{/if}
						</div>

						<!-- Arrows shot at nothing in particular still count: warm ups, blank bale, form work. -->
						<section class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3.5">
							<!-- The total is a button: correcting a count is faster than tapping it down. -->
							<button class="text-left" onclick={() => openCount('set')}>
								<p class="tabular text-2xl leading-none font-bold">{trainingArrows}</p>
								<p class="mt-1 text-xs text-muted">{$t('session.trainingArrows')}</p>
							</button>
							<div class="flex items-center gap-1.5">
								<button
									class="touch-manipulation rounded-lg border border-line px-2.5 py-1.5 text-sm font-semibold select-none disabled:opacity-30"
									disabled={trainingArrows === 0}
									aria-label={$t('session.oneLess')}
									onclick={() => countArrows(-1)}
									onpointerdown={startRepeat}
									onpointerup={stopRepeat}
									onpointerleave={stopRepeat}
									onpointercancel={stopRepeat}
								>
									−
								</button>
								{#each [1, 3, 6] as step (step)}
									<button
										class="tabular rounded-lg border border-line px-2.5 py-1.5 text-sm font-medium"
										onclick={() => countArrows(step)}
									>
										+{step}
									</button>
								{/each}
								<button
									class="rounded-lg bg-brand px-2.5 py-1.5 text-sm font-semibold text-brand-ink"
									aria-label={$t('session.customArrows')}
									onclick={() => openCount('add')}
								>
									<Icon name="plus" size={16} />
								</button>
							</div>
						</section>

						<section>
							<div class="mb-2 flex items-center justify-between">
								<h2 class="text-sm font-semibold">{$t('session.activities')}</h2>
								<button
									class="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink"
									onclick={() => (adding = true)}
								>
									<Icon name="plus" size={16} />
									{$t('common.add')}
								</button>
							</div>

							{#if listedActivities.length === 0}
								<p class="rounded-xl border border-dashed border-line p-6 text-center text-muted">
									{$t('session.noActivities')}
								</p>
							{:else}
								<ul class="space-y-2">
									{#each listedActivities as a (a.id)}
										<li>
											<a
												href="/activities/{a.id}"
												class="flex items-center justify-between rounded-xl border border-line bg-surface p-3"
											>
												<div>
													<p class="font-medium">{activityTitle(a)}</p>
													<p class="text-xs text-muted">
														{a.kind === 'tuning'
															? $t('tuning.title')
															: a.kind === 'match'
																? matchSummary(a)
																: `${a.arrowsShot} ${$t('score.arrow')}`}
													</p>
												</div>
												{#if a.kind === 'scoring'}
													<span class="tabular text-xl font-bold">{a.totalScore}</span>
												{:else if a.kind === 'match'}
													<!-- The result rather than the score: a match is won or lost, never a number. -->
													{@const state = matchState(a)}
													<span
														class="text-sm font-semibold {state.winner === 'us'
															? 'text-brand-text'
															: state.winner === 'them'
																? 'text-competition'
																: 'text-muted'}"
													>
														{state.label}
													</span>
												{/if}
											</a>
										</li>
									{/each}
								</ul>
							{/if}
						</section>

						<section class="rounded-xl border border-line bg-surface p-3.5">
							<h2 class="mb-2 text-sm font-semibold">{$t('session.notes')}</h2>
							<textarea
								class="min-h-24 w-full resize-y rounded-lg border border-line bg-bg p-2 text-sm text-ink"
								placeholder={$t('session.notesHint')}
								bind:value={notes}
								oninput={saveNotes}
								onblur={saveNotes}
							></textarea>
						</section>
					{:else}
						<section class="rounded-xl border border-line bg-surface p-4">
							<h2 class="mb-2 text-sm font-semibold">{$t('session.when')}</h2>
							<div class="flex gap-2">
								<input
									type="date"
									class="tabular flex-1 rounded-lg border border-line bg-bg p-2 text-ink"
									aria-label={$t('session.date')}
									value={dateField(session.startedAt)}
									onchange={(e) => setStartedAt(e.currentTarget.value, timeField(session!.startedAt))}
								/>
								<input
									type="time"
									class="tabular flex-1 rounded-lg border border-line bg-bg p-2 text-ink"
									aria-label={$t('session.time')}
									value={timeField(session.startedAt)}
									onchange={(e) => setStartedAt(dateField(session!.startedAt), e.currentTarget.value)}
								/>
							</div>
							<div class="mt-2 flex gap-2">
								{#each DAY_SHIFTS as shift (shift)}
									<button
										class="flex-1 rounded-lg border border-line py-1.5 text-xs font-medium text-muted"
										onclick={() => shiftDays(shift)}
									>
										{shift > 0 ? '+' : ''}{shift}
										{$t('session.days')}
									</button>
								{/each}
							</div>
						</section>

						<section class="rounded-xl border border-line bg-surface p-4">
							<label class="mb-1 block text-sm font-semibold" for="bow">{$t('session.bow')}</label>
							<select
								id="bow"
								class="w-full rounded-lg border border-line bg-bg p-2 text-ink"
								value={session.bowId ? `bow:${session.bowId}` : (session.bowType ?? '')}
								onchange={(e) => setBow(e.currentTarget.value)}
							>
								<option value="">{$t('session.noBow')}</option>
								{#if bows.length > 0}
									<optgroup label={$t('session.myBows')}>
										{#each bows as b (b.id)}
											<option value="bow:{b.id}">{b.name}</option>
										{/each}
									</optgroup>
								{/if}
								<optgroup label={$t('session.genericBow')}>
									{#each BOW_TYPES as type (type)}
										<option value={type}>{$t(`bow.${type}`)}</option>
									{/each}
								</optgroup>
							</select>
						</section>

						<section class="overflow-hidden rounded-xl border border-line bg-surface">
							<div class="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
								<h2 class="text-sm font-semibold">{$t('session.conditions')}</h2>
								<button
									class="text-sm font-medium text-brand-text disabled:opacity-50"
									disabled={fetching}
									onclick={fetchConditions}
								>
									{fetching ? $t('session.fetching') : $t('session.fetchConditions')}
								</button>
							</div>

							<!-- Typed in by hand as well as fetched: a club has a name the geocoder never guesses. -->
							<label class="block border-b border-line px-4 py-3 text-sm">
								<span class="text-muted">{$t('session.place')}</span>
								<input
									class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
									value={session.location ?? ''}
									onchange={(e) => setPlace(e.currentTarget.value)}
								/>
							</label>

							{#if session.location || session.latitude !== null}
								<div class="flex items-center gap-4 p-4">
									{#if weather}
										<div class="flex flex-col items-center text-brand-text">
											<Icon name={weatherIcon(weather.code)} size={40} />
											<span class="mt-1 text-xs text-muted">{$t(weatherLabelKey(weather.code))}</span>
										</div>
									{/if}
									<div class="flex-1">
										<!-- Only a real place name is worth a heading: coordinates say nothing to read. -->
										{#if session.location}
											<p class="text-lg font-semibold">{session.location}</p>
										{/if}
										{#if weather}
											<p class="tabular text-sm text-muted">
												{formatTemperature(weather)} · {formatWind(weather)}
											</p>
										{:else}
											<p class="text-sm text-muted">{$t('session.weatherNone')}</p>
										{/if}
									</div>
								</div>
							{:else}
								<p class="p-4 text-sm text-muted">{$t('session.noConditions')}</p>
							{/if}

							{#if notice}
								<p class="border-t border-line px-4 py-2 text-sm text-danger">{notice}</p>
							{/if}
						</section>

						<button
							class="flex items-center gap-1.5 text-sm text-danger"
							onclick={() => (confirmingDelete = true)}
						>
							<Icon name="trash" size={16} />
							{$t('session.delete')}
						</button>
					{/if}
				{/if}
			{/snippet}
		</TabDeck>
	</div>

	{#if adding}
		<div class="fixed inset-0 z-50 flex flex-col bg-bg">
			<header
				class="safe-top flex items-center justify-between border-b border-line px-4 py-3 pt-6"
			>
				<h2 class="text-lg font-bold">{$t('session.addActivity')}</h2>
				<button class="text-muted" aria-label={$t('common.close')} onclick={() => (adding = false)}>
					<Icon name="close" size={22} />
				</button>
			</header>

			<div class="mx-auto w-full max-w-2xl flex-1 space-y-6 overflow-y-auto p-4">
				<!-- Most archers shoot two or three rounds, so the ones already shot come first. -->
				{#if recent.length > 0}
					<section>
						<h3 class="mb-2 text-sm font-semibold text-muted">{$t('session.recentGroup')}</h3>
						<div class="grid gap-2 sm:grid-cols-2">
							{#each recent as round (round.id)}
								{@render roundCard(round, true)}
							{/each}
						</div>
					</section>
				{/if}

				<section>
					<h3 class="mb-2 text-sm font-semibold text-muted">{$t('session.scoringGroup')}</h3>
					<!-- The custom round leads: it is the one entry that is not a name to recognise. -->
					<a
						href="/sessions/{sessionId}/custom"
						class="mb-2 flex items-center gap-3 rounded-xl border border-dashed border-brand/60 bg-brand/5 p-3"
					>
						<span
							class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand-text"
						>
							<Icon name="plus" size={20} />
						</span>
						<span class="min-w-0">
							<span class="block font-medium text-brand-text">{$t('round.custom')}</span>
							<span class="mt-0.5 block text-xs text-muted">{$t('round.customHint')}</span>
						</span>
					</a>

					<!-- One section per discipline: a field course and an indoor round are different errands. -->
					<div class="space-y-4">
						{#each disciplines as discipline (discipline)}
							<div>
								<h4 class="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
									{$t(`round.discipline.${discipline}`)}
								</h4>
								<div class="grid gap-2 sm:grid-cols-2">
									{#each roundsOf(discipline) as round (round.id)}
										{@render roundCard(round, false)}
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</section>

				<!-- Shot against somebody rather than against a round, which is why it is its own section. -->
				<section>
					<h3 class="mb-2 text-sm font-semibold text-muted">{$t('match.group')}</h3>
					<div class="grid gap-2 sm:grid-cols-2">
						{#each MATCH_FORMATS as format (format)}
							<button
								class="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left"
								onclick={() => openMatch(format)}
							>
								<span
									class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sunk text-muted"
								>
									<Icon name={format === 'custom' ? 'sliders' : 'medal'} size={20} />
								</span>
								<span class="min-w-0 flex-1">
									<span class="block font-medium">{$t(`match.format.${format}`)}</span>
									<span class="mt-0.5 block text-xs text-muted">
										{$t(`match.formatHint.${format}`)}
									</span>
								</span>
							</button>
						{/each}
					</div>
				</section>

				<section>
					<h3 class="mb-2 text-sm font-semibold text-muted">{$t('tuning.title')}</h3>
					{#if !selectedBowType}
						<p class="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
							{$t('tuning.noBowSelected')}
						</p>
					{:else}
						<div class="grid gap-2 sm:grid-cols-2">
							{#each tuningTemplates as template (template.key)}
								{@const diagram = diagramOf(template.key)}
								<button
									class="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left"
									onclick={() => startTuning(template.key)}
								>
									<!-- The same drawing the guide uses, which says what the procedure looks at. -->
									<span class="flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden">
										{#if diagram}
											<TuningDiagram name={diagram} />
										{:else}
											<Icon name="wrench" size={20} />
										{/if}
									</span>
									<span class="min-w-0 flex-1 font-medium">{template.name}</span>
								</button>
							{/each}
						</div>
					{/if}
				</section>
			</div>
		</div>
	{/if}
{:else}
	<p class="p-8 text-center text-muted">{$t('common.loading')}</p>
{/if}

{#if draftMatch}
	<!-- Set up before it is opened: who it is against and under which rules is what a match is. -->
	<Sheet
		open={true}
		title={$t(`match.format.${draftMatch.format}`)}
		onclose={() => (draftMatch = null)}
	>
		<div class="space-y-3">
			<!-- Sets unless asked otherwise: recurve shoots sets, and compound adds its arrows up. -->
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="text-sm font-medium">{$t('match.onTotalTitle')}</p>
					<p class="text-xs text-muted">{$t('match.onTotalHint')}</p>
				</div>
				<Toggle
					checked={draftMatch.system === 'cumulative'}
					label={$t('match.onTotalTitle')}
					onchange={(v) =>
						draftMatch && (draftMatch = { ...draftMatch, system: v ? 'cumulative' : 'set' })}
				/>
			</div>

			{#if draftMatch.format === 'custom'}
				<!-- The same wheels the custom round is built with, so one form does not read as two. -->
				<div class="grid grid-cols-3 gap-2 border-t border-line pt-3">
					<WheelPicker
						values={ARROWS_PER_END}
						value={draftMatch.arrowsPerEnd}
						label={$t('match.arrowsPerEnd')}
						item={34}
						onchange={(v) => draftMatch && (draftMatch = { ...draftMatch, arrowsPerEnd: v })}
					/>
					<WheelPicker
						values={END_COUNTS}
						value={draftMatch.maxEnds}
						label={$t('match.ends')}
						item={34}
						onchange={(v) => draftMatch && (draftMatch = { ...draftMatch, maxEnds: v })}
					/>
					{#if draftMatch.system === 'set'}
						<WheelPicker
							values={SET_POINTS}
							value={draftMatch.setPointsToWin}
							label={$t('match.setPoints')}
							item={34}
							onchange={(v) => draftMatch && (draftMatch = { ...draftMatch, setPointsToWin: v })}
						/>
					{/if}
				</div>
			{/if}

			<!-- The face the plotted arrows land on: a match carries no round to read it from. -->
			<div class="border-t border-line pt-3">
				<label class="block text-xs text-muted">
					{$t('match.face')}
					<select
						class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm text-ink"
						value={draftMatch.scoreSetId}
						onchange={(e) =>
							draftMatch && (draftMatch = { ...draftMatch, scoreSetId: e.currentTarget.value })}
					>
						{#each SCORE_SETS as set (set.id)}
							<option value={set.id}>{set.name}</option>
						{/each}
					</select>
				</label>

				<span class="mt-2 block text-xs text-muted">{$t('match.faceSize')}</span>
				<div class="mt-1 flex gap-2">
					{#each FACE_SIZES as size (size)}
						<button
							class="tabular flex-1 rounded-lg border py-2 text-sm font-medium
								{draftMatch.faceSize === size ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
							onclick={() => draftMatch && (draftMatch = { ...draftMatch, faceSize: size })}
						>
							{size}
						</button>
					{/each}
				</div>
			</div>

			<!-- The unit rides on the distance heading: it is a property of that number, not its own field. -->
			<div class="border-t border-line pt-3">
				<div class="mb-1 flex items-center justify-between">
					<span class="text-xs text-muted">{$t('round.distance')}</span>
					<div class="flex gap-1 rounded-lg bg-sunk p-0.5">
						{#each ['m', 'yd'] as const as unit (unit)}
							<button
								class="rounded-md px-3 py-1 text-xs font-medium
									{(draftMatch.distance?.unit ?? 'm') === unit
									? 'bg-surface text-ink shadow-sm'
									: 'text-muted'}"
								onclick={() => {
									if (!draftMatch) return;
									const list = unit === 'm' ? DISTANCES_M : DISTANCES_YD;
									const value = draftMatch.distance?.value ?? DEFAULT_DISTANCE;
									// Kept on the new unit's scale rather than left holding an impossible number.
									draftMatch = {
										...draftMatch,
										distance: { value: list.includes(value) ? value : list[0], unit }
									};
								}}
							>
								{unit}
							</button>
						{/each}
					</div>
				</div>
				<WheelPicker
					values={draftMatch.distance?.unit === 'yd' ? DISTANCES_YD : DISTANCES_M}
					value={draftMatch.distance?.value ?? DEFAULT_DISTANCE}
					label={$t('round.distance')}
					item={34}
					labelHidden
					format={(v) => `${v} ${draftMatch?.distance?.unit ?? 'm'}`}
					onchange={(v) =>
						draftMatch &&
						(draftMatch = {
							...draftMatch,
							distance: { value: v, unit: draftMatch.distance?.unit ?? 'm' }
						})}
				/>
			</div>

			<div class="flex items-center justify-between gap-3 border-t border-line pt-3">
				<p class="text-sm font-medium">{$t('match.allowShootOff')}</p>
				<Toggle
					checked={draftMatch.shootOff}
					label={$t('match.allowShootOff')}
					onchange={(v) => draftMatch && (draftMatch = { ...draftMatch, shootOff: v })}
				/>
			</div>

			<!-- Everything a match can be shot without: it starts folded so the common case is short. -->
			<div class="flex items-center justify-between gap-3 border-t border-line pt-3">
				<p class="text-sm font-medium">{$t('match.advanced')}</p>
				<Toggle
					checked={showAdvanced}
					label={$t('match.advanced')}
					onchange={(v) => (showAdvanced = v)}
				/>
			</div>

			{#if showAdvanced}
				<div class="space-y-3 border-l-2 border-line pl-3">
					<div class="flex gap-2">
						<input
							class="min-w-0 flex-1 rounded-lg border border-line bg-bg p-2 text-sm text-ink"
							placeholder={$t('match.ourSide')}
							aria-label={$t('match.ourSide')}
							value={draftMatch.ourName ?? ''}
							onchange={(e) =>
								draftMatch &&
								(draftMatch = { ...draftMatch, ourName: e.currentTarget.value.trim() || null })}
						/>
						<input
							class="min-w-0 flex-1 rounded-lg border border-line bg-bg p-2 text-sm text-ink"
							placeholder={$t('match.opponent')}
							aria-label={$t('match.opponent')}
							value={draftMatch.opponent ?? ''}
							onchange={(e) =>
								draftMatch &&
								(draftMatch = { ...draftMatch, opponent: e.currentTarget.value.trim() || null })}
						/>
					</div>

					{#if draftMatch.format !== 'individual'}
						<!-- Optional throughout: a team match is scored the same whether or not anybody is named. -->
						<div>
							<p class="mb-1 text-xs font-semibold text-muted">{$t('match.teammates')}</p>
							<div class="space-y-1">
								{#each [...draftMatch.teammates, ''] as name, i (i)}
									<input
										class="w-full rounded-lg border border-line bg-bg p-2 text-sm text-ink"
										placeholder={$t('match.teammate', { n: i + 1 })}
										aria-label={$t('match.teammate', { n: i + 1 })}
										value={name}
										onchange={(e) => {
											if (!draftMatch) return;
											const next = [...draftMatch.teammates];
											const typed = e.currentTarget.value.trim();
											if (typed) next[i] = typed;
											else next.splice(i, 1);
											draftMatch = { ...draftMatch, teammates: next.filter(Boolean) };
										}}
									/>
								{/each}
							</div>
						</div>
					{/if}

					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-sm font-medium">{$t('match.forOtherTitle')}</p>
							<p class="text-xs text-muted">{$t('match.forOtherHint')}</p>
						</div>
						<Toggle
							checked={!draftMatch.forSelf}
							label={$t('match.forOtherTitle')}
							onchange={(v) => draftMatch && (draftMatch = { ...draftMatch, forSelf: !v })}
						/>
					</div>
				</div>
			{/if}
		</div>

		{#snippet footer()}
			<button
				class="flex-1 rounded-lg border border-line py-2 text-sm font-medium"
				onclick={() => (draftMatch = null)}
			>
				{$t('common.cancel')}
			</button>
			<button
				class="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink"
				onclick={startMatch}
			>
				{$t('match.start')}
			</button>
		{/snippet}
	</Sheet>
{/if}

{#if editingGoal}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
		<button
			class="absolute inset-0 bg-black/40"
			aria-label={$t('common.close')}
			onclick={() => (editingGoal = false)}
		></button>

		<div class="relative m-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl">
			<h2 class="text-lg font-bold">{$t('session.goalTitle')}</h2>
			<p class="mt-0.5 mb-3 text-xs text-muted">{$t('session.goalHint')}</p>

			<!-- One field holds the number; the presets are shortcuts into it, not a second answer. -->
			<input
				type="number"
				inputmode="numeric"
				min="1"
				class="tabular w-full rounded-lg border border-line bg-bg p-3 text-2xl font-bold text-ink"
				aria-label={$t('session.goalTitle')}
				bind:value={goalDraft}
			/>

			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each GOAL_PRESETS as preset (preset)}
					<button
						class="tabular rounded-lg border px-3 py-1.5 text-sm font-medium
							{Number(goalDraft) === preset ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
						onclick={() => (goalDraft = preset)}
					>
						{preset}
					</button>
				{/each}
			</div>

			<div class="mt-4 flex gap-2">
				{#if session?.arrowGoal}
					<button
						class="flex-1 rounded-lg border border-line py-2.5 text-sm font-medium text-danger"
						onclick={() => saveGoal(null)}
					>
						{$t('session.removeGoal')}
					</button>
				{/if}
				<button
					class="flex-1 rounded-lg bg-brand py-2.5 font-semibold text-brand-ink"
					onclick={() => saveGoal(Number(goalDraft) > 0 ? Number(goalDraft) : null)}
				>
					{$t('common.save')}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if countDialog}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
		<button
			class="absolute inset-0 bg-black/40"
			aria-label={$t('common.close')}
			onclick={() => (countDialog = null)}
		></button>

		<div class="relative m-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl">
			<h2 class="mb-3 text-lg font-bold">
				{countDialog === 'set' ? $t('session.trainingArrows') : $t('session.customArrows')}
			</h2>
			<input
				type="number"
				inputmode="numeric"
				min="0"
				class="tabular w-full rounded-lg border border-line bg-bg p-3 text-2xl font-bold text-ink"
				aria-label={$t('session.trainingArrows')}
				bind:value={countDraft}
				use:focusNow
			/>
			<div class="mt-4 flex gap-2">
				<button
					class="flex-1 rounded-lg border border-line py-2.5 text-sm font-medium"
					onclick={() => (countDialog = null)}
				>
					{$t('common.cancel')}
				</button>
				<button
					class="flex-1 rounded-lg bg-brand py-2.5 font-semibold text-brand-ink"
					onclick={applyCount}
				>
					{countDialog === 'set' ? $t('common.save') : $t('common.add')}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if confirmingDelete}
	<ConfirmDialog
		title={$t('session.confirmTitle')}
		message={$t('session.confirmBody')}
		onconfirm={remove}
		oncancel={() => (confirmingDelete = false)}
	/>
{/if}

{#if celebrations.length > 0}
	<Fireworks awards={celebrations} onclose={() => (celebrations = [])} />
{/if}
