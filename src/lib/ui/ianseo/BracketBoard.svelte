<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import { clubName } from '$lib/ianseo/clubs';
	import { readAssignment, winnerOf as winner } from '$lib/ianseo/brackets';
	import { ianseoFullClubNames } from '$lib/prefs';
	import { readSession, writeSession } from '$lib/ui/sessionState';
	import { swipe, AXIS_BIAS, COMMIT_RATIO, SNAP_EASE, SNAP_MS } from '$lib/ui/swipe';
	import type { BracketDocument, BracketMatch, BracketRound } from '$lib/ianseo/types';

	/** An elimination bracket, read a round at a time; the wall chart ianseo prints is its own tab. */
	let {
		document,
		followedLabels,
		onfollow,
		key = ''
	}: {
		document: BracketDocument;
		followedLabels: Set<string>;
		onfollow: (kind: 'archer' | 'club', label: string) => void;
		/** What this bracket is, so the round being read is still the one on screen on the way back. */
		key?: string;
	} = $props();

	const shown = $derived(document.rounds.filter((round) => round.matches.length > 0));

	/**
	 * The side of a match that has somebody on it. A bye is drawn as one archer against an empty
	 * slot, and an empty row under their name says nothing that the word Bye beside it does not.
	 */
	const sidesOf = (match: BracketMatch) =>
		match.entries
			.map((entry, at) => ({ entry, at }))
			.filter((side) => side.entry.name.trim() !== '');
	/**
	 * When the match is due, said once above it rather than against the archer ianseo happened to
	 * print it beside: both sides shoot at the same time, and it is the match that is at half past.
	 */
	const dueAt = (match: BracketMatch) =>
		match.entries.map((entry) => readAssignment(entry.score).at).find(Boolean) ?? null;

	/**
	 * What ianseo wrote where a score goes, in the archer's language where the app knows the word.
	 * A bye is the one that is not a number: it is the round somebody was given rather than shot.
	 */
	const scoreLabel = (score: string) => (/^bye$/i.test(score) ? $t('ianseo.bye') : score);

	/** A number sits in the column a score is sized for. A word needs the room a word needs. */
	const isNumber = (score: string | null) => score !== null && Number.isFinite(Number(score));

	/** The whole draw at once, which is what the wall chart on the notice board shows. */
	const TREE = -1;

	let round = $state(remembered());
	const at = $derived(round === TREE ? TREE : Math.min(Math.max(round, 0), Math.max(shown.length - 1, 0)));
	const current = $derived(shown[at === TREE ? 0 : at]);

	function remembered(): number {
		const saved = Number(readSession(`appchery.bracketRound.${key}`));
		return Number.isInteger(saved) ? saved : 0;
	}

	function show(next: number) {
		round = next;
		if (key) writeSession(`appchery.bracketRound.${key}`, String(next));
	}

	/** The rounds in reading order, with the whole draw as one more stop past the final. */
	const order = $derived([...shown.map((_, index) => index), TREE]);
	const stepTo = (by: number) => order[order.indexOf(at) + by];

	// Track mechanics shared with the main pager's swipe: see doc/ianseo.md, "What is shown".
	let width = $state(1);
	/** A round is only as wide as its own column, so without a gap two of them ride touching. */
	const GUTTER = 24;
	const span = $derived(width + GUTTER);
	let offset = $state(0);
	let duration = $state(0);
	let settling = $state(false);

	/** Which way the drag is going, and what is over there. Nothing while the track is at rest. */
	const towards = $derived(offset === 0 ? 0 : offset < 0 ? 1 : -1);
	const coming = $derived(towards === 0 ? null : (stepTo(towards) ?? null));

	/** A swipe off either end of the order pulls against a rubber band rather than dead stopping. */
	function damp(dx: number) {
		return stepTo(dx < 0 ? 1 : -1) === undefined ? dx * 0.25 : dx;
	}

	// Leaving the chart at its left edge turns the page; see doc/ianseo.md, "What is shown".
	const EDGE_DEAD = 24;
	let edge: { x: number; y: number; leaving: boolean; dragging: boolean } | null = null;

	function edgePull(node: HTMLElement) {
		const onStart = (event: TouchEvent) => {
			// A track already snapping parks the offset off centre, where a second release would fight it.
			if (event.touches.length !== 1 || settling) {
				edge = null;
				return;
			}
			const touch = event.touches[0];
			edge = {
				x: touch.clientX,
				y: touch.clientY,
				leaving: node.scrollLeft <= 1,
				dragging: false
			};
		};
		const onMove = (event: TouchEvent) => {
			if (!edge?.leaving) return;
			const touch = event.touches[0];
			const dx = touch.clientX - edge.x;
			const dy = touch.clientY - edge.y;
			// Short, or mostly down the page, or pulling the wrong way: the chart's own scroll keeps it.
			if (dx < EDGE_DEAD || Math.abs(dx) < Math.abs(dy) * AXIS_BIAS) return;
			edge.dragging = true;
			duration = 0;
			event.preventDefault();
			offset = damp(dx - EDGE_DEAD);
		};
		const onEnd = () => {
			// Only a gesture that moved the track releases it; a tap on the chart is not a swipe of one.
			const dragging = edge?.dragging ?? false;
			edge = null;
			if (dragging) release(offset, false);
		};
		node.addEventListener('touchstart', onStart, { passive: true });
		node.addEventListener('touchmove', onMove, { passive: false });
		node.addEventListener('touchend', onEnd);
		node.addEventListener('touchcancel', onEnd);
		return {
			destroy: () => {
				node.removeEventListener('touchstart', onStart);
				node.removeEventListener('touchmove', onMove);
				node.removeEventListener('touchend', onEnd);
				node.removeEventListener('touchcancel', onEnd);
			}
		};
	}

	function release(dx: number, flicked: boolean) {
		const target = stepTo(dx < 0 ? 1 : -1);
		const far = Math.abs(offset) > span * COMMIT_RATIO;
		duration = SNAP_MS;

		if (target === undefined || !(far || flicked)) {
			offset = 0;
			return;
		}
		settling = true;
		// The way the finger was already going. Run the other way and the round that rides in for the
		// last quarter second is the one on the far side, which is not the one that then appears.
		offset = Math.sign(dx) * span;
		setTimeout(() => {
			duration = 0;
			offset = 0;
			settling = false;
			show(target);
		}, SNAP_MS);
	}
