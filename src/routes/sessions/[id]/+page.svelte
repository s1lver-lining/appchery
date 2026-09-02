<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { tap } from '$lib/haptics';
	import {
		ROUNDS,
		FIELD_AND_3D_ROUNDS,
		getScoreSet,
		roundNeedsVerification,
		SCORE_SETS
	} from '$lib/domain/rounds/seed';
	import { maxScore, totalArrows } from '$lib/domain/rounds/geometry';
	import { shootsArrows } from '$lib/domain/stats';
	import {
		BOW_TYPES,
		templatesForBowType,
		getTemplate,
		type BowType
	} from '$lib/domain/tuning/templates';
	import { GUIDE_STEPS } from '$lib/domain/tuning/guide';
	import Sheet from '$lib/ui/Sheet.svelte';
	import PageSkeleton from '$lib/ui/PageSkeleton.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import NamePicker from '$lib/ui/NamePicker.svelte';
	import {
		FACE_SIZES,
		DISTANCES_M,
		DISTANCES_YD,
		END_COUNTS,
		ARROWS_PER_END
	} from '$lib/domain/rounds/custom';
	import {
		STRENGTH_KIND,
		emptyStrengthPlan,
		parseStrength,
		setsDone,
		setsPlanned
	} from '$lib/domain/strength';
	import { RUNNING_KIND, clock, emptyRun, parseRun } from '$lib/domain/running';
