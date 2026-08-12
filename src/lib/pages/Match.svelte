<script lang="ts">
	import { t } from '$lib/i18n';
	import { getScoreSet } from '$lib/domain/rounds/seed';
	import { scoreAt } from '$lib/domain/rounds/geometry';
	import { formatDistance } from '$lib/domain/units';
	import {
		tally,
		nextEndNo,
		shootOffWinner,
		type MatchConfig,
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
		deleteActivity,
		awardBadges,
		shotFromZone,
		shotFromPlot,
		type ActivityRow
	} from '$lib/db/repository';
	import { goto } from '$app/navigation';
	import Icon from '$lib/ui/Icon.svelte';
	import ArrowPad from '$lib/ui/ArrowPad.svelte';
	import AutoScore from '$lib/ui/AutoScore.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Toggle from '$lib/ui/Toggle.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import { closeOnBack } from '$lib/ui/dismiss.svelte';

	/**
	 * The card of a head to head match, read the way a scoresheet is: our arrows on the left of the
	 * line, theirs on the right, an end to a row. Totals can be typed straight in, because a match is
	 * shot on the clock and the arrows are often somebody else's to call out.
	 */
	let { activity, onchange }: { activity: ActivityRow; onchange: () => void } = $props();

	type Row = Awaited<ReturnType<typeof loadMatch>>['ends'][number];

	let config = $state<MatchConfig | null>(null);
	let rows = $state<Row[]>([]);
	let confirmingDelete = $state(false);
	let editingSetup = $state(false);

	async function refresh() {
		const match = await loadMatch(activity.id);
		config = match.config;
		rows = match.ends;
		onchange();
	}
	$effect(() => {
		void activity.id;
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
	const theirLabel = $derived(config?.opponent || $t('match.opponent'));

	/** What the match is at a glance, which is the only thing a match really records. */
	const outcome = $derived(() => {
		if (!result) return $t('match.inProgress');
		if (result.winner === 'us') return $t('match.won');
		if (result.winner === 'them') return $t('match.lost');
		if (result.needsShootOff) return $t('match.undecided');
		return $t('match.inProgress');
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

	const arrowsOf = (row: Row | undefined, side: Side) =>
		(row?.shots ?? []).filter((shot) => shot.side === side).sort((a, b) => a.ordinal - b.ordinal);
	const slotsFor = (shootOff: boolean) => (shootOff ? 1 : (config?.arrowsPerEnd ?? 3));

	const points = $derived((endNo: number, side: Side) => {
		const entry = result?.ends.find((row) => row.end.endNo === endNo);
		if (!entry || config?.system !== 'set' || entry.end.shootOff) return null;
		return side === 'us' ? entry.ourPoints : entry.theirPoints;
	});

	/* Entering arrows. One slot at a time, our side first, then theirs, then the pad steps back. */
	let cursor = $state<{ endNo: number; side: Side; index: number; shootOff: boolean } | null>(null);
	let mode = $state<'number' | 'face'>('number');

	const cursorRow = $derived(rows.find((row) => row.endNo === cursor?.endNo));
	const cursorShots = $derived(cursor ? arrowsOf(cursorRow, cursor.side) : []);

	function focus(endNo: number, side: Side, index: number, shootOff: boolean) {
		cursor =
			cursor?.endNo === endNo && cursor.side === side && cursor.index === index
				? null
				: { endNo, side, index, shootOff };
	}

	/** The next empty slot: down our side, across to theirs, then done. */
	function advance() {
		if (!cursor) return;
		const slots = slotsFor(cursor.shootOff);
		if (cursor.index + 1 < slots) {
			cursor = { ...cursor, index: cursor.index + 1 };
			return;
		}
		cursor = cursor.side === 'us' ? { ...cursor, side: 'them', index: 0 } : null;
	}

	async function write(shot: Omit<Shot, 'ordinal'>) {
		if (!cursor) return;
		const { endNo, side, index, shootOff } = cursor;
		const kept: Omit<Shot, 'ordinal'>[] = arrowsOf(
			rows.find((row) => row.endNo === endNo),
			side
		).map((row) => ({
			value: row.value,
			zoneLabel: row.zoneLabel,
			x: row.x,
			y: row.y,
			source: row.source as Shot['source']
		}));
		// Slots are filled by position, so an arrow tapped into the third one lands third.
		while (kept.length < index)
			kept.push({ value: 0, zoneLabel: 'M', x: null, y: null, source: 'manual' });
		kept[index] = shot;

		advance();
		await setMatchArrows(activity.id, endNo, side, kept, shootOff);
		await refresh();
		if (shootOff) await decideFromPlot();
		await celebrate();
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
		const kept: Omit<Shot, 'ordinal'>[] = arrowsOf(
			rows.find((row) => row.endNo === endNo),
			side
		)
			.slice(0, index)
			.map((row) => ({
				value: row.value,
				zoneLabel: row.zoneLabel,
				x: row.x,
				y: row.y,
				source: row.source as Shot['source']
			}));

		for (const point of points) {
			if (kept.length >= slotsFor(shootOff)) break;
			kept.push(shotFromPlot(scoreAt(scoreSet, point.x, point.y), point.x, point.y));
		}

		cursor = kept.length >= slotsFor(shootOff) ? null : { ...cursor, index: kept.length };
		await setMatchArrows(activity.id, endNo, side, kept, shootOff);
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
		const value = raw.trim() === '' ? null : Number(raw);
		if (value !== null && !Number.isFinite(value)) return;
		cursor = null;
		await setMatchEndTotal(activity.id, endNo, side, value, shootOff);
		await refresh();
		await celebrate();
	}

	/** A badge is the archer's own: a card kept for somebody else earns nothing. */
	async function celebrate() {
		if (config?.forSelf) await awardBadges();
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
		const arrow = (side: Side) => row.shots.find((shot) => shot.side === side) ?? null;
		const winner = shootOffWinner(arrow('us'), arrow('them'));
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
		const ours = row.shots.find((shot) => shot.side === 'us');
		const theirs = row.shots.find((shot) => shot.side === 'them');
		if (ours && theirs && shootOffWinner(ours, theirs)) return false;
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

	async function remove() {
		await deleteActivity(activity.id);
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
	{@const shots = arrowsOf(row, side)}
	{@const total = side === 'us' ? (row ? row.ours : null) : (row?.theirs ?? null)}
	<div class="flex min-w-0 flex-1 items-center gap-0.5 {mirrored ? 'flex-row-reverse' : ''}">
		<!--
			Three to a line whatever the format: a team's six arrows read as two ends of three, which is
			how they were shot, rather than as a four and a two that mean nothing.
		-->
		<div
			class="grid gap-0.5 {mirrored ? 'ml-auto' : 'mr-auto'}"
			style="grid-template-columns: repeat({Math.min(3, slotsFor(shootOff))}, var(--chip))"
		>
			{#each Array(slotsFor(shootOff)) as _, index (index)}
				{@const shot = shots[index]}
				<button
					class="tabular h-[var(--chip)] w-[var(--chip)] shrink-0 rounded text-[calc(var(--chip)*0.5)] font-bold
						{shot ? '' : 'border border-dashed border-line text-muted'}
						{cursor?.endNo === endNo && cursor.side === side && cursor.index === index
						? cursorClass
						: ''}"
					style={shot ? chipStyle(shot.zoneLabel) : ''}
					aria-label={$t('score.editArrow', { n: index + 1, end: endNo })}
					onclick={() => focus(endNo, side, index, shootOff)}
				>
					{shot?.zoneLabel ?? ''}
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
	<div class="mx-auto flex w-full max-w-2xl flex-col">
		<div class="safe-top flex max-h-[calc(100dvh-4.6rem)] flex-col gap-3 p-4 pt-6">
			<div class="shrink-0 space-y-3">
				<header class="flex items-start gap-2">
					<a
						href="/sessions/{activity.sessionId}"
						class="mt-1 -ml-1 shrink-0 text-muted"
						aria-label={$t('common.back')}
					>
						<Icon name="back" size={22} />
					</a>
					<div class="min-w-0 flex-1">
						<h1 class="truncate text-xl font-bold tracking-tight">{ourLabel} · {theirLabel}</h1>
						<p class="truncate text-xs text-muted">
							{$t(`match.format.${config.format}`)} · {$t(`match.system.${config.system}`)}
							{#if config.distance}
								· {formatDistance(config.distance.value, config.distance.unit)}
							{/if}
						</p>
					</div>

					<!-- A match is shot on the clock, and the clock is a feature of its own still to come. -->
					<button
						class="mt-0.5 shrink-0 rounded-lg p-1.5 text-muted opacity-40"
						disabled
						title={$t('match.timerSoon')}
						aria-label={$t('match.timerSoon')}
					>
						<Icon name="clock" size={20} />
					</button>
					<button
						class="mt-0.5 shrink-0 rounded-lg p-1.5 text-muted"
						aria-label={$t('common.more')}
						onclick={() => (editingSetup = true)}
					>
						<Icon name="sliders" size={20} />
					</button>
				</header>

				<!-- Pinned above the sheet: the running result is what an archer reads between ends. -->
				<section class="rounded-xl border border-line bg-surface px-4 py-2.5">
					<div class="flex items-center gap-3 text-center">
						<div class="min-w-0 flex-1">
							<p class="truncate text-xs text-muted">{ourLabel}</p>
							<p
								class="tabular text-3xl leading-none font-bold {result.winner === 'us'
									? 'text-brand-text'
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
									? 'text-competition'
									: ''}"
							>
								{config.system === 'set' ? result.theirPoints : result.theirTotal}
							</p>
						</div>
					</div>
				</section>

				{#if !config.forSelf}
					<p class="rounded-lg border border-dashed border-line px-3 py-1.5 text-xs text-muted">
						{$t('match.forOtherBadge')}
					</p>
				{/if}
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
							class="flex-1 rounded-lg border border-line bg-surface py-2 text-sm font-medium"
							onclick={() => callShootOff('us')}
						>
							{$t('match.weWon')}
						</button>
						<button
							class="flex-1 rounded-lg border border-line bg-surface py-2 text-sm font-medium"
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
				<div class="-mx-4 -mb-4 shrink-0 border-t border-line bg-surface pb-4 shadow-[0_-8px_16px_-12px_rgba(0,0,0,0.4)]">
					<ArrowPad
						flush
						{scoreSet}
						bind:mode
						oncamera={() => (scanning = true)}
						onclose={() => (cursor = null)}
						shots={cursorShots.map((shot) => ({
							ordinal: shot.ordinal,
							value: shot.value,
							zoneLabel: shot.zoneLabel,
							x: shot.x,
							y: shot.y,
							source: shot.source as Shot['source']
						}))}
						onpick={pick}
						onplot={plot}
					>
						{#snippet title()}
							<span class="font-semibold text-ink">
								{cursor?.shootOff ? $t('match.shootOff') : $t('match.end', { n: cursor?.endNo ?? 1 })}
							</span>
							· {cursor?.side === 'us' ? ourLabel : theirLabel}
						{/snippet}
					</ArrowPad>

					<div class="flex items-center gap-2 px-4 pt-2">
						<button
							class="flex-1 rounded-lg border border-line bg-surface py-2 text-sm font-medium"
							onclick={() => (cursor = null)}
						>
							{$t('common.done')}
						</button>
						{#if rows.some((row) => row.endNo === cursor?.endNo)}
							<button
								class="rounded-lg border border-line px-3 py-2 text-sm text-danger"
								onclick={() => cursor && clearEnd(cursor.endNo)}
							>
								{$t('match.deleteEnd')}
							</button>
						{/if}
					</div>
				</div>
			{:else}
				<button
					class="shrink-0 self-start text-sm text-danger"
					onclick={() => (confirmingDelete = true)}
				>
					{$t('activity.delete')}
				</button>
			{/if}
		</div>
	</div>

	<Sheet open={editingSetup} title={$t('match.title')} onclose={() => (editingSetup = false)}>
		<div class="space-y-3">
			<div class="flex gap-2">
				<input
					class="min-w-0 flex-1 rounded-lg border border-line bg-bg p-2 text-sm text-ink"
					placeholder={$t('match.ourSide')}
					aria-label={$t('match.ourSide')}
					value={config.ourName ?? ''}
					onchange={(e) =>
						config &&
						updateMatchConfig(activity.id, {
							...config,
							ourName: e.currentTarget.value.trim() || null
						}).then(refresh)}
				/>
				<input
					class="min-w-0 flex-1 rounded-lg border border-line bg-bg p-2 text-sm text-ink"
					placeholder={$t('match.opponent')}
					aria-label={$t('match.opponent')}
					value={config.opponent ?? ''}
					onchange={(e) =>
						config &&
						updateMatchConfig(activity.id, {
							...config,
							opponent: e.currentTarget.value.trim() || null
						}).then(refresh)}
				/>
			</div>

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

			<div class="flex items-center justify-between gap-3 border-t border-line pt-3">
				<p class="text-sm font-medium">{$t('match.winCondition')}</p>
				<div class="flex shrink-0 gap-1 rounded-lg bg-sunk p-0.5">
					{#each ['set', 'cumulative'] as const as system (system)}
						<button
							class="rounded-md px-3 py-1.5 text-sm font-medium
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

	{#if confirmingDelete}
		<ConfirmDialog
			title={$t('activity.confirmTitle')}
			message={$t('activity.confirmBody')}
			confirmLabel={$t('common.delete')}
			onconfirm={remove}
			oncancel={() => (confirmingDelete = false)}
		/>
	{/if}
{/if}