</script>

{#snippet chartPane()}
	<!-- Flipped twice to put the scrollbar above the chart rather than under it; edgePull is inert on the incoming copy. -->
	<div class="-mx-4 scroll-flip overflow-x-auto px-4" data-noswipe use:edgePull>
		<div>{@render chart()}</div>
	</div>
{/snippet}

{#snippet chart()}
			<!-- Narrow enough that two whole columns fit even on the narrowest supported phone. -->
			<div class="flex w-max items-stretch gap-2">
				{#each shown as one, index (one.title + index)}
					<div class="flex w-32 shrink-0 flex-col">
						<p class="mb-1.5 truncate text-[11px] font-semibold tracking-wide text-muted uppercase">
							{one.title || `${index + 1}`}
						</p>
						<!-- Spread down the column, so a match sits between the two that feed it. -->
						<div class="flex flex-1 flex-col justify-around gap-2">
							{#each one.matches as match, place (place)}
								{@const won = winner(match)}
								<div class="rounded-xl border border-line bg-surface">
									{#each sidesOf(match) as { entry, at: side }, row (side)}
										{@const mine = followedLabels.has(entry.name.trim().toLowerCase())}
										{@const drawn = readAssignment(entry.score)}
										<div
											class="flex items-center gap-1.5 px-2 py-1.5 text-xs {row === 1
												? 'border-t border-line'
												: ''} {mine ? 'bg-brand/10' : ''} {won === side ? 'font-semibold' : ''} {won !==
												null && won !== side
												? 'text-muted'
												: ''}"
										>
											{#if entry.seed}
												<span class="tabular w-4 shrink-0 text-[10px] text-muted">{entry.seed}</span>
											{/if}
											<span class="min-w-0 flex-1 truncate">
												{#if mine}
													<span class="mr-0.5 inline-block align-middle text-brand-text">
														<Icon name="star" size={10} filled />
													</span>
												{/if}{entry.name || '—'}
											</span>
											{#if drawn.target}
												<span
													class="tabular flex shrink-0 items-center gap-0.5 rounded bg-line/40 px-1 text-[10px] text-muted"
													title={$t('ianseo.onTarget', { target: drawn.target })}
												>
													<Icon name="target" size={9} />
													{drawn.target}
												</span>
											{:else}
												<span class="tabular shrink-0 {won === side ? 'text-brand-text' : 'text-muted'}">
													{drawn.score && !isNumber(drawn.score)
														? scoreLabel(drawn.score)
														: (drawn.score ?? '')}
												</span>
											{/if}
										</div>
									{/each}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
{/snippet}

{#snippet cards(round: BracketRound)}
		{#each round.matches as match, place (place)}
			{@const won = winner(match)}
			<div class="overflow-hidden rounded-2xl border border-line bg-surface">
				{#if dueAt(match)}
					<p class="border-b border-line bg-line/15 px-3 py-1 text-[11px] text-muted">
						{dueAt(match)}
					</p>
				{/if}
				{#each sidesOf(match) as { entry, at: side }, index (side)}
					{@const mine = followedLabels.has(entry.name.trim().toLowerCase())}
					{@const drawn = readAssignment(entry.score)}
					{@const hasClub = Boolean(entry.club || entry.country)}
					<div
						class="flex items-center gap-2 px-3 py-2 {index === 1
							? 'border-t border-line'
							: ''} {mine ? 'bg-brand/10' : ''} {won === side ? 'font-semibold' : ''} {won !== null &&
						won !== side
							? 'text-muted'
							: ''}"
					>
						{#if entry.seed}
							<span class="tabular w-6 shrink-0 text-[11px] text-muted">{entry.seed}</span>
						{/if}
						<div class="min-w-0 flex-1">
							<!-- The star follows the name rather than holding a column of its own: it is about the archer. -->
							<!-- Inline rather than a flex row, so the star follows the last word instead of dropping below it. -->
							<p class="break-words">
								{entry.name || '—'}
								{#if entry.name}
									<button
										class="inline-flex rounded p-0.5 align-text-bottom {mine
											? 'text-brand-text'
											: 'text-muted/40'}"
										aria-pressed={mine}
										aria-label={mine
											? $t('ianseo.unfollowName', { name: entry.name })
											: $t('ianseo.followName', { name: entry.name })}
										onclick={() => onfollow('archer', entry.name)}
									>
										<Icon name="star" size={13} filled={mine} />
									</button>
								{/if}
							</p>
							{#if hasClub || match.sets[side]?.length}
								<!-- The set-by-set score sits beside the club it belongs beside; a lone archer keeps it under their name instead. -->
								<div class="mt-0.5 flex items-center gap-2">
									{#if hasClub}
										<p class="min-w-0 flex-1 truncate text-xs text-muted">
											{entry.country?.name ?? clubName(entry.club ?? '', $ianseoFullClubNames)}
										</p>
									{/if}
									{#if match.sets[side]?.length}
										<div class="hidden gap-1 min-[380px]:flex {hasClub ? 'ml-auto shrink-0' : ''}">
											{#each match.sets[side] as value, at (at)}
												<span class="tabular w-7 rounded bg-line/40 py-0.5 text-center text-[11px] text-muted">
													{value}
												</span>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						</div>
						{#if drawn.target}
							<!-- `19D` in the score column reads as a score; a target chip says it is not one. -->
							<span
								class="tabular flex shrink-0 items-center gap-1 rounded bg-line/40 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-muted"
								title={$t('ianseo.onTarget', { target: drawn.target })}
							>
								<Icon name="target" size={11} />
								{drawn.target}
							</span>
						{:else if drawn.score && !isNumber(drawn.score)}
							<!-- Room for what it says: a bye is a word rather than a number of points. -->
							<span class="tabular shrink-0 rounded bg-line/40 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-muted">
								{scoreLabel(drawn.score)}
							</span>
						{:else}
							<span
								class="tabular w-7 shrink-0 text-right text-lg leading-none {won === side
									? 'text-brand-text'
									: ''}"
							>
								{drawn.score ?? ''}
							</span>
						{/if}
					</div>
				{/each}

				{#if match.sets.length > 0}
					<!-- Under 380 pixels the set scores will not sit beside the names, so they take their own line. -->
					<div class="flex flex-col gap-0.5 border-t border-line bg-line/15 px-3 py-1.5 min-[380px]:hidden">
						{#each match.sets as line, side (side)}
							<div class="flex gap-1">
								{#each line as value, at (at)}
									<span class="tabular w-7 rounded bg-surface py-0.5 text-center text-[11px] text-muted">
										{value}
									</span>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
{/snippet}

{#if shown.length === 0}
	<p class="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">
		{$t('ianseo.bracketEmpty')}
	</p>
{:else}
	<!-- The rounds as a strip of tabs: the final is the one worth landing on, so it sits at the end. -->
	<div class="-mx-4 mb-3 overflow-x-auto px-4">
		<div class="flex w-max min-w-full gap-1.5">
			{#each shown as one, index (one.title + index)}
				<button
					class="press rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap {index === at
						? 'border-brand/40 bg-brand/10 text-brand-text'
						: 'border-line text-muted'}"
					aria-pressed={index === at}
					onclick={() => show(index)}
				>
					{one.title || `${index + 1}`}
					<span class="ml-1 font-normal opacity-70">{one.matches.length}</span>
				</button>
			{/each}

			<!-- Kept to the end of the strip, past the final: it is every round at once, not another one. -->
			<button
				class="press ml-auto flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap {at ===
				TREE
					? 'border-brand/40 bg-brand/10 text-brand-text'
					: 'border-line text-muted'}"
				aria-pressed={at === TREE}
				onclick={() => show(TREE)}
			>
				<Icon name="bracket" size={13} />
				{$t('ianseo.wholeDraw')}
			</button>
		</div>
	</div>

	<!-- The two panes share one grid cell, auto height; `grid-cols-1` bounds it, or a row overflows. -->
	<div
		class="relative grid min-h-[30dvh] flex-1 grid-cols-1 overflow-hidden"
		data-noswipe
		bind:clientWidth={width}
		use:swipe={{
			// The chart carries `data-noswipe`, so a drag begun on it belongs to the chart and not to this.
			enabled: () => !settling,
			onMove: (dx) => {
				duration = 0;
				offset = damp(dx);
			},
			onEnd: release
		}}
	>
		<div
			class="col-start-1 row-start-1 self-start space-y-2"
			style="transform: translate3d({offset}px, 0, 0); transition: transform {duration}ms {SNAP_EASE}"
		>
			{#if at === TREE}
				{@render chartPane()}
			{:else}
				{@render cards(current)}
			{/if}
		</div>

		{#if coming !== null}
			<div
				class="col-start-1 row-start-1 self-start space-y-2"
				style="transform: translate3d({towards * span + offset}px, 0, 0); transition: transform {duration}ms {SNAP_EASE}"
				inert
			>
				{#if coming === TREE}
					{@render chartPane()}
				{:else}
					{@render cards(shown[coming])}
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Both turns together leave the chart the right way up with its scrollbar over it, not under. */
	.scroll-flip {
		transform: rotateX(180deg);
	}
	.scroll-flip > :global(div) {
		transform: rotateX(180deg);
	}
</style>