import { FREE_SCORE_KIND, parseFreeScore, freeScoreLabel } from '$lib/domain/freeScore';
	import {
		DRILL_GAMES,
		DRILL_KIND,
		drillDefinition,
		drillFaceLabel,
		needsSetup,
		usesFace,
		newDrill,
		parseDrill,
		type DrillGame
	} from '$lib/domain/drills';
	import Toggle from '$lib/ui/Toggle.svelte';
	import { BOT_LEVELS } from '$lib/domain/bots';
	import {
		matchFaceSize,
		matchDistance,
		matchDistanceUnit,
		matchScoreSet,
		matchSystem
	} from '$lib/prefs';
	import {
		newMatch,
		parseConfig,
		DEFAULT_SCORE_SET,
		tally,
		stageRank,
		MATCH_FORMATS,
		MATCH_STAGES,
		type MatchStage,
		type MatchConfig,
		type MatchEnd,
		type MatchFormat
	} from '$lib/domain/matches';
	import { summariseByRound, shapeKey, type ScoredActivity } from '$lib/domain/stats';
	import { formatDistance } from '$lib/domain/units';
	import { defaultNameKey, matchesQuery } from '$lib/domain/sessions';
	import { registerBackGuard } from '$lib/nav';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import TabDeck from '$lib/ui/TabDeck.svelte';
	import WheelPicker from '$lib/ui/WheelPicker.svelte';
	import {
		captureConditions,
		conditionsPatch,
		formatTemperature,
		formatWind,
		weatherIcon,
		withSky,
		WEATHER_ICONS,
		type WeatherIcon,
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
		restoreSession,
		listActivities,
		listAllActivities,
		listBows,
		deleteActivities,
		restoreActivities,
		createScoringActivity,
		createTuningActivity,
		createDrillActivity,
		createStrengthActivity,
		createRunningActivity,
		createMatchActivity,
		loadMatch,
		listMatchNames,
		addTrainingArrows,
		awardBadges,
		type ActivityRow,
		type PlanSlotRow
	} from '$lib/db/repository';
	import Icon, { type IconName } from '$lib/ui/Icon.svelte';
	import { BOW_ICONS } from '$lib/ui/bowIcon';
	import MatchGlyph from '$lib/ui/MatchGlyph.svelte';
	import TargetFace from '$lib/ui/TargetFace.svelte';
	import TuningDiagram from '$lib/ui/TuningDiagram.svelte';
	import Fireworks, { type Award } from '$lib/ui/Fireworks.svelte';
	import { levelUpAward } from '$lib/levelUp';
	import { defaultBowId, formatDateTime, dateFormats } from '$lib/prefs';
	import { closeOnBack } from '$lib/ui/dismiss.svelte';
	import { longpress } from '$lib/ui/longpress';
	import SelectionBar from '$lib/ui/SelectionBar.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import { offerUndo } from '$lib/ui/undo.svelte';
	import { scrim, ownsStatusBar } from '$lib/ui/statusBar';
	import { lockScroll } from '$lib/ui/scrollLock';

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
	/** Opened fresh every time: a search is about the round being looked for now, not the last one. */
	function openPicker() {
		query = '';
		adding = true;
	}
	let fetching = $state(false);
	let notice = $state<string | null>(null);
	/** The setting the notice is about, so the archer is taken to it rather than sent looking. */
	let noticeSetting = $state<string | null>(null);
	/** The name reads as a heading until tapped, so the page does not look like a form. */
	let editingName = $state(false);
	let nameInput = $state<HTMLInputElement | null>(null);

	const weather = $derived(session?.weather ? JSON.parse(session.weather) : null);
	/** Arrows tapped in but not yet written, counted everywhere at once so the page never lags a tap. */
	let pending = $state(0);
	/**
	 * The point of the page: every arrow entered in this session, whatever it was shot at. Filtered to
	 * the kinds that shoot, like every other arrow figure, so a kind added later without being thought
	 * about cannot count here while the statistics leave it out.
	 */
	const sessionArrows = $derived(
		activities.filter((a) => shootsArrows(a.kind)).reduce((sum, a) => sum + a.arrowsShot, 0) + pending
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
		tap();
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
		const queue: Award[] = (await awardBadges()).map((key) => ({
			title: $t('badges.new'),
			subtitle: $t(`badges.list.${key}.name`),
			href: '/badges'
		}));
		const climbed = await levelUpAward($t);
		if (climbed) queue.push(climbed);
		// Left alone when nothing was won, so counting on past a badge does not clear it off the screen.
		if (queue.length === 0) return;
		celebrations = queue;
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

	/** What the bow picker has highlighted: one of the archer's own bows, a generic type, or neither. */
	/** Temperature and wind if either was ever read: a sky said by hand carries neither. */
	const weatherReading = $derived(
		weather ? [formatTemperature(weather), formatWind(weather)].filter(Boolean).join(' · ') : ''
	);

	const chosenBow = $derived(session?.bowId ? `bow:${session.bowId}` : (session?.bowType ?? ''));
	/** The archer's own bow this outing is on, where it is one of theirs rather than a generic type. */
	const myBow = $derived(bows.find((b) => b.id === session?.bowId) ?? null);
	let bowSheet = $state(false);

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
			// Nobody owns an outing that was never written, and it never reaches a push.
			userId: null,
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

	/**
	 * The sky said by hand. Kept apart from fetching it: an archer with location switched off, or no
	 * signal at the range, still knows whether the sun was out, and that is worth recording.
	 */
	async function setSky(icon: WeatherIcon | null) {
		const id = await materialise();
		await updateSession(id, { weather: icon ? JSON.stringify(withSky(weather, icon)) : null });
		await refresh();
	}

	async function fetchConditions() {
		notice = null;
		noticeSetting = null;
		// Nothing asks the system for a position while the setting is off, since granting it would
		// still leave the archer with a switch that says location is not recorded.
		if (!$autoLocation) {
			notice = $t('session.locationOff');
			noticeSetting = 'location';
			return;
		}
		const id = await materialise();
		fetching = true;
		try {
			const conditions = await captureConditions($autoWeather, $autoPlaceName);
			await updateSession(id, conditionsPatch(conditions));
			// Being offline at a range is normal, so a failed lookup says so rather than showing nothing.
			if (!$autoWeather) {
				notice = $t('session.weatherOff');
				noticeSetting = 'weather';
			} else if (!conditions.weather) notice = $t('session.weatherFailed');
			await refresh();
		} catch (error) {
			notice = error instanceof LocationDeniedError ? $t('session.locationDenied') : String(error);
			if (error instanceof LocationDeniedError) noticeSetting = 'location';
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

	/**
	 * Says which bow this outing is on, from the one place that needs to know. With no bow recorded
	 * at all there is nothing to pick from, so it goes to the form and the bow made there comes back
	 * to this session; otherwise the settings tab already holds the list.
	 */
	async function chooseBow() {
		if (bows.length > 0) {
			adding = false;
			tab = 'settings';
			return;
		}
		// Written first: the equipment page hands the new bow back by id, and a slot has no row yet.
		const id = await materialise();
		goto(`/equipment?add=1&session=${id}&from=${encodeURIComponent(`/sessions/${id}`)}`);
	}

	async function startTuning(key: string) {
		const id = await materialise();
		goto(`/activities/${await createTuningActivity(id, key)}`);
	}

	/**
	 * Training, which is an activity of the session like anything else and shoots nothing. Both open
	 * empty: the exercises and the two numbers are filled in on the activity's own page, where the
	 * work is actually done.
	 */
	/** A drill with nothing to set opens straight at the keypad, the rest at their setup first. */
	async function openDrill(game: DrillGame) {
		const id = await materialise();
		if (needsSetup(game)) goto(`/sessions/${id}/drill/${game}`);
		else goto(`/activities/${await createDrillActivity(id, newDrill(game))}`);
	}

	async function startStrength() {
		const id = await materialise();
		goto(`/activities/${await createStrengthActivity(id, emptyStrengthPlan())}`);
	}

	async function startRunning() {
		const id = await materialise();
		goto(`/activities/${await createRunningActivity(id, emptyRun())}`);
	}

	/** Points a set match can be played to: six for an individual, five for a team, or anything. */
	const SET_POINTS = Array.from({ length: 15 }, (_, i) => i + 1);
	/** Folded away until asked for: a match can be shot without naming anybody. */
	let showAdvanced = $state(false);

	/**
	 * A match is set up before it is opened: who it is against and under which rules is the whole of
	 * what a match is, and asking for it on the card while a first end is waiting is asking too late.
	 */
	let draftMatch = $state<MatchConfig | null>(null);

	/** Everybody named on a card before, read once the picker is opened rather than with the session. */
	let knownNames = $state<Awaited<ReturnType<typeof listMatchNames>>>({
		opponents: [],
		ours: [],
		teammates: [],
		everyone: []
	});
	$effect(() => {
		if (adding) listMatchNames().then((names) => (knownNames = names));
	});

	/** Opened on the last match's setup: the same match twice should be asked about once. */
	function openMatch(format: MatchFormat) {
		draftMatch = {
			...newMatch(format, $matchSystem === 'cumulative' ? 'cumulative' : 'set'),
			scoreSetId: $matchScoreSet ?? DEFAULT_SCORE_SET,
			faceSize: $matchFaceSize,
			distance: { value: $matchDistance, unit: $matchDistanceUnit === 'yd' ? 'yd' : 'm' }
		};
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
		return { winner: null, label: result.drawn ? $t('match.drawn') : $t('match.inProgress') };
	}

	/**
	 * The day's ladder: the matches that named a round of it, in the order it is climbed. A bracket is
	 * shot from the outside in, so reading it by stage says how far the day went in a way the clock
	 * cannot.
	 */
	const bracket = $derived(
		activities
			.filter((a) => a.kind === 'match' && (matchOf(a)?.stage ?? 'none') !== 'none')
			.sort((a, b) => stageRank(matchOf(a)!.stage) - stageRank(matchOf(b)!.stage))
	);

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
		// Remembered as it is started rather than as it is typed, so an abandoned sheet changes nothing.
		matchSystem.set(config.system);
		matchScoreSet.set(config.scoreSetId);
		if (config.faceSize) matchFaceSize.set(config.faceSize);
		if (config.distance) {
			matchDistance.set(config.distance.value);
			matchDistanceUnit.set(config.distance.unit);
		}
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

	/**
	 * Deleted at once and offered back, rather than asked about first. Nothing is lost either way:
	 * a delete only hides the row, so putting it back is putting it back rather than rebuilding it.
	 */
	async function remove() {
		// A session that was never written has nothing to delete: leaving the page is the whole of it.
		if (!virtualSlotId) {
			await deleteSession(sessionId);
			offerUndo({
				message: $t('undo.sessionDeleted'),
				label: $t('undo.action'),
				undo: async () => {
					await restoreSession(sessionId);
					goto(`/sessions/${sessionId}`);
				}
			});
		}
		goto('/sessions');
	}

	// Held down to enter, the same gesture the session list is worked on as a selection with.
	let selecting = $state(false);
	let selected = $state<string[]>([]);
	let confirmingRemove = $state(false);

	const isSelected = $derived((id: string) => selected.includes(id));

	function holdActivity(id: string) {
		selecting = true;
		if (!selected.includes(id)) selected = [...selected, id];
	}

	function toggleActivity(id: string) {
		selected = selected.includes(id) ? selected.filter((a) => a !== id) : [...selected, id];
	}

	function endSelection() {
		selecting = false;
		selected = [];
	}

	// The rows belong to the tab they are listed in, so leaving it puts the selection down.
	$effect(() => {
		if (tab !== 'overview') endSelection();
	});

	closeOnBack(() => selecting, endSelection);

	async function removeSelected() {
		confirmingRemove = false;
		const ids = selected;
		await deleteActivities(ids);
		endSelection();
		await refresh();
		offerUndo({
			message: $t('undo.activitiesDeleted', { n: ids.length }),
			label: $t('undo.action'),
			undo: async () => {
				await restoreActivities(ids);
				await refresh();
			}
		});
	}

	/** A match is named by who it was against, since that is the whole of what it was. */
	const matchOf = (a: ActivityRow) => parseConfig(a.matchConfig);

	function activityTitle(a: ActivityRow) {
		if (a.kind === 'match') {
			const config = matchOf(a);
			const stage = config && config.stage !== 'none' ? $t(`match.stage.${config.stage}`) : null;
			const against = config?.bot
				? $t('match.botName', { level: $t(`match.bot.${config.bot}`) })
				: config?.opponent;
			const name = against
				? `${$t('match.title')} ${$t('match.against', { name: against })}`
				: $t('match.title');
			return stage ? `${stage} · ${name}` : name;
		}
		if (a.kind === FREE_SCORE_KIND) return $t('freeScore.title');
		// The game's name rather than the word "drill": the row said nothing otherwise.
		if (a.kind === DRILL_KIND) return $t(`drill.game.${parseDrill(a.measurements).game}.name`);
		if (a.kind === STRENGTH_KIND) return $t('strength.title');
		if (a.kind === RUNNING_KIND) return $t('running.title');
		// The procedure's name, not the key it is stored under: the row said "limb-alignment".
		if (a.kind === 'tuning')
			return a.templateKey && getTemplate(a.templateKey)
				? $t(`tuning.template.${a.templateKey}`)
				: $t('tuning.title');
		const round: RoundDefinition | null = a.roundDefinition ? JSON.parse(a.roundDefinition) : null;
		return round?.name ?? '';
	}

	/**
	 * What a drill row is worth reading at a glance: where it was shot and how many arrows it took.
	 * Never its total, which is not a score anybody can compare, see src/lib/domain/drills/types.ts.
	 */
	function drillSummary(a: ActivityRow): string {
		const drill = parseDrill(a.measurements);
		const arrows = `${a.arrowsShot} ${$t('score.arrow')}`;
		return usesFace(drill) ? `${drillFaceLabel(drill.face)} · ${arrows}` : arrows;
	}

	/** Sets done out of sets planned: what a training row is worth reading at a glance. */
	function strengthSummary(a: ActivityRow): string {
		const plan = parseStrength(a.measurements);
		return $t('strength.rowSummary', { done: setsDone(plan), total: setsPlanned(plan) });
	}

	/** The two numbers, or a nudge to enter them: a run with neither says nothing on its own. */
	function runSummary(a: ActivityRow): string {
		const run = parseRun(a.measurements);
		const parts = [
			run.distanceM === null ? null : $t('running.kmValue', { km: Math.round(run.distanceM / 10) / 100 }),
			run.durationSeconds === null ? null : clock(run.durationSeconds)
		].filter(Boolean);
		return parts.length > 0 ? parts.join(' · ') : $t('running.hint');
	}

	/** The round a scored activity was shot at, for the face drawn beside its row. */
	const roundOf = (a: ActivityRow): RoundDefinition | null =>
		a.roundDefinition ? JSON.parse(a.roundDefinition) : null;

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

	// One 3D face is enough to pick from: the two differ by scoring, and the picker must fit a phone.
	const MATCH_FACES = SCORE_SETS.filter((set) => set.id !== 'asa-3d');

	/** What this archer actually shoots, which is what the picker should open on. */
	const recent = $derived(
		CATALOGUE.filter((round) => lastShotAt.has(shapeKey(round)))
			.sort((a, b) => (lastShotAt.get(shapeKey(b)) ?? 0) - (lastShotAt.get(shapeKey(a)) ?? 0))
			.slice(0, 3)
	);

	/** What is typed in the picker's search box: the catalogue is long to scroll for a known name. */
	let query = $state('');
	const searching = $derived(query.trim().length > 0);

	/** A round answers to its name, its governing body, and the distances it is shot at. */
	const roundMatches = (round: RoundDefinition) =>
		matchesQuery(query, [
			round.name,
			round.governingBody,
			$t(`round.discipline.${round.discipline}`),
			...round.stages.map(stageDistance)
		]);

	/** Disciplines in the order the catalogue lists them, so target comes before the rarer shapes. */
	const disciplines = $derived(
		[...new Set(CATALOGUE.map((round) => round.discipline))].filter(
			(discipline) => roundsOf(discipline).length > 0
		)
	);
	const roundsOf = (discipline: string) =>
		CATALOGUE.filter((round) => round.discipline === discipline && roundMatches(round));

	const foundRecent = $derived(recent.filter(roundMatches));
	const foundMatchFormats = $derived(
		MATCH_FORMATS.filter((format) =>
			matchesQuery(query, [$t(`match.format.${format}`), $t(`match.formatHint.${format}`), $t('match.group')])
		)
	);
	const foundTemplates = $derived(
		tuningTemplates.filter((template) =>
			matchesQuery(query, [$t(`tuning.template.${template.key}`), $t('tuning.title')])
		)
	);
	const foundCustom = $derived(matchesQuery(query, [$t('round.custom'), $t('round.customHint')]));
	const foundFree = $derived(matchesQuery(query, [$t('freeScore.title'), $t('freeScore.hint')]));
	const foundDrills = $derived(
		DRILL_GAMES.filter((game) =>
			matchesQuery(query, [
				$t(`drill.game.${game}.name`),
				$t(`drill.game.${game}.hint`),
				$t('drill.group')
			])
		)
	);
	const foundTraining = $derived(
		matchesQuery(query, [
			$t('training.group'),
			$t('strength.title'),
			$t('strength.hint'),
			$t('running.title'),
			$t('running.hint')
		])
	);
	const nothingFound = $derived(
		searching &&
			disciplines.length === 0 &&
			foundMatchFormats.length === 0 &&
			foundTemplates.length === 0 &&
			foundDrills.length === 0 &&
			!foundCustom &&
			!foundFree &&
			!foundTraining
	);

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
{#snippet matchGroup()}
	{#if foundMatchFormats.length > 0}
		<div>
			<h4 class="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
				{$t('match.group')}
			</h4>
			<div class="grid gap-2 sm:grid-cols-2">
				{#each foundMatchFormats as format (format)}
					<button
						class="press flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left"
						onclick={() => openMatch(format)}
					>
						<span class="flex shrink-0 items-center justify-center">
							<MatchGlyph {format} />
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
		</div>
	{/if}
{/snippet}

{#snippet roundCard(round: RoundDefinition, withDate: boolean)}
	{@const stats = statsOf(round)}
	<button
		class="press flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-left"
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

			<!-- One line rather than two: the record reads beside what it was scored on. -->
			<span class="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted">
				{#each round.stages as stage, i (i)}
					{@const distance = stageDistance(stage)}
					{#if distance}
						<span class="tabular rounded bg-sunk px-1.5 py-0.5 font-medium">{distance}</span>
					{/if}
				{/each}
				<span class="tabular">{$t('round.arrows', { n: totalArrows(round) })}</span>
				{#if stats}
					<span class="text-line">·</span>
					<span class="tabular text-brand-text">
						{$t('round.yourBest', { n: stats.best.totalScore })}
					</span>
				{/if}
				{#if withDate}
					<span class="text-line">·</span>
					<span class="truncate">{whenShot(round)}</span>
				{/if}
				<span class="tabular ml-auto pl-1">
					{roundNeedsVerification(round)
						? $t('round.unverifiedShort')
						: $t('round.max', { n: maxScore(round, getScoreSet(round.scoreSetId)) })}
				</span>
			</span>
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

	<div class="mx-auto w-full max-w-page space-y-4 p-4">
		<TabDeck tabs={TABS} bind:value={tab} expand="primary">
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
												{formatTemperature(weather) ?? $t(weatherLabelKey(weather.code))}
											</p>
										</div>
										{#if formatWind(weather)}
											<p class="tabular text-[11px] leading-tight text-muted">{formatWind(weather)}</p>
										{/if}
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
									class="press touch-manipulation rounded-lg border border-line px-2.5 py-1.5 text-sm font-semibold select-none disabled:opacity-30"
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
										class="press tabular rounded-lg border border-line px-2.5 py-1.5 text-sm font-medium"
										onclick={() => countArrows(step)}
									>
										+{step}
									</button>
								{/each}
								<button
									class="press rounded-lg bg-brand px-2.5 py-1.5 text-sm font-semibold text-brand-ink"
									aria-label={$t('session.customArrows')}
									onclick={() => openCount('add')}
								>
									<Icon name="plus" size={16} />
								</button>
							</div>
						</section>

						<section>
						{#if bracket.length > 0}
							<!-- One rung a match, climbing: the shape of the day rather than a list of it. -->
							<section class="mb-4 rounded-xl border border-line bg-surface p-3.5">
								<h2 class="mb-2 text-sm font-semibold">{$t('match.bracket')}</h2>
								<ol class="space-y-1.5">
									{#each bracket as a, i (a.id)}
										{@const state = matchState(a)}
										{@const config = matchOf(a)}
										<li class="flex items-center gap-2">
											<span class="relative flex w-16 shrink-0 items-center">
												<span class="text-[11px] font-semibold tracking-wide text-muted uppercase">
													{$t(`match.stage.${config?.stage ?? 'none'}`)}
												</span>
												<!-- The rungs are joined, because a bracket is one climb and not four outings. -->
												{#if i < bracket.length - 1}
													<span class="absolute top-full left-1 h-1.5 w-0.5 bg-line"></span>
												{/if}
											</span>
											<a
												href="/activities/{a.id}"
												class="press flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line px-2 py-1.5"
											>
												<span class="min-w-0 flex-1 truncate text-sm">
													{config?.bot
														? $t('match.botName', { level: $t(`match.bot.${config.bot}`) })
														: (config?.opponent ?? $t('match.opponent'))}
												</span>
												<span
													class="shrink-0 text-xs font-semibold {state.winner === 'us'
														? 'text-win'
														: 'text-muted'}"
												>
													{state.label}
												</span>
											</a>
										</li>
									{/each}
								</ol>
							</section>
						{/if}

							<div class="mb-2 flex items-center justify-between">
								<h2 class="text-sm font-semibold">{$t('session.activities')}</h2>
								<button
									class="press flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink"
									onclick={openPicker}
								>
									<Icon name="plus" size={16} />
									{$t('common.add')}
								</button>
							</div>

							{#if listedActivities.length === 0}
								<EmptyState
									title={$t('empty.activities.title')}
									body={$t('empty.activities.body')}
									action={{ label: $t('common.add'), onclick: openPicker }}
								>
									{#snippet sample()}
										<!-- What a scored round looks like once it is in the list. -->
										<div class="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
											<div>
												<p class="font-medium">WA 720 (70m)</p>
												<p class="text-xs text-muted">72 {$t('score.arrow')}</p>
											</div>
											<span class="tabular text-xl font-bold">648</span>
										</div>
									{/snippet}
								</EmptyState>
							{:else}
								<ul class="space-y-2">
									{#each listedActivities as a (a.id)}
										{@const round = a.kind === 'scoring' ? roundOf(a) : null}
										{@const diagram = a.kind === 'tuning' && a.templateKey ? diagramOf(a.templateKey) : null}
										{@const format = a.kind === 'match' ? matchOf(a)?.format : null}
										<li>
											<!-- Selection is drawn inside the row: the tab deck clips, and a ring outside the
												row's own edge is the part of it the clip takes. -->
											<a
												href="/activities/{a.id}"
												use:longpress={() => holdActivity(a.id)}
												onclick={(event) => {
													if (!selecting) return;
													event.preventDefault();
													toggleActivity(a.id);
												}}
												class="press flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3
													{isSelected(a.id) ? 'inset-ring-2 inset-ring-brand' : ''}"
											>
												{#if selecting}
													<span
														class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border
															{isSelected(a.id) ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
													>
														{#if isSelected(a.id)}<Icon name="check" size={13} />{/if}
													</span>
												{/if}
												<!-- The picture the row was started from, so what was done is recognised rather than read.
												Dropped where the screen cannot spare the width. -->
												<span class="hidden shrink-0 min-[301px]:flex">
													{#if round}
														<span class="h-9 w-9">
															<TargetFace scoreSet={getScoreSet(round.scoreSetId)} />
														</span>
													{:else if a.kind === 'tuning'}
														<span
															class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border"
															style="background: color-mix(in srgb, var(--color-ink) 82%, var(--color-brand));
																border-color: color-mix(in srgb, var(--color-ink) 45%, var(--color-line))"
														>
															{#if diagram}
																<TuningDiagram name={diagram} tone="inverted" />
															{:else}
																<span class="text-bg"><Icon name="wrench" size={18} /></span>
															{/if}
														</span>
													{:else if format}
														<MatchGlyph {format} size={22} />
													{:else if a.kind === FREE_SCORE_KIND}
														<!-- The face it was shot on, with no rings drawn: there are no arrows to place. -->
														<span
															class="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-sunk text-muted"
														>
															<Icon name="target" size={18} />
														</span>
													{:else if a.kind === DRILL_KIND}
														<span
															class="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-sunk text-muted"
														>
															<Icon
																name={drillDefinition(parseDrill(a.measurements).game).icon}
																size={18}
															/>
														</span>
													{:else if a.kind === STRENGTH_KIND || a.kind === RUNNING_KIND}
														<span
															class="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-sunk text-muted"
														>
															<Icon name={a.kind === STRENGTH_KIND ? 'exercise' : 'run'} size={18} />
														</span>
													{/if}
												</span>
												<div class="min-w-0 flex-1">
													<p class="font-medium">{activityTitle(a)}</p>
													<p class="text-xs text-muted">
														{a.kind === 'tuning'
															? $t('tuning.title')
															: a.kind === 'match'
																? matchSummary(a)
																: a.kind === FREE_SCORE_KIND
																	? `${freeScoreLabel(parseFreeScore(a.measurements))} · ${a.arrowsShot} ${$t('score.arrow')}`
																	: a.kind === DRILL_KIND
																		? drillSummary(a)
																		: a.kind === STRENGTH_KIND
																			? strengthSummary(a)
																			: a.kind === RUNNING_KIND
																				? runSummary(a)
																				: `${a.arrowsShot} ${$t('score.arrow')}`}
													</p>
												</div>
												{#if a.kind === 'scoring'}
													<span class="tabular text-xl font-bold">{a.totalScore}</span>
												{:else if a.kind === FREE_SCORE_KIND}
													<!-- Lighter than a round's total: it is a score, but not one that compares. -->
													<span class="tabular text-xl font-semibold text-muted">{a.totalScore}</span>
												{:else if a.kind === 'match'}
													<!-- The result rather than the score: a match is won or lost, never a number. -->
													{@const state = matchState(a)}
													<span
														class="text-sm font-semibold {state.winner === 'us'
															? 'text-win'
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
										class="press flex-1 rounded-lg border border-line py-1.5 text-xs font-medium text-muted"
										onclick={() => shiftDays(shift)}
									>
										{shift > 0 ? '+' : ''}{shift}
										{$t('session.days')}
									</button>
								{/each}
							</div>
						</section>

						<!-- Shown rather than listed: a bow is known by its shape, and the archer's own bows
							wear the shape of the type they were made as. -->
						<section class="rounded-xl border border-line bg-surface p-4">
							<span class="mb-1 block text-sm font-semibold">{$t('session.bow')}</span>

							{#if bows.length > 2}
								<!-- A rack of bows is a list, not a wall of buttons: past a couple it is picked
									from a drawer, which is the one place their names have room to be read. -->
								<span class="mb-1 block text-xs text-muted">{$t('session.myBows')}</span>
								<button
									class="press mb-3 flex w-full items-center gap-2 rounded-lg border p-2 text-left
										{chosenBow.startsWith('bow:')
										? 'border-brand bg-brand/10 text-brand-text'
										: 'border-line'}"
									onclick={() => (bowSheet = true)}
								>
									<Icon name={BOW_ICONS[(myBow?.type ?? 'recurve') as BowType] ?? 'bow'} size={22} />
									<span class="min-w-0 flex-1 truncate text-sm font-medium">
										{myBow?.name ?? $t('session.pickBow')}
									</span>
									<Icon name="chevronUp" size={16} />
								</button>
							{:else if bows.length > 0}
								<span class="mb-1 block text-xs text-muted">{$t('session.myBows')}</span>
								<div class="mb-3 grid grid-cols-2 gap-2">
									{#each bows as b (b.id)}
										<button
											class="press flex items-center gap-2 rounded-lg border p-2 text-left
												{chosenBow === `bow:${b.id}`
												? 'border-brand bg-brand/10 text-brand-text'
												: 'border-line'}"
											aria-pressed={chosenBow === `bow:${b.id}`}
											onclick={() => setBow(`bow:${b.id}`)}
										>
											<Icon name={BOW_ICONS[b.type as BowType] ?? 'bow'} size={22} />
											<span class="min-w-0 truncate text-sm font-medium">{b.name}</span>
										</button>
									{/each}
								</div>
							{/if}

							<span class="mb-1 block text-xs text-muted">{$t('session.genericBow')}</span>
							<div class="grid grid-cols-4 gap-2">
								{#each BOW_TYPES as type (type)}
									<button
										class="press flex flex-col items-center gap-1 rounded-lg border p-1.5
											{chosenBow === type ? 'border-brand bg-brand/10 text-brand-text' : 'border-line text-muted'}"
										aria-pressed={chosenBow === type}
										onclick={() => setBow(type)}
									>
										<Icon name={BOW_ICONS[type]} size={28} />
										<span class="block w-full truncate text-[10px] text-muted">{$t(`bow.${type}`)}</span>
									</button>
								{/each}
							</div>

							<button
								class="press mt-2 w-full rounded-lg border py-1.5 text-xs font-medium
									{chosenBow === '' ? 'border-brand bg-brand/10 text-brand-text' : 'border-line text-muted'}"
								aria-pressed={chosenBow === ''}
								onclick={() => setBow('')}
							>
								{$t('session.noBow')}
							</button>
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
								<div class="flex items-center gap-4 border-b border-line p-4">
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
										{#if weatherReading}
											<p class="tabular text-sm text-muted">{weatherReading}</p>
										{:else if !weather}
											<p class="text-sm text-muted">{$t('session.weatherNone')}</p>
										{/if}
									</div>
								</div>
							{:else if !weather}
								<p class="border-b border-line p-4 text-sm text-muted">{$t('session.noConditions')}</p>
							{/if}

							<!-- Always offered, position or none: the sky is remembered, not measured. -->
							<div class="p-4">
								<span class="mb-1 block text-xs text-muted">{$t('session.sky')}</span>
								<div class="grid grid-cols-4 gap-2">
									{#each [null, ...WEATHER_ICONS] as icon (icon ?? 'none')}
										{@const chosen = (weather ? weatherIcon(weather.code) : null) === icon}
										<button
											class="press flex flex-col items-center gap-1 rounded-lg border p-1.5
												{chosen ? 'border-brand bg-brand/10 text-brand-text' : 'border-line text-muted'}"
											aria-pressed={chosen}
											onclick={() => setSky(icon)}
										>
											<Icon name={icon ?? 'unknown'} size={26} />
											<span class="block w-full truncate text-[10px] text-muted">
												{$t(icon ? `weather.${icon}` : 'weather.unspecified')}
											</span>
										</button>
									{/each}
								</div>
							</div>

							{#if notice}
								<p class="border-t border-line px-4 py-2 text-sm text-danger">
			{notice}
			{#if noticeSetting}
				<!-- Straight to the switch it is about, which the settings page rings for a moment. -->
				<a class="font-semibold underline" href="/settings?setting={noticeSetting}">
					{$t('session.openSettings')}
				</a>
			{/if}
		</p>
							{/if}
						</section>

						<button
							class="flex items-center gap-1.5 text-sm text-danger"
							onclick={remove}
						>
							<Icon name="trash" size={16} />
							{$t('session.delete')}
						</button>
					{/if}
				{/if}
			{/snippet}
		</TabDeck>

		{#if selecting && tab === 'overview'}
			<SelectionBar
				count={selected.length}
				total={listedActivities.length}
				onall={() =>
					(selected =
						selected.length >= listedActivities.length ? [] : listedActivities.map((a) => a.id))}
				onclear={endSelection}
				actions={[
					{
						label: $t('select.removeAll'),
						icon: 'trash',
						danger: true,
						onselect: () => (confirmingRemove = true)
					}
				]}
			/>
		{/if}
	</div>

	{#if confirmingRemove}
		<ConfirmDialog
			title={$t('select.removeTitle')}
			message={$t('select.removeBody', { n: selected.length })}
			onconfirm={removeSelected}
			oncancel={() => (confirmingRemove = false)}
		/>
	{/if}

	{#if adding}
		<div class="fixed inset-0 z-50 flex flex-col bg-bg" use:ownsStatusBar use:lockScroll>
			<header
				class="safe-top flex items-center justify-between border-b border-line px-4 py-3 pt-6"
			>
				<h2 class="text-lg font-bold">{$t('session.addActivity')}</h2>
				<button class="text-muted" aria-label={$t('common.close')} onclick={() => (adding = false)}>
					<Icon name="close" size={22} />
				</button>
			</header>

			<!-- Above the list rather than scrolling with it: the catalogue is reached through it. -->
			<div class="mx-auto w-full max-w-page px-4 pt-3">
				<div class="relative">
					<span class="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted">
						<Icon name="search" size={16} />
					</span>
					<input
						class="w-full rounded-full border border-line bg-surface py-1.5 pr-8 pl-8 text-sm text-ink outline-none placeholder:text-muted"
						type="text"
						placeholder={$t('session.searchActivity')}
						aria-label={$t('session.searchActivity')}
						bind:value={query}
					/>
					{#if searching}
						<button
							class="absolute top-1/2 right-2 -translate-y-1/2 text-muted"
							aria-label={$t('common.close')}
							onclick={() => (query = '')}
						>
							<Icon name="close" size={14} />
						</button>
					{/if}
				</div>
			</div>

			<div class="mx-auto w-full max-w-page flex-1 space-y-6 overflow-y-auto p-4">
				{#if nothingFound}
					<p class="py-8 text-center text-sm text-muted">{$t('sessions.noMatch')}</p>
				{/if}
				<!-- Most archers shoot two or three rounds, so the ones already shot come first. -->
				{#if foundRecent.length > 0}
					<section>
						<h3 class="mb-2 text-sm font-semibold text-muted">{$t('session.recentGroup')}</h3>
						<div class="grid gap-2 sm:grid-cols-2">
							{#each foundRecent as round (round.id)}
								{@render roundCard(round, true)}
							{/each}
						</div>
					</section>
				{/if}

				<section class:hidden={disciplines.length === 0 && foundMatchFormats.length === 0 && !foundCustom}>
					<h3 class="mb-2 text-sm font-semibold text-muted">{$t('session.scoringGroup')}</h3>
					<!-- The custom round leads: it is the one entry that is not a name to recognise. -->
					{#if foundCustom}
						<a
							href="/sessions/{sessionId}/custom"
							class="press mb-2 flex items-center gap-3 rounded-xl border border-dashed border-brand/60 bg-brand/5 p-3"
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
					{/if}

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

							<!-- Right after target: a match is shot on a target face, so it belongs beside them. -->
							{#if discipline === 'target'}{@render matchGroup()}{/if}
						{/each}
						<!-- A search that narrows the rounds away must not take the matches with them. -->
						{#if !disciplines.includes('target')}{@render matchGroup()}{/if}
					</div>
				</section>

				<section class:hidden={foundTemplates.length === 0 && searching}>
					<h3 class="mb-2 text-sm font-semibold text-muted">{$t('tuning.title')}</h3>
					{#if !selectedBowType}
						<!-- Nothing here can be offered without knowing the bow, so the note carries the way
							to say which one: the form when there is no bow at all, the tab when there is. -->
						<div class="rounded-xl border border-dashed border-line p-4">
							<p class="text-sm text-muted">{$t('tuning.noBowSelected')}</p>
							<button
								class="mt-3 flex items-center gap-1.5 text-sm font-semibold text-brand-text"
								onclick={chooseBow}
							>
								<Icon name="plus" size={16} />
								{bows.length === 0 ? $t('equipment.addBow') : $t('session.pickBow')}
							</button>
						</div>
					{:else}
						<div class="grid gap-2 sm:grid-cols-2">
							{#each foundTemplates as template (template.key)}
								{@const diagram = diagramOf(template.key)}
								<button
									class="press flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left"
									onclick={() => startTuning(template.key)}
								>
									<!--
										The same drawing the guide uses, worn as a badge: at this size the ink lines
										disappear into the card, so the drawing gets a ground of its own to sit on and
										goes pale over it, the way the match glyphs carry their tint.
									-->
									<span
										class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
										style="background: color-mix(in srgb, var(--color-ink) 82%, var(--color-brand));
											border-color: color-mix(in srgb, var(--color-ink) 45%, var(--color-line))"
									>
										{#if diagram}
											<TuningDiagram name={diagram} tone="inverted" />
										{:else}
											<span class="text-bg"><Icon name="wrench" size={20} /></span>
										{/if}
									</span>
									<span class="min-w-0 flex-1 font-medium">{$t(`tuning.template.${template.key}`)}</span>
								</button>
							{/each}
						</div>
					{/if}
				</section>
				<!-- Last, and on its own: it is the entry for shooting that fits none of the shapes
					above, so offering it beside them would only make them harder to read. -->
				<section class:hidden={!foundFree}>
					<h3 class="mb-2 text-sm font-semibold text-muted">{$t('freeScore.group')}</h3>
					<a
						href="/sessions/{sessionId}/free"
						class="press flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
					>
						<span
							class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sunk text-muted"
						>
							<Icon name="target" size={20} />
						</span>
						<span class="min-w-0">
							<span class="block font-medium">{$t('freeScore.title')}</span>
							<span class="mt-0.5 block text-xs text-muted">{$t('freeScore.hint')}</span>
						</span>
					</a>
				</section>

				<!-- Shooting to a rule rather than to a round: arrows and no score to compare, see
					src/lib/domain/drills/types.ts. Between the scoring shapes and the training that
					shoots nothing, which is exactly where a drill sits. -->
				<section class:hidden={foundDrills.length === 0}>
					<h3 class="mb-2 text-sm font-semibold text-muted">{$t('drill.group')}</h3>
					<div class="grid gap-2 sm:grid-cols-2">
						{#each foundDrills as game (game)}
							<button
								class="press flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left"
								onclick={() => openDrill(game)}
							>
								<span
									class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sunk text-muted"
								>
									<Icon name={drillDefinition(game).icon} size={20} />
								</span>
								<span class="min-w-0">
									<span class="block font-medium">{$t(`drill.game.${game}.name`)}</span>
									<span class="mt-0.5 block text-xs text-muted">{$t(`drill.game.${game}.hint`)}</span>
								</span>
							</button>
						{/each}
					</div>
				</section>

				<!-- Training, which is work done for the shooting rather than shooting: no arrows, no score. -->
				<section class:hidden={!foundTraining}>
					<h3 class="mb-2 text-sm font-semibold text-muted">{$t('training.group')}</h3>
					<div class="grid gap-2">
						{#each [{ kind: STRENGTH_KIND, icon: 'exercise', title: $t('strength.title'), hint: $t('strength.hint'), start: startStrength }, { kind: RUNNING_KIND, icon: 'run', title: $t('running.title'), hint: $t('running.hint'), start: startRunning }] as entry (entry.kind)}
							<button
								class="press flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left"
								onclick={entry.start}
							>
								<span
									class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sunk text-muted"
								>
									<Icon name={entry.icon as IconName} size={20} />
								</span>
								<span class="min-w-0">
									<span class="block font-medium">{entry.title}</span>
									<span class="mt-0.5 block text-xs text-muted">{entry.hint}</span>
								</span>
							</button>
						{/each}
					</div>
				</section>
			</div>
		</div>
	{/if}
{:else}
	<PageSkeleton stats cards={3} />
{/if}

<Sheet open={bowSheet} title={$t('session.myBows')} onclose={() => (bowSheet = false)}>
	<ul class="space-y-1">
		{#each bows as b (b.id)}
			<li>
				<button
					class="press flex w-full items-center gap-3 rounded-lg border p-3 text-left
						{chosenBow === `bow:${b.id}` ? 'border-brand bg-brand/10 text-brand-text' : 'border-line'}"
					aria-pressed={chosenBow === `bow:${b.id}`}
					onclick={() => {
						setBow(`bow:${b.id}`);
						bowSheet = false;
					}}
				>
					<Icon name={BOW_ICONS[b.type as BowType] ?? 'bow'} size={24} />
					<span class="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
					<span class="shrink-0 text-xs text-muted">{$t(`bow.${b.type}`)}</span>
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

{#if draftMatch}
	<!-- Set up before it is opened: who it is against and under which rules is what a match is. -->
	<Sheet
		open={true}
		title={$t(`match.format.${draftMatch.format}`)}
		onclose={() => (draftMatch = null)}
	>
		<div class="space-y-3">
			<!-- Sets unless asked otherwise: recurve shoots sets, and compound adds its arrows up. -->
			<div class="flex items-center justify-between gap-3">
				<p class="text-sm font-medium">{$t('match.winCondition')}</p>
				<div class="flex shrink-0 gap-1 rounded-lg bg-sunk p-0.5">
					{#each ['set', 'cumulative'] as const as system (system)}
						<button
							class="press rounded-md px-3 py-1.5 text-sm font-medium
								{draftMatch.system === system ? 'bg-brand text-brand-ink shadow-sm' : 'text-muted'}"
							onclick={() => draftMatch && (draftMatch = { ...draftMatch, system })}
						>
							{$t(`match.system.${system}`)}
						</button>
					{/each}
				</div>
			</div>

			<!-- Nobody on the next target: the app takes the other end of the line instead. -->
			<div class="flex items-center justify-between gap-3">
				<p class="text-sm font-medium">{$t('match.botTitle')}</p>
				<Toggle
					checked={draftMatch.bot !== null}
					label={$t('match.botTitle')}
					onchange={(v) =>
						draftMatch && (draftMatch = { ...draftMatch, bot: v ? 'amateur' : null })}
				/>
			</div>

			{#if draftMatch.bot}
				<div class="flex gap-2">
					{#each BOT_LEVELS as level (level)}
						<button
							class="press flex-1 rounded-lg border py-2 text-xs font-medium
								{draftMatch.bot === level ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
							onclick={() => draftMatch && (draftMatch = { ...draftMatch, bot: level })}
						>
							{$t(`match.bot.${level}`)}
						</button>
					{/each}
				</div>
			{/if}

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

			<!-- The face the plotted arrows land on: a match carries no round to read it from. Shown
				rather than named, because a face is recognised long before its name is read. -->
			<div class="border-t border-line pt-3">
				<span class="text-xs text-muted">{$t('match.face')}</span>
				<div class="mt-1 grid grid-cols-4 gap-2">
					{#each MATCH_FACES as set (set.id)}
						<button
							class="press rounded-lg border p-1.5
								{draftMatch.scoreSetId === set.id ? 'border-brand bg-brand/10' : 'border-line'}"
							aria-pressed={draftMatch.scoreSetId === set.id}
							onclick={() => draftMatch && (draftMatch = { ...draftMatch, scoreSetId: set.id })}
						>
							<span class="block aspect-square w-full">
								<TargetFace scoreSet={set} />
							</span>
							<span class="mt-1 block truncate text-[10px] text-muted">{set.name}</span>
						</button>
					{/each}
				</div>

				<span class="mt-2 block text-xs text-muted">{$t('match.faceSize')}</span>
				<div class="mt-1 flex gap-2">
					{#each FACE_SIZES as size (size)}
						<button
							class="press tabular flex-1 rounded-lg border py-2 text-sm font-medium
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
								class="press rounded-md px-3 py-1 text-xs font-medium
									{(draftMatch.distance?.unit ?? 'm') === unit
									? 'bg-surface text-ink shadow-sm'
									: 'text-muted'}"
								onclick={() => {
									if (!draftMatch) return;
									const list = unit === 'm' ? DISTANCES_M : DISTANCES_YD;
									const value = draftMatch.distance?.value ?? $matchDistance;
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
					value={draftMatch.distance?.value ?? $matchDistance}
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
					<!-- Where it sits in the ladder, which most matches have no answer to. -->
					<div class="flex items-center justify-between gap-3">
						<p class="text-sm font-medium">{$t('match.stageLabel')}</p>
						<select
							class="shrink-0 rounded-lg border border-line bg-bg p-2 text-sm text-ink"
							value={draftMatch.stage}
							onchange={(e) =>
								draftMatch &&
								(draftMatch = { ...draftMatch, stage: e.currentTarget.value as MatchStage })}
						>
							{#each MATCH_STAGES as stage (stage)}
								<option value={stage}>{$t(`match.stage.${stage}`)}</option>
							{/each}
						</select>
					</div>

					<div class="flex gap-2">
						<NamePicker
							value={draftMatch.ourName}
							known={knownNames.everyone}
							placeholder={$t('match.ourSide')}
							onchange={(name) => draftMatch && (draftMatch = { ...draftMatch, ourName: name })}
						/>
						<NamePicker
							value={draftMatch.opponent}
							known={knownNames.everyone}
							placeholder={$t('match.opponent')}
							onchange={(name) => draftMatch && (draftMatch = { ...draftMatch, opponent: name })}
						/>
					</div>

					{#if draftMatch.format !== 'individual'}
						<!-- Optional throughout: a team match is scored the same whether or not anybody is named. -->
						<div>
							<p class="mb-1 text-xs font-semibold text-muted">{$t('match.teammates')}</p>
							<div class="space-y-1">
								{#each [...draftMatch.teammates, ''] as name, i (i)}
									<div class="flex">
										<NamePicker
											value={name || null}
											known={knownNames.everyone}
											placeholder={$t('match.teammate', { n: i + 1 })}
											onchange={(typed) => {
												if (!draftMatch) return;
												const next = [...draftMatch.teammates];
												if (typed) next[i] = typed;
												else next.splice(i, 1);
												draftMatch = { ...draftMatch, teammates: next.filter(Boolean) };
											}}
										/>
									</div>
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
				class="press flex-1 rounded-lg border border-line py-2 text-sm font-medium"
				onclick={() => (draftMatch = null)}
			>
				{$t('common.cancel')}
			</button>
			<button
				class="press flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink"
				onclick={startMatch}
			>
				{$t('match.start')}
			</button>
		{/snippet}
	</Sheet>
{/if}

{#if editingGoal}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" use:lockScroll>
		<button
			class="absolute inset-0 bg-black/40"
			use:scrim={0.4}
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
						class="press tabular rounded-lg border px-3 py-1.5 text-sm font-medium
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
						class="press flex-1 rounded-lg border border-line py-2.5 text-sm font-medium text-danger"
						onclick={() => saveGoal(null)}
					>
						{$t('session.removeGoal')}
					</button>
				{/if}
				<button
					class="press flex-1 rounded-lg bg-brand py-2.5 font-semibold text-brand-ink"
					onclick={() => saveGoal(Number(goalDraft) > 0 ? Number(goalDraft) : null)}
				>
					{$t('common.save')}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if countDialog}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" use:lockScroll>
		<button
			class="absolute inset-0 bg-black/40"
			use:scrim={0.4}
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
				step="1"
				class="tabular w-full rounded-lg border border-line bg-bg p-3 text-2xl font-bold text-ink"
				aria-label={$t('session.trainingArrows')}
				bind:value={countDraft}
				use:focusNow
			/>
			<div class="mt-4 flex gap-2">
				<button
					class="press flex-1 rounded-lg border border-line py-2.5 text-sm font-medium"
					onclick={() => (countDialog = null)}
				>
					{$t('common.cancel')}
				</button>
				<button
					class="press flex-1 rounded-lg bg-brand py-2.5 font-semibold text-brand-ink"
					onclick={applyCount}
				>
					{countDialog === 'set' ? $t('common.save') : $t('common.add')}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if celebrations.length > 0}
	<Fireworks awards={celebrations} onclose={() => (celebrations = [])} />
{/if}
