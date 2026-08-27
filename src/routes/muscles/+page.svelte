<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { originOf, setPageUp } from '$lib/nav';
	import {
		MUSCLES,
		SHOT_PHASES,
		loadAt,
		musclesInPhase,
		peakPhases,
		shotCoverage,
		toggleMuscle,
		type MuscleId,
		type MuscleView,
		type ShotPhase
	} from '$lib/domain/muscles';
	import Icon from '$lib/ui/Icon.svelte';
	import MuscleBoard from '$lib/ui/MuscleBoard.svelte';
	import MuscleInsets from '$lib/ui/MuscleInsets.svelte';
	import MuscleMap from '$lib/ui/MuscleMap.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import ShotFigure from '$lib/ui/ShotFigure.svelte';

	/**
	 * The muscle picker, on a page of its own so it can be tried before an exercise database is built
	 * around it. Everything an exercise will need to store is here already: which muscles it works,
	 * and which moment of the shot it works them for.
	 */
	const origin = $derived(originOf($page.url, '/'));
	$effect(() => setPageUp(origin));

	/** The figure on show. `both` is not a side of the body, so it is a choice of layout, not a view. */
	type Board = MuscleView | 'both';
	const VIEWS: Board[] = ['back', 'front', 'both', 'deep'];
	let view = $state<Board>('back');
	let phase = $state<ShotPhase | null>(null);
	let playing = $state(false);
	/** Whether the shot figure shows its muscles or the frame they pull on. */
	let bones = $state(false);
	let selected = $state<MuscleId[]>([]);

	const pick = (id: MuscleId) => (selected = toggleMuscle(selected, id));

	const working = $derived(phase ? musclesInPhase(phase) : []);
	const coverage = $derived(Math.round(shotCoverage(selected) * 100));

</script>

