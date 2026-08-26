<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { originOf, setPageUp } from '$lib/nav';
	import { defaultBoard, exercise, worked, type Board } from '$lib/domain/exercises';
	import Icon from '$lib/ui/Icon.svelte';
	import MovementFigure from '$lib/ui/MovementFigure.svelte';
	import MuscleBoard from '$lib/ui/MuscleBoard.svelte';
	import MuscleInsets from '$lib/ui/MuscleInsets.svelte';
	import MuscleMap from '$lib/ui/MuscleMap.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';

	/**
	 * One exercise: what to do, what it works, and where to start. The two diagrams answer different
	 * questions and are deliberately side by side with the words, rather than filling the screen the
	 way the anatomy page's do: here the drawing illustrates the instructions instead of being the page.
	 */
	const origin = $derived(originOf($page.url, '/exercises'));
	$effect(() => setPageUp(origin));

	const entry = $derived(exercise($page.params.key ?? ''));

	const VIEWS: Board[] = ['back', 'front', 'both', 'deep'];
	/**
	 * The diagram opens on the figure the exercise is actually drawn on, and is reset when the page
	 * moves to another exercise: a tab chosen for one exercise means nothing on the next.
	 */
	let view = $state<Board | null>(null);
	const board = $derived(view ?? (entry ? defaultBoard(entry) : 'both'));
	$effect(() => {
		$page.params.key;
		view = null;
	});

	let playing = $state(true);
	const muscles = $derived(entry ? worked(entry) : []);

	/** The parameters this exercise actually has, in the order a routine would ask for them. */
	const params = $derived<{ label: string; value: number; unit: 'plain' | 'seconds' | 'distance' }[]>(
		[
			{ label: 'sets', value: entry?.defaults.sets ?? 0, unit: 'plain' as const },
			{ label: 'reps', value: entry?.defaults.reps ?? 0, unit: 'plain' as const },
			{ label: 'hold', value: entry?.defaults.holdSeconds ?? 0, unit: 'seconds' as const },
			{ label: 'rest', value: entry?.defaults.restSeconds ?? 0, unit: 'seconds' as const },
			{ label: 'distance', value: entry?.defaults.distanceM ?? 0, unit: 'distance' as const }
		].filter((item) => item.value > 0)
	);
</script>

