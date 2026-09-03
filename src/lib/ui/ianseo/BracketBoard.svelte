<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import { clubName } from '$lib/ianseo/clubs';
	import { readAssignment } from '$lib/ianseo/brackets';
	import { ianseoFullClubNames } from '$lib/prefs';
	import { readSession, writeSession } from '$lib/ui/sessionState';
	import { swipe, AXIS_BIAS, COMMIT_RATIO, SNAP_EASE, SNAP_MS } from '$lib/ui/swipe';
	import type { BracketDocument, BracketMatch, BracketRound } from '$lib/ianseo/types';

	/**
	 * An elimination bracket. Drawn as a round at a time rather than as the wall chart ianseo prints:
	 * a chart wide enough to hold thirty two archers is unreadable on a phone at any zoom, and what
	 * is actually wanted from it is who beat whom, which a round of cards says at a glance.
	 */
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

	/** The higher score takes the match. A match nobody has shot has no winner, and says nothing. */
	function winner(match: BracketMatch): number | null {
		const scores = match.entries.map((entry) => Number(readAssignment(entry.score).score));
		if (scores.some((score) => !Number.isFinite(score))) return null;
		if (scores.length < 2 || scores[0] === scores[1]) return null;
		return scores[0] > scores[1] ? 0 : 1;
	}

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

	/**
	 * A swipe across the cards is the same move as a tap on the strip above them, because a bracket
	 * is read round by round and the rounds are in an order. The whole draw sits at the end of that
	 * order rather than outside it: swiping past the final arrives at the chart it is drawn on.
	 */
	const order = $derived([...shown.map((_, index) => index), TREE]);
	const stepTo = (by: number) => order[order.indexOf(at) + by];

	/**
	 * The drag itself, worked the way the swipe between the main pages of the app is worked: the
	 * round follows the finger, the one being swiped to rides in beside it, and letting go either
	 * carries it the rest of the way or puts it back. Sharing the numbers as well as the shape, so
	 * two gestures that look the same are the same.
	 */
	let width = $state(1);
	/**
	 * The gap between one round and the next while the drag is carrying them past each other. The
	 * main pages get theirs for nothing, being a screen wide with their own margins inside; a round
	 * is only as wide as the column it is read in, so without this the two are stuck together.
	 */
	const GUTTER = 24;
	const span = $derived(width + GUTTER);
	let offset = $state(0);
	let duration = $state(0);
	let settling = $state(false);
	let hereHigh = $state(0);
	let comingHigh = $state(0);

	/** Which way the drag is going, and what is over there. Nothing while the track is at rest. */
	const towards = $derived(offset === 0 ? 0 : offset < 0 ? 1 : -1);
	const coming = $derived(towards === 0 ? null : (stepTo(towards) ?? null));

	/**
	 * The track is as tall as what is on it, and what is on it is changing: a round of sixteen
	 * matches sliding onto the screen of a final has to bring its own height with it, or it arrives
	 * cut off and snaps open once it lands.
	 */
	const height = $derived.by(() => {
		if (coming === null || comingHigh === 0 || hereHigh === 0) return null;
		const progress = Math.min(1, Math.abs(offset) / span);
		return Math.round(hereHigh + (comingHigh - hereHigh) * progress);
	});

	/** A swipe off either end of the order pulls against a rubber band rather than dead stopping. */
	function damp(dx: number) {
		return stepTo(dx < 0 ? 1 : -1) === undefined ? dx * 0.25 : dx;
	}

	/**
	 * The chart is read by dragging across it, so the same drag cannot also turn the page: until it
	 * runs out of chart. Scrolled to either end and still going, the drag becomes the page's, after a
	 * few pixels of nothing so that arriving at the end is not the same as being taken off it.
	 */
	const EDGE_DEAD = 24;

	let chartScroller: HTMLElement | null = null;
	let pulling: { from: number; y: number } | null = null;

	function edgePull(node: HTMLElement, live: boolean) {
		const bind = () => {
			chartScroller = node;
			node.addEventListener('touchstart', chartStart, { passive: true });
			node.addEventListener('touchmove', chartMove, { passive: false });
			node.addEventListener('touchend', chartEnd);
			node.addEventListener('touchcancel', chartEnd);
		};
		const unbind = () => {
			if (chartScroller === node) chartScroller = null;
			node.removeEventListener('touchstart', chartStart);
			node.removeEventListener('touchmove', chartMove);
			node.removeEventListener('touchend', chartEnd);
			node.removeEventListener('touchcancel', chartEnd);
		};
		// The copy riding in beside the one being read is a picture of a chart, not a chart to read.
		let on = live;
		if (on) bind();
		return {
			update(next: boolean) {
				if (next === on) return;
				on = next;
				if (on) bind();
				else unbind();
			},
			destroy: unbind
		};
	}

	function chartStart(event: TouchEvent) {
		pulling = event.touches.length === 1 ? { from: NaN, y: event.touches[0].clientY } : null;
		duration = 0;
	}

	function chartMove(event: TouchEvent) {
		if (!pulling || !chartScroller) return;
		const touch = event.touches[0];
		const dx = touch.clientX - (Number.isNaN(pulling.from) ? touch.clientX : pulling.from);
		// A drag that is mostly down the page is the page being scrolled, and never a page turn.
		if (Math.abs(touch.clientY - pulling.y) > Math.abs(dx) * AXIS_BIAS && offset === 0) return;

		const room = chartScroller.scrollWidth - chartScroller.clientWidth;
		const spent =
			(chartScroller.scrollLeft >= room - 1 && touch.clientX < (pulling.from || touch.clientX)) ||
			(chartScroller.scrollLeft <= 1 && touch.clientX > (pulling.from || touch.clientX));
		if (Number.isNaN(pulling.from)) {
			// Where the chart ran out, which is where the page starts being dragged from.
			if (chartScroller.scrollLeft >= room - 1 || chartScroller.scrollLeft <= 1) pulling.from = touch.clientX;
			return;
		}
		if (!spent) {
			pulling.from = touch.clientX;
			offset = 0;
			return;
		}
		const past = dx - Math.sign(dx) * EDGE_DEAD;
		if (Math.sign(past) !== Math.sign(dx)) return;
		event.preventDefault();
		offset = damp(past);
	}

	function chartEnd() {
		const dragged = offset;
		pulling = null;
		if (dragged !== 0) release(dragged, false);
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

{#snippet chartPane(live: boolean)}
	<!--
		Turned over and its contents turned back, which puts the scrollbar above the chart rather than
		under it: a rule across the bottom of a phone reads as the end of the page, and this is the one
		thing here meant to be dragged sideways.
	-->
	<div class="-mx-4 scroll-flip overflow-x-auto px-4" data-noswipe use:edgePull={live}>
		<div>{@render chart()}</div>
	</div>
{/snippet}

{#snippet chart()}
			<div class="flex w-max items-stretch gap-3">
				{#each shown as one, index (one.title + index)}
					<div class="flex w-44 shrink-0 flex-col">
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
							<p class="flex items-center gap-1 break-words">
								{#if mine}
									<span class="shrink-0 text-brand-text"><Icon name="star" size={12} filled /></span>
								{/if}
								{entry.name || '—'}
							</p>
							{#if entry.club || entry.country}
								<p class="truncate text-xs text-muted">
									{entry.country?.name ?? clubName(entry.club ?? '', $ianseoFullClubNames)}
								</p>
							{/if}
						</div>
						{#if match.sets[side]?.length}
							<!-- What each set was shot for, which is the whole story of a match won 6 to 4. -->
							<div class="hidden shrink-0 gap-1 min-[380px]:flex">
								{#each match.sets[side] as value, at (at)}
									<span class="tabular w-7 rounded bg-line/40 py-0.5 text-center text-[11px] text-muted">
										{value}
									</span>
								{/each}
							</div>
						{/if}
						{#if drawn.target}
							<!--
								A target carries the target face beside it. `19D` in the column a score of `6` is
								drawn in reads as a score, and a match nobody has shot yet reading as a nineteen
								to nothing is the one thing a bracket must never say.
							-->
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
						{#if entry.name}
							<button
								class="shrink-0 rounded p-1 {mine ? 'text-brand-text' : 'text-muted/50'}"
								aria-pressed={mine}
								aria-label={mine
									? $t('ianseo.unfollowName', { name: entry.name })
									: $t('ianseo.followName', { name: entry.name })}
								onclick={() => onfollow('archer', entry.name)}
							>
								<Icon name="star" size={14} filled={mine} />
							</button>
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

	<!--
		Both views ride on one track, so a drag carries this one off and brings the next one on rather
		than replacing it once the finger is lifted. The same move as the swipe between the main pages
		of the app, and the same numbers behind it, because it is the same gesture.

		Tall enough to be worth swiping even on a final of two matches: the gesture is the page's, so
		the empty half of the screen under it has to answer to it as much as the cards do.
	-->
	<div
		class="relative min-h-[55dvh] overflow-hidden"
		data-noswipe
		bind:clientWidth={width}
		style={height === null ? '' : `height: ${height}px; transition: height ${duration}ms ${SNAP_EASE}`}
		use:swipe={{
			// The chart is read by dragging across it, so there the drag is handed over at its edges.
			enabled: () => !settling && at !== TREE,
			onMove: (dx) => {
				duration = 0;
				offset = damp(dx);
			},
			onEnd: release
		}}
	>
		<div
			class="space-y-2"
			bind:clientHeight={hereHigh}
			style="transform: translate3d({offset}px, 0, 0); transition: transform {duration}ms {SNAP_EASE}"
		>
			{#if at === TREE}
				{@render chartPane(true)}
			{:else}
				{@render cards(current)}
			{/if}
		</div>

		{#if coming !== null}
			<!-- Off to the side until the drag brings it in, and out of the flow so it sets no height. -->
			<div
				class="absolute inset-x-0 top-0 space-y-2"
				bind:clientHeight={comingHigh}
				style="transform: translate3d({towards * span + offset}px, 0, 0); transition: transform {duration}ms {SNAP_EASE}"
				inert
			>
				{#if coming === TREE}
					{@render chartPane(false)}
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