<PageHeader motif="session" title={$t('muscles.title')}>
	{#snippet lead()}
		<a href={origin} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-page space-y-4 p-4">
	<p class="text-sm text-muted">{$t('muscles.intro')}</p>

	<!-- The picker, first: it is what the page is for, and the shot below shades it in the same way. -->
	<section class="rounded-2xl border border-line bg-surface p-4">
		<div class="mb-3 flex gap-1">
			{#each VIEWS as entry (entry)}
				<button
					class="press flex-1 rounded-lg border py-1.5 text-sm
						{view === entry ? 'border-brand bg-brand/10 font-semibold' : 'border-line'}"
					onclick={() => (view = entry)}
				>
					{$t(`muscles.view.${entry}`)}
				</button>
			{/each}
		</div>

		{#if view === 'deep'}
			<h3 class="mb-2 text-sm font-semibold">{$t('muscles.deepTitle')}</h3>
			<MuscleInsets {selected} {phase} onpick={pick} />
		{:else if view === 'both'}
			<MuscleBoard {selected} {phase} onpick={pick} />
		{:else}
			<div class="mx-auto max-w-xs">
				<MuscleMap {view} {selected} {phase} onpick={pick} />
			</div>
		{/if}
	</section>

	<!-- What an exercise would actually be saved with. -->
	<section class="rounded-2xl border border-line bg-surface p-4">
		<div class="mb-2 flex items-center justify-between">
			<h2 class="text-sm font-semibold text-muted">{$t('muscles.selection')}</h2>
			{#if selected.length > 0}
				<button class="text-sm font-medium text-brand-text" onclick={() => (selected = [])}>
					{$t('muscles.clear')}
				</button>
			{/if}
		</div>

		{#if selected.length === 0}
			<p class="text-sm text-muted">{$t('muscles.selectionEmpty')}</p>
		{:else}
			<p class="mb-2 text-sm text-muted">{$t('muscles.coverage', { percent: coverage })}</p>
			<ul class="space-y-1">
				{#each selected as id (id)}
					{@const entry = MUSCLES.find((m) => m.id === id)!}
					<li class="flex items-center gap-2 rounded-lg bg-sunk px-2 py-1.5">
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm font-medium">{$t(`muscles.name.${id}`)}</span>
							<span class="block text-[11px] text-muted">
								{$t(`muscles.role.${entry.role}`)}
								·
								{$t('muscles.peak', {
									phase: $t(`muscles.phase.${peakPhases(id)[0]}`).toLowerCase()
								})}
							</span>
						</span>
						<button
							class="shrink-0 text-muted"
							aria-label={$t('common.delete')}
							onclick={() => pick(id)}
						>
							<Icon name="close" size={16} />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- The shot. Scrubbing it shades the body above, so the two figures always say the same thing. -->
	<section class="rounded-2xl border border-line bg-surface p-4">
		<div class="mb-2 flex items-center justify-between">
			<h2 class="text-sm font-semibold text-muted">{$t('muscles.phaseTitle')}</h2>
			<div class="flex gap-2">
				<!-- Two readings of one body: what pulls, and what it pulls on. -->
				<div class="flex overflow-hidden rounded-lg border border-line text-sm">
					{#each [false, true] as choice (choice)}
						<button
							class="px-2.5 py-1.5 {bones === choice ? 'bg-brand/10 font-semibold' : ''}"
							onclick={() => (bones = choice)}
						>
							{choice ? $t('muscles.bones') : $t('muscles.title')}
						</button>
					{/each}
				</div>
				<button
					class="press rounded-lg border border-line px-3 py-1.5 text-sm font-medium"
					onclick={() => (playing = !playing)}
				>
					{playing ? $t('muscles.pause') : $t('muscles.play')}
				</button>
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<ShotFigure {phase} {playing} {bones} />

			<div class="min-w-0">
				<!-- The phases as a strip: it is a sequence, so it is read left to right and tapped along. -->
				<div class="flex flex-wrap gap-1">
					<!-- Nothing chosen comes first and is where the page starts: with the whole body quiet,
						 tapping a muscle is a way of asking its name rather than a change to a diagram. -->
					{#each [null, ...SHOT_PHASES] as entry (entry ?? 'none')}
						<button
							class="press rounded-lg border px-2 py-1 text-[11px] leading-tight
								{phase === entry && !playing
								? 'border-brand bg-brand/10 font-semibold'
								: 'border-line'}"
							onclick={() => {
								playing = false;
								phase = entry;
							}}
						>
							{entry ? $t(`muscles.phase.${entry}`) : $t('muscles.phase.none')}
						</button>
					{/each}
				</div>

				{#if bones}
					<p class="mt-3 text-xs text-muted">{$t('muscles.bonesHint')}</p>
				{/if}
				<h3 class="mt-3 text-xs font-semibold text-muted">{$t('muscles.working')}</h3>
				{#if working.length === 0}
					<p class="text-xs text-muted">
						{phase ? $t('muscles.nothingWorking') : $t('muscles.pickAPhase')}
					</p>
				{:else}
					<ul class="mt-1 space-y-0.5">
						{#each working as entry (entry.id)}
							<li class="flex items-center gap-2 text-xs">
								<!-- Three pips rather than a word: the load is a quantity and reads faster as one. -->
								<span class="flex shrink-0 gap-0.5" aria-label={$t(`muscles.load.${entry.load}`)}>
									{#each [1, 2, 3] as pip (pip)}
										<span
											class="size-1.5 rounded-full {pip <= entry.load
												? 'bg-accent'
												: 'bg-sunk'}"
										></span>
									{/each}
								</span>
								<span class="min-w-0 truncate">{$t(`muscles.name.${entry.id}`)}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</section>

	<!--
		The real thing, for the times a stylised map is not enough. The plate is a century old and out
		of copyright, and it shows what a drawing built for tapping cannot: the trapezius peeled back
		on one side so the rhomboids and the cuff underneath are visible on the other.
	-->
	<section class="rounded-2xl border border-line bg-surface p-4">
		<h2 class="mb-2 text-sm font-semibold text-muted">{$t('muscles.plateTitle')}</h2>
		<figure>
			<img
				src="/diagrams/back_anatomy.png"
				alt={$t('muscles.plateAlt')}
				loading="lazy"
				class="mx-auto w-full max-w-sm rounded-lg"
			/>
			<figcaption class="mt-2 text-[11px] leading-tight text-muted">
				{$t('muscles.plateCaption')}
			</figcaption>
		</figure>
	</section>

	<!-- Every muscle, in one list, for the times a name is quicker to find than a shape. -->
	<section class="rounded-2xl border border-line bg-surface p-4">
		<ul class="grid gap-1 sm:grid-cols-2">
			{#each MUSCLES as entry (entry.id)}
				<li>
					<button
						class="press flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left
							{selected.includes(entry.id) ? 'border-brand bg-brand/10' : 'border-line'}"
						onclick={() => pick(entry.id)}
					>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm">{$t(`muscles.name.${entry.id}`)}</span>
							<span class="block text-[11px] text-muted">
								{$t(`muscles.roleShort.${entry.role}`)}
								{#if entry.side}· {$t(`muscles.side.${entry.side}`)}{/if}
							</span>
						</span>
						{#if phase && loadAt(phase, entry.id) > 0}
							<span class="shrink-0 text-[11px] font-semibold text-accent">
								{loadAt(phase!, entry.id)}
							</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	</section>
</div>