{#if !entry}
	<PageHeader motif="exercises" title={$t('exercises.title')} />
	<p class="p-4 text-sm text-muted">{$t('exercises.empty')}</p>
{:else}
	{@const name = $t(`exercises.item.${entry.key}.name`)}
	<PageHeader motif="exercises" title={name} subtitle={$t(`exercises.kit.${entry.kit}`)}>
		{#snippet lead()}
			<a href={origin} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
				<Icon name="back" size={22} />
			</a>
		{/snippet}
	</PageHeader>

	<div class="mx-auto w-full max-w-3xl space-y-4 p-4">
		<p class="text-sm leading-snug text-muted">{$t(`exercises.item.${entry.key}.summary`)}</p>

		{#if entry.caution}
			<section class="rounded-2xl border border-danger/40 bg-danger/10 p-4">
				<h2 class="mb-1 text-sm font-semibold">{$t('exercises.cautionTitle')}</h2>
				<p class="text-sm leading-snug">{$t(`exercises.item.${entry.key}.caution`)}</p>
			</section>
		{/if}

		<!-- The movement beside the words for it, so a step and its shape are read together. -->
		<section class="rounded-2xl border border-line bg-surface p-4">
			<div class="mb-2 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-muted">{$t('exercises.howTitle')}</h2>
				<button
					class="press rounded-lg border border-line px-3 py-1.5 text-sm font-medium"
					onclick={() => (playing = !playing)}
				>
					{playing ? $t('exercises.pause') : $t('exercises.play')}
				</button>
			</div>

			<div class="grid gap-4 sm:grid-cols-[minmax(0,7fr)_minmax(0,9fr)]">
				<div class="mx-auto w-full max-w-[15rem] sm:max-w-none">
					<MovementFigure movement={entry.movement} {playing} />
				</div>

				<ol class="space-y-2">
					{#each Array.from({ length: entry.steps }, (_, i) => i + 1) as step (step)}
						<li class="flex gap-2.5">
							<span
								class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-semibold text-brand-text"
							>
								{step}
							</span>
							<span class="text-sm leading-snug">
								{$t(`exercises.item.${entry.key}.step${step}`)}
							</span>
						</li>
					{/each}
				</ol>
			</div>
		</section>

		<!-- The body, beside the reading of it: a shape and a name for the same thing, at a glance. -->
		<section class="rounded-2xl border border-line bg-surface p-4">
			<h2 class="mb-2 text-sm font-semibold text-muted">{$t('exercises.worksTitle')}</h2>

			<div class="grid gap-4 sm:grid-cols-2">
				<div class="min-w-0">
					<div class="mb-2 flex gap-1">
						{#each VIEWS as choice (choice)}
							<button
								class="press flex-1 rounded-lg border py-1 text-xs
									{board === choice ? 'border-brand bg-brand/10 font-semibold' : 'border-line'}"
								onclick={() => (view = choice)}
							>
								{$t(`muscles.view.${choice}`)}
							</button>
						{/each}
					</div>

					<!-- Half a screen at most: the diagram illustrates the exercise, it is not the exercise. -->
					<div class="mx-auto max-w-[16rem]">
						{#if board === 'deep'}
							<MuscleInsets load={entry.load} />
						{:else if board === 'both'}
							<MuscleBoard load={entry.load} class="max-h-[40vh] w-full" />
						{:else}
							<MuscleMap view={board} load={entry.load} class="max-h-[40vh] w-full" />
						{/if}
					</div>
				</div>

				<ul class="space-y-1">
					{#each muscles as item (item.id)}
						<li class="flex items-center gap-2 rounded-lg bg-sunk px-2 py-1.5">
							<span class="flex shrink-0 gap-0.5" aria-label={$t(`muscles.load.${item.load}`)}>
								{#each [1, 2, 3] as pip (pip)}
									<span
										class="size-1.5 rounded-full {pip <= item.load ? 'bg-accent' : 'bg-surface'}"
									></span>
								{/each}
							</span>
							<span class="min-w-0 flex-1 truncate text-sm">{$t(`muscles.name.${item.id}`)}</span>
						</li>
					{/each}
				</ul>
			</div>
		</section>

		<div class="grid gap-4 sm:grid-cols-2">
			<!-- Named against the shot, because an exercise nobody can place in the shot gets skipped. -->
			<section class="rounded-2xl border border-line bg-surface p-4">
				<h2 class="mb-2 text-sm font-semibold text-muted">{$t('exercises.forTitle')}</h2>
				<div class="flex flex-wrap gap-1">
					{#each entry.phases as phase (phase)}
						<span class="rounded-lg border border-line px-2 py-1 text-xs">
							{$t(`muscles.phase.${phase}`)}
						</span>
					{/each}
				</div>
				<p class="mt-2 text-[11px] text-muted">{$t(`exercises.activity.${entry.activity}`)}</p>
			</section>

			<section class="rounded-2xl border border-line bg-surface p-4">
				<h2 class="mb-2 text-sm font-semibold text-muted">{$t('exercises.startTitle')}</h2>
				<dl class="grid grid-cols-2 gap-2">
					{#each params as item (item.label)}
						<div class="rounded-lg bg-sunk px-2 py-1.5">
							<dt class="text-[11px] text-muted">{$t(`exercises.${item.label}`)}</dt>
							<dd class="text-sm font-semibold">
								{#if item.unit === 'seconds'}
									{$t('exercises.seconds', { n: item.value })}
								{:else if item.unit === 'distance'}
									{item.value >= 1000
										? $t('exercises.kilometres', { n: item.value / 1000 })
										: $t('exercises.metres', { n: item.value })}
								{:else}
									{item.value}
								{/if}
							</dd>
						</div>
					{/each}
				</dl>
				<p class="mt-2 text-[11px] leading-snug text-muted">{$t('exercises.startLead')}</p>
			</section>
		</div>
	</div>
{/if}
