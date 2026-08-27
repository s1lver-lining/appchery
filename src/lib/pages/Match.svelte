<script lang="ts">
	import { t } from '$lib/i18n';
	import { getScoreSet } from '$lib/domain/rounds/seed';
	import { scoreAt, sortShotsDescending } from '$lib/domain/rounds/geometry';
	import { botEnd, BOT_LEVELS } from '$lib/domain/bots';
	import { sortArrowsDescending, showArrowNumbers, dateFormats } from '$lib/prefs';
	import { formatDistance } from '$lib/domain/units';
	import { scoreByArrowNumber } from '$lib/domain/stats';
	import {
		tally,
		nextEndNo,
		shootOffWinner,
		shootOffArrows,
		MATCH_STAGES,
		type MatchConfig,
		type MatchStage,
		type MatchEnd,
		type Side
	} from '$lib/domain/matches';
	import type { Shot, Zone } from '$lib/domain/rounds/types';
	import {
		loadMatch,
		saveMatchEnd,
		setMatchArrows,
		setMatchEndTotal,
		deleteMatchEnd,
		updateMatchConfig,
		listMatchNames,
		getSession,
		deleteActivity,
		restoreActivity,
		awardBadges,
		shotFromZone,
		shotFromPlot,
		type ActivityRow
	} from '$lib/db/repository';
	import { goto } from '$app/navigation';
	import { withOrigin } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import { levelUpAward } from '$lib/levelUp';
	import type { Award } from '$lib/ui/Fireworks.svelte';
	import ArrowPad from '$lib/ui/ArrowPad.svelte';
	import AutoScore from '$lib/ui/AutoScore.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Toggle from '$lib/ui/Toggle.svelte';
	import Scorecard from '$lib/ui/Scorecard.svelte';
	import ArrowNumberChart from '$lib/ui/ArrowNumberChart.svelte';
	import type { CardData, WeatherGlyph } from '$lib/ui/scorecard';
	import { formatTemperature, formatWind, weatherIcon } from '$lib/conditions';
	import NamePicker from '$lib/ui/NamePicker.svelte';
	import { closeOnBack } from '$lib/ui/dismiss.svelte';
	import { offerUndo } from '$lib/ui/undo.svelte';

	/**
	 * The card of a head to head match, read the way a scoresheet is: our arrows on the left of the
	 * line, theirs on the right, an end to a row. Totals can be typed straight in, because a match is
	 * shot on the clock and the arrows are often somebody else's to call out.
	 */
	let {
		activity,
		onchange,
		oncelebrate
	}: {
		activity: ActivityRow;
		onchange: () => void;
		/** Handed up rather than shown here: the page around this one owns the fireworks. */
		oncelebrate?: (awards: Award[]) => void;
	} = $props();

	type Row = Awaited<ReturnType<typeof loadMatch>>['ends'][number];

	let config = $state<MatchConfig | null>(null);
	let rows = $state<Row[]>([]);
	let editingSetup = $state(false);
	/** Names used on other cards, so the same opponent is spelled the same way every time. */
	let knownNames = $state<Awaited<ReturnType<typeof listMatchNames>>>({
		opponents: [],
		ours: [],
		teammates: [],
		everyone: []
	});
	$effect(() => {
		if (editingSetup) listMatchNames().then((names) => (knownNames = names));
	});

	let loaded = false;
	async function refresh() {
		const match = await loadMatch(activity.id);
		config = match.config;
		rows = match.ends;
		// Only once nothing is still being written: an arrow tapped in meanwhile is not in these rows.
		if (writing === 0) optimistic = null;
		// A match opened after it was won is not a match that has just been won: badges stay quiet.
		if (!loaded && match.config) {
			loaded = true;
			wasDecided = tally(
				match.config,
				match.ends.map((end) => ({
					endNo: end.endNo,
					ours: end.ours,
					theirs: end.theirs,
					shootOff: end.shootOff,
					winner: end.winner
				}))
			).decided;
		}
		onchange();
	}
	/**
	 * Loaded once per card. Guarded on the id rather than on the prop: every write tells the page to
	 * reload, which hands back a new activity object, and reloading on that looped the two of them
	 * against each other for as long as the card was open.
	 */
	let loadedId = '';
	$effect(() => {
		const id = activity.id;
		if (id === loadedId) return;
		loadedId = id;
		refresh();
	});

	const plain = $derived<MatchEnd[]>(
		rows.map((row) => ({
			endNo: row.endNo,
			ours: row.ours,
			theirs: row.theirs,
			shootOff: row.shootOff,
			winner: row.winner
		}))
	);
	const result = $derived(config ? tally(config, plain) : null);
	const asking = $derived(config ? nextEndNo(config, plain) : null);
	const scoreSet = $derived(config ? getScoreSet(config.scoreSetId) : null);

	const ourLabel = $derived(config?.ourName || $t('match.ourSide'));
	/** A bot says which bot it is: beating a professional is not beating a beginner. */
	const theirLabel = $derived(
		config?.bot
			? $t('match.botName', { level: $t(`match.bot.${config.bot}`) })
			: config?.opponent || $t('match.opponent')
	);

	/** What the match is at a glance, which is the only thing a match really records. */
	const outcome = $derived(() => {
		if (!result) return $t('match.inProgress');
		if (result.winner === 'us') return $t('match.won');
		if (result.winner === 'them') return $t('match.lost');
		if (result.needsShootOff) return $t('match.undecided');
		return result.drawn ? $t('match.drawn') : $t('match.inProgress');
	});

	/**
	 * The rows the sheet draws: every end shot, the one being asked for, and the shoot-off once the
	 * regulation ends have failed to separate the two sides.
	 */
	const sheet = $derived(() => {
		if (!config) return [];
		const drawn: { endNo: number; shootOff: boolean; row: Row | undefined }[] = rows.map((row) => ({
			endNo: row.endNo,
			shootOff: row.shootOff,
			row
		}));
		if (asking !== null && !drawn.some((entry) => entry.endNo === asking))
			drawn.push({ endNo: asking, shootOff: false, row: undefined });
		if (result?.needsShootOff && !drawn.some((entry) => entry.shootOff))
			drawn.push({ endNo: config.maxEnds + 1, shootOff: true, row: undefined });
		return drawn.sort((a, b) => a.endNo - b.endNo);
	});

	type Arrow = {
		ordinal: number;
		value: number;
		zoneLabel: string;
		x: number | null;
		y: number | null;
		source: Shot['source'];
	};

	/**
	 * The side just entered, held until its write comes back. Writing a side replaces all of its
	 * arrows, so the sheet read between the delete and the insert showed an end with nothing in it.
	 */
	let optimistic = $state<{ endNo: number; side: Side; shots: Omit<Shot, 'ordinal'>[] } | null>(
		null
	);
	/** Writes still in flight, counted because a fast archer starts the next one before this lands. */
	let writing = 0;

	/** Stored in the order they were called, and sorted only if the archer asked for that. */
	const arrowsOf = $derived((endNo: number, side: Side): Arrow[] => {
		if (optimistic && optimistic.endNo === endNo && optimistic.side === side)
			return optimistic.shots.map((shot, index) => ({ ...shot, ordinal: index + 1 }));
		return (rows.find((row) => row.endNo === endNo)?.shots ?? [])
			.filter((shot) => shot.side === side)
			.sort((a, b) => a.ordinal - b.ordinal)
			.map((shot) => ({
				ordinal: shot.ordinal,
				value: shot.value,
				zoneLabel: shot.zoneLabel,
				x: shot.x,
				y: shot.y,
				source: shot.source as Shot['source']
			}));
	});

	const shownArrows = $derived((endNo: number, side: Side) => {
		const shots = arrowsOf(endNo, side);
		return $sortArrowsDescending ? sortShotsDescending(shots) : shots;
	});
	/** Read from the stored order, which is what the numbers on the sheet mean. */
	const arrowNumbers = $derived(
		scoreByArrowNumber(
			rows.flatMap((row) =>
				row.shots
					.filter((shot) => shot.side === 'us' && !row.shootOff)
					.map((shot) => ({ ordinal: shot.ordinal, value: shot.value }))
			)
		)
	);

	const slotsFor = (shootOff: boolean) =>
		!config ? (shootOff ? 1 : 3) : shootOff ? shootOffArrows(config) : config.arrowsPerEnd;

	/**
	 * How wide the block of arrows is drawn. Ends split the way they are shot: six as two threes,
	 * four as two twos. A last line holding one arrow is a line that reads as a mistake.
	 */
	function columnsFor(slots: number): number {
		if (slots <= 3) return slots;
		if (slots % 3 === 0) return 3;
		return slots % 2 === 0 ? 2 : 3;
	}

	const points = $derived((endNo: number, side: Side) => {
		const entry = result?.ends.find((row) => row.end.endNo === endNo);
		if (!entry || config?.system !== 'set' || entry.end.shootOff) return null;
		return side === 'us' ? entry.ourPoints : entry.theirPoints;
	});

	/* Entering arrows. One slot at a time, our side first, then theirs, then the pad steps back. */
	let cursor = $state<{ endNo: number; side: Side; index: number; shootOff: boolean } | null>(null);
	let mode = $state<'number' | 'face'>('number');

	const cursorShots = $derived(cursor ? arrowsOf(cursor.endNo, cursor.side) : []);
	/** The same side's arrows from every other end, which is what the group is read against. */
	const otherShots = $derived(
		cursor
			? rows
					.filter((row) => row.endNo !== cursor?.endNo)
					.flatMap((row) => arrowsOf(row.endNo, cursor!.side))
			: []
	);
	/** The arrow the cursor sits on, when there is one: the next touch moves it rather than adding. */
	const held = $derived(() => {
		const shot = cursor ? cursorShots[cursor.index] : undefined;
		return shot && shot.x !== null && shot.y !== null ? { x: shot.x, y: shot.y } : null;
	});

	const asFaceShots = (list: typeof cursorShots) =>
		list.map((shot) => ({
			ordinal: shot.ordinal,
			value: shot.value,
			zoneLabel: shot.zoneLabel,
			x: shot.x,
			y: shot.y,
			source: shot.source as Shot['source']
		}));

	function focus(endNo: number, side: Side, index: number, shootOff: boolean) {
		cursor =
			cursor?.endNo === endNo && cursor.side === side && cursor.index === index
				? null
				: { endNo, side, index, shootOff };
	}

	/** The next empty slot: down our side, across to theirs, then done. A bot fills its own side. */
	function advance() {
		if (!cursor) return;
		const slots = slotsFor(cursor.shootOff);
		if (cursor.index + 1 < slots) {
			cursor = { ...cursor, index: cursor.index + 1 };
			return;
		}
		if (cursor.side === 'them' || config?.bot) cursor = null;
		else cursor = { ...cursor, side: 'them', index: 0 };
	}

	async function write(shot: Omit<Shot, 'ordinal'>) {
		if (!cursor) return;
		const { endNo, side, index, shootOff } = cursor;
		const kept: Omit<Shot, 'ordinal'>[] = arrowsOf(endNo, side).map((row) => ({
			value: row.value,
			zoneLabel: row.zoneLabel,
			x: row.x,
			y: row.y,
			source: row.source
		}));
		// Slots are filled by position, so an arrow tapped into the third one lands third.
		while (kept.length < index)
			kept.push({ value: 0, zoneLabel: 'M', x: null, y: null, source: 'manual' });
		kept[index] = shot;

		// Shown before it is written: the arrow has to land in the slot the cursor is leaving.
		optimistic = { endNo, side, shots: kept };
		advance();
		writing += 1;
		try {
			await setMatchArrows(activity.id, endNo, side, kept, shootOff);
		} finally {
			writing -= 1;
		}
		await refresh();
		if (side === 'us') await botReplies(endNo, shootOff);
		if (shootOff) await decideFromPlot();
		await celebrate();
	}

	/**
	 * The bot shoots the moment our end is complete, the way an opponent on the next target would:
	 * its arrows land on the face and are scored by the same zone map ours are, so its total is
	 * something it shot rather than a number that was chosen.
	 */
	async function botReplies(endNo: number, shootOff: boolean, ourEndIsIn = false) {
		if (!config?.bot || !scoreSet) return;
		const slots = slotsFor(shootOff);
		const row = rows.find((entry) => entry.endNo === endNo);
		// Our end has to be finished first: a bot answers an end, it does not shoot into an empty one.
		if (!ourEndIsIn && arrowsOf(endNo, 'us').length < slots) return;
		if (arrowsOf(endNo, 'them').length > 0 || row?.theirs !== null) return;

		const shots = botEnd(config.bot, slots).map((shot) =>
			shotFromPlot(scoreAt(scoreSet, shot.x, shot.y), shot.x, shot.y)
		);
		// Straight to the other side of the sheet: the cursor stays where the archer left it.
		await setMatchArrows(activity.id, endNo, 'them', shots, shootOff);
		await refresh();
	}

	const pick = (zone: Zone) => write(shotFromZone(zone));
	const plot = (x: number, y: number) => {
		if (!scoreSet) return;
		write(shotFromPlot(scoreAt(scoreSet, x, y), x, y));
	};

	/**
	 * A whole end read off the boss at once. The detected arrows fill the side being entered from the
	 * slot the cursor is on, which is how an end half typed in can still be finished by the camera.
	 */
	let scanning = $state(false);

	async function acceptDetected(points: { x: number; y: number }[]) {
		scanning = false;
		if (!cursor || !scoreSet) return;
		const { endNo, side, index, shootOff } = cursor;
		const kept: Omit<Shot, 'ordinal'>[] = arrowsOf(endNo, side)
			.slice(0, index)
			.map((row) => ({
				value: row.value,
				zoneLabel: row.zoneLabel,
				x: row.x,
				y: row.y,
				source: row.source
			}));

		for (const point of points) {
			if (kept.length >= slotsFor(shootOff)) break;
			kept.push(shotFromPlot(scoreAt(scoreSet, point.x, point.y), point.x, point.y));
		}

		optimistic = { endNo, side, shots: kept };
		cursor = kept.length >= slotsFor(shootOff) ? null : { ...cursor, index: kept.length };
		writing += 1;
		try {
			await setMatchArrows(activity.id, endNo, side, kept, shootOff);
		} finally {
			writing -= 1;
		}
		await refresh();
		if (shootOff) await decideFromPlot();
		await celebrate();
	}

	/** Named after the end it belongs to, so footage and card can be paired again afterwards. */
	function videoName(): string {
		const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		return `appchery-${activity.id}-m${cursor?.endNo ?? 0}-${cursor?.side ?? 'us'}-${stamp}.webm`;
	}

	/** Typed straight in. The arrows of that side go with it: one number cannot have two sources. */
	async function typeTotal(endNo: number, side: Side, raw: string, shootOff: boolean) {
		const typed = raw.trim() === '' ? null : Number(raw);
		if (typed !== null && !Number.isFinite(typed)) return;
		// A typed total is a score: negatives are a slipped minus key, not something to record.
		const value = typed === null ? null : Math.max(0, Math.round(typed));
		cursor = null;
		await setMatchEndTotal(activity.id, endNo, side, value, shootOff);
		await refresh();
		if (side === 'us' && value !== null) await botReplies(endNo, shootOff, true);
		await celebrate();
	}

	/**
	 * What the last end of a match won: the badges it earned, and the level it took the archer to. A
	 * card kept for somebody else earns nothing, since the result is not theirs. Checked only when the
	 * match has just been decided, because awarding reads every activity ever shot, which is not
	 * something to do on the way through an end.
	 */
	let wasDecided = false;
	async function celebrate() {
		const decided = result?.decided === true;
		const settled = decided && !wasDecided;
		wasDecided = decided;
		if (!settled || !config?.forSelf) return;
		const queue: Award[] = (await awardBadges()).map((key) => ({
			title: $t('badges.new'),
			subtitle: $t(`badges.list.${key}.name`),
			href: '/badges'
		}));
		// After the badges, since the win and anything it earned are both paid before the level is read.
		const climbed = await levelUpAward($t);
		if (climbed) queue.push(climbed);
		if (queue.length > 0) oncelebrate?.(queue);
	}

	async function clearEnd(endNo: number) {
		cursor = null;
		await deleteMatchEnd(activity.id, endNo);
		await refresh();
	}

	async function callShootOff(winner: Side) {
		const shootOff = rows.find((row) => row.shootOff);
		if (!shootOff) return;
		await saveMatchEnd(activity.id, shootOff.endNo, {
			ours: shootOff.ours,
			theirs: shootOff.theirs,
			shootOff: true,
			winner
		});
		await refresh();
		await celebrate();
	}

	/** Two plotted shoot-off arrows say who was closer, so nobody has to be asked. */
	async function decideFromPlot() {
		const row = rows.find((entry) => entry.shootOff);
		if (!row) return;
		const arrows = (side: Side) => row.shots.filter((shot) => shot.side === side);
		const winner = shootOffWinner(arrows('us'), arrows('them'));
		if (!winner || row.winner === winner) return;
		await saveMatchEnd(activity.id, row.endNo, {
			ours: row.ours,
			theirs: row.theirs,
			shootOff: true,
			winner
		});
		await refresh();
	}

	/** Level on the arrow itself: the judge decides, and the card records the call. */
	const shootOffTied = $derived(() => {
		const row = rows.find((entry) => entry.shootOff);
		if (!row || row.theirs === null) return false;
		const ours = row.shots.filter((shot) => shot.side === 'us');
		const theirs = row.shots.filter((shot) => shot.side === 'them');
		if (shootOffWinner(ours, theirs)) return false;
		return row.ours === row.theirs;
	});

	/**
	 * The pad rises over the bottom of the sheet, so the end being filled has to be brought above it.
	 * The row is scrolled to where it is on screen rather than to where it sits in the list: on a
	 * short screen the end being entered is the last row, and the last row is the one under the pad.
	 */
	let scroller = $state<HTMLElement | undefined>();
	const rowNodes = new Map<number, HTMLElement>();
	function markRow(node: HTMLElement, endNo: number) {
		rowNodes.set(endNo, node);
		return { destroy: () => rowNodes.delete(endNo) };
	}

	$effect(() => {
		const endNo = cursor?.endNo;
		if (endNo === undefined || !scroller) return;
		// After the frame the pad is laid out in, or the pane is measured at its old height.
		requestAnimationFrame(() => {
			const node = rowNodes.get(endNo);
			if (!node || !scroller) return;
			const above = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
			const below = above + node.offsetHeight - scroller.clientHeight;
			if (below > 0) scroller.scrollTop += below;
			else if (above < 0) scroller.scrollTop += above;
		});
	});

	closeOnBack(
		() => cursor !== null,
		() => (cursor = null)
	);

	/**
	 * The match as a picture, built from the same card a round goes out on: the scoreline where the
	 * score would be, and the sheet underneath it with a column for each side.
	 */
	let sharing = $state(false);
	let session = $state<Awaited<ReturnType<typeof getSession>>>(null);

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
	$effect(() => {
		getSession(activity.sessionId).then((row) => (session = row));
	});

	const cardData = $derived<Omit<CardData, 'options'>>({
		roundName: `${ourLabel} · ${theirLabel}`,
		score: config
			? config.system === 'set'
				? (result?.ourPoints ?? 0)
				: (result?.ourTotal ?? 0)
			: 0,
		max: null,
		opponentScore: config
			? config.system === 'set'
				? (result?.theirPoints ?? 0)
				: (result?.theirTotal ?? 0)
			: 0,
		// The average is read off the arrows: set points divided by arrows would be a third of a point.
		arrowTotal: result?.ourTotal ?? 0,
		arrows: activity.arrowsShot,
		tens: activity.count10s,
		xs: activity.countX,
		sheet: rows.map((row) => ({
			arrows: shownArrows(row.endNo, 'us').map((shot) => shot.zoneLabel),
			opponentArrows: shownArrows(row.endNo, 'them').map((shot) => shot.zoneLabel),
			subtotal: row.ours,
			running: row.theirs
		})),
		date: $dateFormats.date(activity.startedAt),
		place: session?.location ?? null,
		bow: null,
		category: config && config.stage !== 'none' ? $t(`match.stage.${config.stage}`) : $t('match.title'),
		sessionName: session?.label ?? null,
		weather: cardWeather,
		isBest: result?.winner === 'us',
		labels: {
			points: config?.system === 'set' ? $t('match.sets') : $t('match.total'),
			arrows: $t('score.arrowsColumn'),
			tens: $t('score.tens'),
			xs: $t('score.xs'),
			average: $t('share.average'),
			end: $t('share.end'),
			// The two columns of a match sheet are the two sides of it, named as they are on the card.
			endTotal: ourLabel,
			runningTotal: theirLabel,
			personalBest: $t('match.won'),
			tagline: $t('share.tagline')
		}
	});

	async function remove() {
		await deleteActivity(activity.id);
		offerUndo({
			message: $t('undo.matchDeleted'),
			label: $t('undo.action'),
			undo: async () => {
				await restoreActivity(activity.id);
				goto(`/activities/${activity.id}`);
			}
		});
		goto(`/sessions/${activity.sessionId}`);
	}

	/** A miss has no fill of its own, so it borrows the surface instead of rendering invisible. */
	function chipStyle(label: string): string {
		const zone = scoreSet?.zones.find((z) => z.label === label);
		if (!zone || !zone.countsAsHit) return 'background-color: var(--c-sunk); color: var(--c-muted);';
		return `background-color: ${zone.color}; color: ${zone.strokeColor}; box-shadow: inset 0 0 0 1px ${zone.strokeColor}59;`;
	}

	// Outline rather than ring: the chip sets an inline box-shadow, which a ring would lose to.
	const cursorClass = 'outline outline-2 outline-brand outline-offset-2';
