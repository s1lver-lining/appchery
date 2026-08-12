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
	import {
		loadMatch,
		saveMatchEnd,
		setMatchArrows,
		deleteMatchEnd,
		updateMatchConfig,
		deleteActivity,
		awardBadges,
		shotFromPlot,
		type ActivityRow
	} from '$lib/db/repository';
	import { goto } from '$app/navigation';
	import Icon from '$lib/ui/Icon.svelte';
	import TargetFace from '$lib/ui/TargetFace.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Toggle from '$lib/ui/Toggle.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import { closeOnBack } from '$lib/ui/dismiss.svelte';

	/**
	 * The card of a head to head match: two totals an end, and who that made the winner. Totals are
	 * the fast path because a match is shot on the clock; arrows can be plotted afterwards, or in the
	 * gaps, and once they are plotted they are what the total is read from.
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

	/* Entry. One row at a time, both sides, either typed or plotted. */
	let draft = $state<{ endNo: number; ours: string; theirs: string; shootOff: boolean } | null>(null);

	function open(endNo: number, shootOff = false) {
		const existing = rows.find((row) => row.endNo === endNo);
		draft = {
			endNo,
			shootOff,
			ours: existing ? String(existing.ours) : '',
			theirs: existing?.theirs !== null && existing !== undefined ? String(existing.theirs) : ''
		};
	}

	async function saveDraft() {
		if (!draft) return;
		const { endNo, shootOff } = draft;
		const ours = draft.ours.trim() === '' ? null : Number(draft.ours);
		const theirs = draft.theirs.trim() === '' ? null : Number(draft.theirs);
		draft = null;
		await saveMatchEnd(activity.id, endNo, { ours, theirs, shootOff });
		await refresh();
		await celebrate();
	}

	/** A badge is the archer's own: a card kept for somebody else earns nothing. */
	async function celebrate() {
		if (config?.forSelf) await awardBadges();
	}

	async function clearEnd(endNo: number) {
		draft = null;
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

	/* Plotting. The same face the arrows would be scored on, one side of one end at a time. */
	let plotting = $state<{ endNo: number; side: Side; shootOff: boolean } | null>(null);
	let plotted = $state<{ x: number; y: number; value: number; zoneLabel: string }[]>([]);

	function openPlot(endNo: number, side: Side, shootOff: boolean) {
		const row = rows.find((r) => r.endNo === endNo);
		plotted = (row?.shots ?? [])
			.filter((shot) => shot.side === side && shot.x !== null && shot.y !== null)
			.map((shot) => ({
				x: shot.x as number,
				y: shot.y as number,
				value: shot.value,
				zoneLabel: shot.zoneLabel
			}));
		plotting = { endNo, side, shootOff };
	}

	const plotSlots = $derived(plotting?.shootOff ? 1 : (config?.arrowsPerEnd ?? 3));

	function plot(x: number, y: number) {
		if (!scoreSet || plotted.length >= plotSlots) return;
		const zone = scoreAt(scoreSet, x, y);
		plotted = [...plotted, { x, y, value: zone.value, zoneLabel: zone.label }];
	}

	async function savePlot() {
		if (!plotting || !scoreSet) return;
		const { endNo, side, shootOff } = plotting;
		const shots = plotted.map((shot) => shotFromPlot(scoreAt(scoreSet, shot.x, shot.y), shot.x, shot.y));
		plotting = null;

		// The end has to exist before arrows can hang off it, and an unentered end has no totals yet.
		if (!rows.some((row) => row.endNo === endNo)) {
			await saveMatchEnd(activity.id, endNo, { ours: null, theirs: null, shootOff });
		}
		await setMatchArrows(activity.id, endNo, side, shots);
		await refresh();

		// Two plotted shoot-off arrows say who won without anybody having to be asked.
		if (shootOff) await decideFromPlot();
		await celebrate();
	}

	async function decideFromPlot() {
		const row = rows.find((r) => r.shootOff);
		if (!row) return;
		const arrow = (side: Side) => row.shots.find((shot) => shot.side === side) ?? null;
		const winner = shootOffWinner(arrow('us'), arrow('them'));
		if (!winner) return;
		await saveMatchEnd(activity.id, row.endNo, {
			ours: row.ours,
			theirs: row.theirs,
			shootOff: true,
			winner
		});
		await refresh();
	}

	closeOnBack(
		() => plotting !== null,
		() => (plotting = null)
	);
	closeOnBack(
		() => draft !== null,
		() => (draft = null)
	);

	async function remove() {
		await deleteActivity(activity.id);
		goto(`/sessions/${activity.sessionId}`);
	}

	const arrowsOf = (row: Row, side: Side) => row.shots.filter((shot) => shot.side === side);
	const points = $derived((endNo: number, side: Side) => {
		const row = result?.ends.find((entry) => entry.end.endNo === endNo);
		if (!row || config?.system !== 'set' || row.end.shootOff) return null;
		return side === 'us' ? row.ourPoints : row.theirPoints;
	});
</script>

{#if config && result}
	<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4 pt-6">
		<header class="flex items-start gap-2">
			<a href="/sessions/{activity.sessionId}" class="-ml-1 mt-1 shrink-0 text-muted" aria-label={$t('common.back')}>
				<Icon name="back" size={22} />
			</a>
			<div class="min-w-0 flex-1">
				<h1 class="truncate text-2xl font-bold tracking-tight">
					{ourLabel} · {theirLabel}
				</h1>
				<p class="truncate text-sm text-muted">
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

		{#if !config.forSelf}
			<p class="rounded-lg border border-dashed border-line px-3 py-1.5 text-xs text-muted">
				{$t('match.forOtherBadge')}
			</p>
		{/if}

		<!-- The scoreboard, which is what the archer looks at between ends. -->
		<section class="rounded-xl border border-line bg-surface p-4">
			<div class="flex items-center gap-3 text-center">
				<div class="min-w-0 flex-1">
					<p class="truncate text-xs text-muted">{ourLabel}</p>
					<p
						class="tabular text-4xl leading-none font-bold {result.winner === 'us'
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
						class="tabular text-4xl leading-none font-bold {result.winner === 'them'
							? 'text-competition'
							: ''}"
					>
						{config.system === 'set' ? result.theirPoints : result.theirTotal}
					</p>
				</div>
			</div>

			<p class="mt-3 border-t border-line pt-2 text-center text-sm font-semibold">
				{outcome()}
				{#if config.system === 'set'}
					<span class="tabular ml-2 font-normal text-muted">
						{result.ourTotal} – {result.theirTotal}
					</span>
				{/if}
			</p>
		</section>

		<!-- One row an end: what each side shot, and what that was worth. -->
		<section class="overflow-hidden rounded-xl border border-line bg-surface">
			{#each rows as row (row.endNo)}
				<button
					class="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0"
					onclick={() => open(row.endNo, row.shootOff)}
				>
					<span class="w-16 shrink-0 text-xs text-muted">
						{row.shootOff ? $t('match.shootOff') : $t('match.end', { n: row.endNo })}
					</span>
					<span class="tabular flex-1 text-right font-semibold">{row.ours}</span>
					{#if points(row.endNo, 'us') !== null}
						<span class="tabular w-6 text-center text-xs text-brand-text">
							{points(row.endNo, 'us')}
						</span>
					{/if}
					<span class="text-line">–</span>
					{#if points(row.endNo, 'them') !== null}
						<span class="tabular w-6 text-center text-xs text-muted">
							{points(row.endNo, 'them')}
						</span>
					{/if}
					<span class="tabular flex-1 font-semibold">{row.theirs ?? '—'}</span>
					<span class="w-10 shrink-0 text-right text-[10px] text-muted">
						{arrowsOf(row, 'us').length > 0 ? arrowsOf(row, 'us').length : ''}
					</span>
				</button>
			{/each}

			{#if asking !== null}
				<button
					class="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-brand-text"
					onclick={() => open(asking)}
				>
					<Icon name="plus" size={18} />
					{$t('match.enterEnd', { n: asking })}
				</button>
			{:else if result.needsShootOff && !rows.some((row) => row.shootOff)}
				<button
					class="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-brand-text"
					onclick={() => open((config?.maxEnds ?? rows.length) + 1, true)}
				>
					<Icon name="plus" size={18} />
					{$t('match.shootOff')}
				</button>
			{/if}
		</section>

		<!-- A shoot-off the arrows cannot separate is a judge's call, so the card asks for it. -->
		{#if result.needsShootOff && rows.some((row) => row.shootOff && row.ours === row.theirs)}
			<section class="rounded-xl border border-brand/40 bg-brand/5 p-4">
				<p class="mb-2 text-sm font-semibold">{$t('match.whoWon')}</p>
				<div class="flex gap-2">
					<button
						class="flex-1 rounded-lg border border-line py-2 text-sm font-medium"
						onclick={() => callShootOff('us')}
					>
						{$t('match.weWon')}
					</button>
					<button
						class="flex-1 rounded-lg border border-line py-2 text-sm font-medium"
						onclick={() => callShootOff('them')}
					>
						{$t('match.theyWon')}
					</button>
				</div>
			</section>
		{/if}

		<button class="flex items-center gap-1.5 text-sm text-danger" onclick={() => (confirmingDelete = true)}>
			<Icon name="trash" size={16} />
			{$t('activity.delete')}
		</button>
	</div>

	<!-- Entering an end: two totals, and a way onto the face for either side. -->
	<Sheet
		open={draft !== null}
		title={draft?.shootOff ? $t('match.shootOff') : $t('match.end', { n: draft?.endNo ?? 1 })}
		onclose={() => (draft = null)}
	>
		{#if draft}
			<div class="space-y-3">
				<div class="flex items-end gap-2">
					<label class="min-w-0 flex-1 text-xs text-muted">
						{ourLabel}
						<input
							type="number"
							inputmode="numeric"
							min="0"
							class="tabular mt-1 w-full rounded-lg border border-line bg-bg p-3 text-2xl font-bold text-ink"
							bind:value={draft.ours}
						/>
					</label>
					<label class="min-w-0 flex-1 text-xs text-muted">
						{theirLabel}
						<input
							type="number"
							inputmode="numeric"
							min="0"
							class="tabular mt-1 w-full rounded-lg border border-line bg-bg p-3 text-2xl font-bold text-ink"
							bind:value={draft.theirs}
						/>
					</label>
				</div>

				<div class="flex gap-2">
					<button
						class="flex-1 rounded-lg border border-line py-2 text-sm font-medium"
						onclick={() => draft && openPlot(draft.endNo, 'us', draft.shootOff)}
					>
						{$t('match.plotOurs')}
					</button>
					<button
						class="flex-1 rounded-lg border border-line py-2 text-sm font-medium"
						onclick={() => draft && openPlot(draft.endNo, 'them', draft.shootOff)}
					>
						{$t('match.plotTheirs')}
					</button>
				</div>

				{#if draft.shootOff}
					<!-- Typed totals cannot say who was closer, so the call is made here by hand. -->
					<div class="border-t border-line pt-3">
						<p class="mb-2 text-sm font-medium">{$t('match.whoWon')}</p>
						<div class="flex gap-2">
							<button
								class="flex-1 rounded-lg border border-line py-2 text-sm"
								onclick={() => callShootOff('us')}
							>
								{$t('match.weWon')}
							</button>
							<button
								class="flex-1 rounded-lg border border-line py-2 text-sm"
								onclick={() => callShootOff('them')}
							>
								{$t('match.theyWon')}
							</button>
						</div>
					</div>
				{/if}

				{#if rows.some((row) => row.endNo === draft?.endNo)}
					<button
						class="text-sm text-danger"
						onclick={() => draft && clearEnd(draft.endNo)}
					>
						{$t('match.deleteEnd')}
					</button>
				{/if}
			</div>
		{/if}

		{#snippet footer()}
			<button
				class="flex-1 rounded-lg border border-line py-2 text-sm font-medium"
				onclick={() => (draft = null)}
			>
				{$t('common.cancel')}
			</button>
			<button
				class="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink"
				onclick={saveDraft}
			>
				{$t('common.save')}
			</button>
		{/snippet}
	</Sheet>

	{#if plotting && scoreSet}
		<div class="fixed inset-0 z-50 flex flex-col bg-bg">
			<header class="safe-top flex items-center justify-between border-b border-line px-4 py-3 pt-6">
				<h2 class="text-lg font-bold">
					{plotting.side === 'us' ? ourLabel : theirLabel}
				</h2>
				<button class="text-muted" aria-label={$t('common.close')} onclick={() => (plotting = null)}>
					<Icon name="close" size={22} />
				</button>
			</header>

			<div class="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 p-4">
				<div class="mx-auto aspect-square w-full max-w-sm">
					<TargetFace
						{scoreSet}
						interactive
						shots={plotted.map((shot, i) => ({
							ordinal: i + 1,
							value: shot.value,
							zoneLabel: shot.zoneLabel,
							x: shot.x,
							y: shot.y,
							source: 'plotted' as const
						}))}
						onplot={plot}
					/>
				</div>

				<p class="tabular text-center text-sm text-muted">
					{plotted.map((shot) => shot.zoneLabel).join(' · ') || '—'}
					<span class="ml-2 font-semibold text-ink">
						{plotted.reduce((sum, shot) => sum + shot.value, 0)}
					</span>
				</p>

				<div class="mt-auto flex gap-2">
					<button
						class="flex-1 rounded-xl border border-line py-2.5 text-sm font-medium"
						onclick={() => (plotted = plotted.slice(0, -1))}
					>
						{$t('common.undo')}
					</button>
					<button
						class="flex-1 rounded-xl bg-brand py-2.5 font-semibold text-brand-ink"
						onclick={savePlot}
					>
						{$t('common.save')}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<Sheet open={editingSetup} title={$t('match.title')} onclose={() => (editingSetup = false)}>
		<div class="space-y-3">
			<div class="flex gap-2">
				<input
					class="min-w-0 flex-1 rounded-lg border border-line bg-bg p-2 text-sm text-ink"
					placeholder={$t('match.ourSide')}
					aria-label={$t('match.ourSide')}
					value={config.ourName ?? ''}
					onchange={(e) =>
						config && updateMatchConfig(activity.id, { ...config, ourName: e.currentTarget.value.trim() || null }).then(refresh)}
				/>
				<input
					class="min-w-0 flex-1 rounded-lg border border-line bg-bg p-2 text-sm text-ink"
					placeholder={$t('match.opponent')}
					aria-label={$t('match.opponent')}
					value={config.opponent ?? ''}
					onchange={(e) =>
						config && updateMatchConfig(activity.id, { ...config, opponent: e.currentTarget.value.trim() || null }).then(refresh)}
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
		</div>
	</Sheet>

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