</script>

<!-- One side of one end: the arrows in their slots, and the total they add up to or was typed in. -->
{#snippet sideCells(endNo: number, side: Side, row: Row | undefined, shootOff: boolean, mirrored: boolean)}
	{@const shots = shownArrows(endNo, side)}
	{@const total = side === 'us' ? (row ? row.ours : null) : (row?.theirs ?? null)}
	<div class="flex min-w-0 flex-1 items-center gap-0.5 {mirrored ? 'flex-row-reverse' : ''}">
		<!--
			Three to a line whatever the format: a team's six arrows read as two ends of three, which is
			how they were shot, rather than as a four and a two that mean nothing.
		-->
		<div
			class="grid gap-0.5 {mirrored ? 'ml-auto' : 'mr-auto'}"
			style="grid-template-columns: repeat({columnsFor(slotsFor(shootOff))}, var(--chip))"
		>
			{#each Array(slotsFor(shootOff)) as _, index (index)}
				{@const shot = shots[index]}
				<!--
					A sorted sheet moves the arrows about, so a slot points at the arrow it is drawing
					rather than at its own position: tapping the highest arrow edits the highest arrow.
				-->
				{@const slot = shot ? shot.ordinal - 1 : index}
				<button
					class="press tabular relative h-[var(--chip)] w-[var(--chip)] shrink-0 rounded text-[calc(var(--chip)*0.5)] font-bold
						{shot ? '' : 'border border-dashed border-line text-muted'}
						{cursor?.endNo === endNo && cursor.side === side && cursor.index === slot
						? cursorClass
						: ''}"
					style={shot ? chipStyle(shot.zoneLabel) : ''}
					aria-label={$t('score.editArrow', { n: slot + 1, end: endNo })}
					onclick={() => focus(endNo, side, slot, shootOff)}
				>
					{shot?.zoneLabel ?? ''}
					<!-- The order it was called in, which is what tells two arrows apart once sorted. -->
					{#if shot && $showArrowNumbers}
						<span
							class="absolute right-px bottom-px text-[calc(var(--chip)*0.3)] leading-none font-semibold opacity-70"
						>
							{shot.ordinal}
						</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Typed rather than counted when there is no time to enter arrows, which is most of a match. -->
		<input
			type="number"
			inputmode="numeric"
			min="0"
			class="tabular w-8 shrink-0 rounded border border-line bg-bg px-0.5 py-1 text-center text-[13px] font-bold text-ink"
			aria-label={side === 'us' ? ourLabel : theirLabel}
			value={total ?? ''}
			onfocus={() => (cursor = null)}
			onchange={(event) => typeTotal(endNo, side, event.currentTarget.value, shootOff)}
		/>
	</div>
{/snippet}

{#if config && result && scoreSet}
	<div class="mx-auto flex w-full max-w-page flex-col">
		<div class="safe-top flex max-h-[calc(100dvh-4.6rem)] flex-col gap-3 p-4 pt-6">
			<div class="shrink-0 space-y-3">
				<!-- The header every activity wears: back, the name in the middle, its actions to the right. -->
				<header class="flex items-center gap-2">
					<a
						href="/sessions/{activity.sessionId}"
						class="shrink-0 text-muted"
						aria-label={$t('common.back')}
					>
						<Icon name="back" size={22} />
					</a>
					<h1 class="min-w-0 flex-1 truncate text-center text-base font-bold">
						{ourLabel} · {theirLabel}
					</h1>
					<!-- A match is shot on the clock, so the clock is one tap from the card. -->
					<a
						class="shrink-0 rounded-lg p-1.5 text-muted"
						href={withOrigin('/timer', `/activities/${activity.id}`)}
						aria-label={$t('timer.title')}
					>
						<Icon name="clock" size={20} />
					</a>
					<!-- The match as a picture, which is the form of it worth showing anyone else. -->
					<button
						class="shrink-0 rounded-lg p-1.5 text-muted disabled:opacity-30"
						aria-label={$t('share.title')}
						disabled={rows.length === 0}
						onclick={() => (sharing = true)}
					>
						<Icon name="share" size={20} />
					</button>
					<button
						class="shrink-0 rounded-lg p-1.5 text-muted"
						aria-label={$t('common.more')}
						onclick={() => (editingSetup = true)}
					>
						<Icon name="sliders" size={20} />
					</button>
				</header>

				<!-- What the match is, and whether it is the archer's own, on one quiet line. -->
				<p class="-mt-1 truncate text-center text-xs text-muted">
					{#if config.stage !== 'none'}{$t(`match.stage.${config.stage}`)} · {/if}
					{$t(`match.format.${config.format}`)} · {$t(`match.system.${config.system}`)}
					{#if config.distance}
						· {formatDistance(config.distance.value, config.distance.unit)}
					{/if}
					{#if !config.forSelf}
						· <span class="font-medium">{$t('match.unrecorded')}</span>
					{/if}
				</p>

				<!-- Pinned above the sheet: the running result is what an archer reads between ends. -->
				<section class="rounded-xl border border-line bg-surface px-4 py-2.5">
					<div class="flex items-center gap-3 text-center">
						<div class="min-w-0 flex-1">
							<p class="truncate text-xs text-muted">{ourLabel}</p>
							<!-- Green on whichever side took it: winning looks the same from both ends of the line. -->
							<p
								class="tabular text-3xl leading-none font-bold {result.winner === 'us'
									? 'text-win'
									: ''}"
							>
								{config.system === 'set' ? result.ourPoints : result.ourTotal}
							</p>
						</div>
						<span class="text-lg text-line">–</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-xs text-muted">{theirLabel}</p>
							<p
								class="tabular text-3xl leading-none font-bold {result.winner === 'them'
									? 'text-win'
									: ''}"
							>
								{config.system === 'set' ? result.theirPoints : result.theirTotal}
							</p>
						</div>
					</div>
				</section>

			</div>

			<!-- The sheet: our arrows to the left of the line, theirs to the right, an end to a row. -->
			<section
				class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface"
				style="--chip: clamp(1.45rem, 5.6vw, 1.75rem)"
			>
				<div class="flex items-center gap-0.5 border-b border-line px-1.5 py-1 text-[10px] text-muted">
					<span class="w-4 shrink-0"></span>
					<span class="min-w-0 flex-1 truncate">{ourLabel}</span>
					<span class="w-7 shrink-0 text-center">
						{config.system === 'set' ? $t('match.sets') : $t('match.total')}
					</span>
					<span class="min-w-0 flex-1 truncate text-right">{theirLabel}</span>
				</div>

				<div bind:this={scroller} class="min-h-0 flex-1 overflow-y-auto">
					{#each sheet() as entry (entry.endNo)}
						<div
							class="flex items-center gap-0.5 border-b border-line px-1.5 py-1.5 last:border-0"
							use:markRow={entry.endNo}
						>
							<!-- The end number opens the end itself, the way the round sheet does. -->
							<button
								class="w-4 shrink-0 text-left text-xs font-medium text-brand-text"
								aria-label={$t('score.end', { n: entry.endNo })}
								onclick={() => focus(entry.endNo, 'us', 0, entry.shootOff)}
							>
								{entry.shootOff ? '★' : entry.endNo}
							</button>

							{@render sideCells(entry.endNo, 'us', entry.row, entry.shootOff, false)}

							<span class="tabular w-7 shrink-0 text-center text-[11px] font-semibold">
								{#if points(entry.endNo, 'us') !== null}
									<span class="text-brand-text">{points(entry.endNo, 'us')}</span>
									<span class="text-line">·</span>
									<span class="text-muted">{points(entry.endNo, 'them')}</span>
								{:else}
									<span class="text-line">–</span>
								{/if}
							</span>

							{@render sideCells(entry.endNo, 'them', entry.row, entry.shootOff, true)}
						</div>
					{/each}
				</div>
			</section>

			<!-- The judge's call, which the app records rather than invents. -->
			{#if shootOffTied()}
				<section class="shrink-0 rounded-xl border border-brand/40 bg-brand/5 p-3">
					<p class="mb-2 text-sm font-semibold">{$t('match.whoWon')}</p>
					<div class="flex gap-2">
						<button
							class="press flex-1 rounded-lg border border-line bg-surface py-2 text-sm font-medium"
							onclick={() => callShootOff('us')}
						>
							{$t('match.weWon')}
						</button>
						<button
							class="press flex-1 rounded-lg border border-line bg-surface py-2 text-sm font-medium"
							onclick={() => callShootOff('them')}
						>
							{$t('match.theyWon')}
						</button>
					</div>
				</section>
			{/if}

			<!-- The pad rises from under the sheet only while a slot is waiting for an arrow. -->
			{#if cursor}
				<!-- Out to both edges, unlike everything above it: the page is inset, a sheet is not. -->
				<div class="-mx-4 -mb-4 shrink-0 pb-4">
					<ArrowPad
						flush
						{scoreSet}
						bind:mode
						onclose={() => (cursor = null)}
						shots={asFaceShots(cursorShots)}
						otherShots={asFaceShots(otherShots)}
						highlight={held()}
						onpick={pick}
						onplot={plot}
					>
						{#snippet title()}
							<span class="font-semibold text-ink">
								{cursor?.shootOff ? $t('match.shootOff') : $t('match.end', { n: cursor?.endNo ?? 1 })}
							</span>
							· {cursor?.side === 'us' ? ourLabel : theirLabel}
						{/snippet}

						<!-- The row below the keys, in equal parts: neither action leads the other. -->
						{#snippet footer()}
							<div class="flex items-stretch gap-2 border-t border-line bg-sunk/60 px-3 py-2">
								<button
									class="press flex flex-1 basis-0 items-center justify-center rounded-lg border border-line bg-surface px-3 py-2 text-sm"
									onclick={() => (cursor = null)}
								>
									{$t('common.done')}
								</button>
								<button
									class="flex flex-1 basis-0 items-center justify-center gap-1.5 rounded-lg border border-brand px-2 py-2 text-sm font-semibold whitespace-nowrap text-brand-text"
									onclick={() => (scanning = true)}
								>
									<Icon name="camera" size={18} />
									{$t('auto.open')}
								</button>
								{#if rows.some((row) => row.endNo === cursor?.endNo)}
									<button
										class="press flex flex-1 basis-0 items-center justify-center rounded-lg border border-line bg-surface px-3 py-2 text-sm text-danger"
										onclick={() => cursor && clearEnd(cursor.endNo)}
									>
										{$t('match.deleteEnd')}
									</button>
								{/if}
							</div>
						{/snippet}
					</ArrowPad>

				</div>
			{:else}
				<button class="shrink-0 self-start text-sm text-danger" onclick={remove}>
					{$t('activity.delete')}
				</button>
			{/if}
		</div>
	</div>

	<Sheet open={editingSetup} title={$t('match.title')} onclose={() => (editingSetup = false)}>
		<div class="space-y-3">
			<div class="flex gap-2">
				<NamePicker
					value={config.ourName}
					known={knownNames.everyone}
					placeholder={$t('match.ourSide')}
					onchange={(name) =>
						config && updateMatchConfig(activity.id, { ...config, ourName: name }).then(refresh)}
				/>
				<NamePicker
					value={config.opponent}
					known={knownNames.everyone}
					placeholder={$t('match.opponent')}
					onchange={(name) =>
						config && updateMatchConfig(activity.id, { ...config, opponent: name }).then(refresh)}
				/>
			</div>

			<div class="flex items-center justify-between gap-3 border-t border-line pt-3">
				<div class="min-w-0">
					<p class="text-sm font-medium">{$t('score.sortArrows')}</p>
					<p class="text-xs text-muted">{$t('score.sortArrowsHint')}</p>
				</div>
				<Toggle
					checked={$sortArrowsDescending}
					label={$t('score.sortArrows')}
					onchange={(v) => sortArrowsDescending.set(v)}
				/>
			</div>

			<div class="flex items-center justify-between gap-3 border-t border-line pt-3">
				<div class="min-w-0">
					<p class="text-sm font-medium">{$t('score.arrowNumbers')}</p>
					<p class="text-xs text-muted">{$t('score.arrowNumbersHint')}</p>
				</div>
				<Toggle
					checked={$showArrowNumbers}
					label={$t('score.arrowNumbers')}
					onchange={(v) => showArrowNumbers.set(v)}
				/>
			</div>

			<!-- Our arrows only: the other side's are called out, and half of them are a bot's. -->
			{#if $showArrowNumbers && arrowNumbers.length > 1}
				<div class="border-t border-line pt-3">
					<p class="text-sm font-medium">{$t('score.arrowNumberChart')}</p>
					<ArrowNumberChart positions={arrowNumbers} />
				</div>
			{/if}

			<div class="flex items-start justify-between gap-3 border-t border-line pt-3">
				<div class="min-w-0">
					<p class="text-sm font-medium">{$t('match.forOtherTitle')}</p>
					<p class="text-xs text-muted">{$t('match.forOtherHint')}</p>
				</div>
				<Toggle
					checked={!config.forSelf}
					label={$t('match.forOtherTitle')}
					onchange={(v) =>
						config && updateMatchConfig(activity.id, { ...config, forSelf: !v }).then(refresh)}
				/>
			</div>

			<!-- Turned on mid match as well as before it: the next end is answered, the ones already
				shot are left exactly as they were entered. -->
			<div class="flex items-center justify-between gap-3 border-t border-line pt-3">
				<p class="text-sm font-medium">{$t('match.botTitle')}</p>
				<Toggle
					checked={config.bot !== null}
					label={$t('match.botTitle')}
					onchange={(v) =>
						config &&
						updateMatchConfig(activity.id, {
							...config,
							bot: v ? (config.bot ?? 'amateur') : null
						}).then(refresh)}
				/>
			</div>

			{#if config.bot}
				<div class="flex gap-2">
					{#each BOT_LEVELS as level (level)}
						<button
							class="press flex-1 rounded-lg border py-2 text-xs font-medium
								{config?.bot === level ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
							onclick={() =>
								config && updateMatchConfig(activity.id, { ...config, bot: level }).then(refresh)}
						>
							{$t(`match.bot.${level}`)}
						</button>
					{/each}
				</div>
			{/if}

			<div class="flex items-center justify-between gap-3 border-t border-line pt-3">
				<p class="text-sm font-medium">{$t('match.stageLabel')}</p>
				<select
					class="shrink-0 rounded-lg border border-line bg-bg p-2 text-sm text-ink"
					value={config.stage}
					onchange={(e) =>
						config &&
						updateMatchConfig(activity.id, {
							...config,
							stage: e.currentTarget.value as MatchStage
						}).then(refresh)}
				>
					{#each MATCH_STAGES as stage (stage)}
						<option value={stage}>{$t(`match.stage.${stage}`)}</option>
					{/each}
				</select>
			</div>

			<div class="flex items-center justify-between gap-3 border-t border-line pt-3">
				<p class="text-sm font-medium">{$t('match.winCondition')}</p>
				<div class="flex shrink-0 gap-1 rounded-lg bg-sunk p-0.5">
					{#each ['set', 'cumulative'] as const as system (system)}
						<button
							class="press rounded-md px-3 py-1.5 text-sm font-medium
								{config?.system === system ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
							onclick={() =>
								config && updateMatchConfig(activity.id, { ...config, system }).then(refresh)}
						>
							{$t(`match.system.${system}`)}
						</button>
					{/each}
				</div>
			</div>
		</div>
	</Sheet>

	{#if sharing}
		<Scorecard data={cardData} onclose={() => (sharing = false)} />
	{/if}

	{#if scanning && cursor}
		<AutoScore
			{scoreSet}
			remaining={slotsFor(cursor.shootOff) - cursor.index}
			videoName={videoName()}
			onaccept={acceptDetected}
			onrecorded={() => {}}
			onclose={() => (scanning = false)}
		/>
	{/if}

{/if}
