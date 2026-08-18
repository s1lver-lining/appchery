<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import MovementFigure from '$lib/ui/MovementFigure.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import TargetFace from '$lib/ui/TargetFace.svelte';
	import TuningDiagram from '$lib/ui/TuningDiagram.svelte';
	import OpenApp from '../lib/OpenApp.svelte';
	import Phone from '../lib/Phone.svelte';
	import { END_SHOTS, SAMPLE_EXERCISE, SCORE_SET, SESSION } from '../lib/sample';

	/**
	 * The outing, working rather than pictured: the training count really counts, the total and the
	 * goal bar follow it, and every row opens the screen it stands for. A visitor who taps it has
	 * used the app, which is a stronger claim than any sentence beside it.
	 */
	let training = $state(SESSION.trainingArrows);
	/** Which activity is open, by its index, or the outing itself. */
	let open = $state<number | null>(null);

	const arrows = $derived(SESSION.roundArrows + training);
	const done = $derived(Math.min(1, arrows / SESSION.goal));
	const activity = $derived(open === null ? null : SESSION.activities[open]);

	const count = (step: number) => (training = Math.max(0, training + step));
	const titleOf = (index: number) => {
		const entry = SESSION.activities[index];
		return entry.titleKey ? $t(entry.titleKey) : (entry.title ?? '');
	};
</script>

<section class="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
	<div>
		<h1 class="text-4xl leading-[1.1] font-black tracking-tight text-balance sm:text-5xl">
			{$t('site.hero.title')}
		</h1>
		<p class="mt-5 max-w-xl text-lg text-muted">{$t('site.hero.body')}</p>

		<div class="mt-8 flex flex-wrap items-center gap-4">
			<OpenApp size="lg" />
			<span class="text-sm text-muted">app.appchery.com</span>
		</div>

		<ul class="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
			{#each [['star', 'site.hero.free'], ['cloud', 'site.hero.offline']] as [icon, key] (key)}
				<li class="flex items-center gap-2 text-muted">
					<Icon name={icon as 'star'} size={16} />
					{$t(key)}
				</li>
			{/each}
		</ul>
	</div>

	<div>
		<!-- The header is brand tinted, so the bar above it takes the same tint: a pale strip over a
			coloured header reads as a gap in the phone rather than as its top edge. -->
		<Phone label={$t('site.hero.session')} bar="bg-brand/10">
			<div class="flex h-full flex-col overflow-y-auto bg-bg text-[13px]">
				{#if activity === null}
					<PageHeader motif="session" subtitle={$t('site.sample.when')}>
						{#snippet lead()}
							<!-- The arrow and the name share a line: a title dropped under the arrow leaves the
								header a row taller than the app's own, which is the one thing that gives it away. -->
							<div class="flex items-center gap-2">
								<span class="inline-flex text-muted"><Icon name="back" size={18} /></span>
								<p class="text-xl font-bold tracking-tight">{$t('site.sample.place')}</p>
							</div>
						{/snippet}
					</PageHeader>

					<div class="space-y-2.5 p-3">
						<div class="grid grid-cols-3 gap-2.5">
							<section class="col-span-2 rounded-xl border border-line bg-surface p-2.5">
								<div class="flex items-end justify-between gap-2">
									<p class="tabular text-2xl leading-none font-bold text-brand-text">{arrows}</p>
									<span class="tabular text-xs font-semibold text-muted">/ {SESSION.goal}</span>
								</div>
								<p class="mt-1 text-[11px] text-muted">
									{$t('session.arrowsShot')},
									{done >= 1
										? $t('session.goalReached')
										: $t('session.goalLeft', { n: SESSION.goal - arrows })}
								</p>
								<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-sunk">
									<div
										class="h-full rounded-full transition-[width] duration-500 {done >= 1
											? 'bg-accent'
											: 'bg-brand'}"
										style="width: {done * 100}%"
									></div>
								</div>
							</section>

							<section
								class="flex flex-col items-center justify-center rounded-xl border border-line bg-surface p-2 text-center"
							>
								<div class="flex items-center gap-1">
									<Icon name="cloud" size={20} />
									<p class="tabular text-xs font-semibold">{SESSION.temperature}</p>
								</div>
								<p class="tabular text-[10px] text-muted">{SESSION.wind}</p>
								<p class="mt-0.5 w-full truncate text-[10px] text-muted">{$t('site.sample.place')}</p>
							</section>
						</div>

						<!-- Warm ups and form work, counted the way the app counts them: by tapping. -->
						<section
							class="flex items-center justify-between rounded-xl border border-line bg-surface p-2.5"
						>
							<div>
								<p class="tabular text-lg leading-none font-bold">{training}</p>
								<p class="mt-1 text-[11px] text-muted">{$t('session.trainingArrows')}</p>
							</div>
							<div class="flex items-center gap-1">
								<button
									class="rounded-md border border-line px-2 py-1 text-xs font-semibold disabled:opacity-30"
									disabled={training === 0}
									aria-label={$t('session.oneLess')}
									onclick={() => count(-1)}
								>
									−
								</button>
								{#each [1, 3, 6] as step (step)}
									<button
										class="tabular rounded-md border border-line px-2 py-1 text-xs font-medium"
										onclick={() => count(step)}
									>
										+{step}
									</button>
								{/each}
							</div>
						</section>

						<ul class="space-y-1.5">
							{#each SESSION.activities as entry, i (entry.titleKey ?? entry.title)}
								<li>
									<button
										class="flex w-full items-center gap-2 rounded-xl border border-line bg-surface p-2 text-left"
										onclick={() => (open = i)}
									>
										<span class="h-8 w-8 shrink-0">
											{#if entry.kind === 'scoring'}
												<TargetFace scoreSet={SCORE_SET} />
											{:else if entry.diagram}
												<!-- The drawing of the test itself, in the dark tile the session list gives it. -->
												<span
													class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border"
													style="background: color-mix(in srgb, var(--color-ink) 82%, var(--color-brand));
														border-color: color-mix(in srgb, var(--color-ink) 45%, var(--color-line))"
												>
													<TuningDiagram name={entry.diagram} tone="inverted" />
												</span>
											{:else}
												<span
													class="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-sunk text-muted"
												>
													<Icon name={entry.icon} size={16} />
												</span>
											{/if}
										</span>
										<span class="min-w-0 flex-1">
											<span class="block truncate font-medium">{titleOf(i)}</span>
											<span class="block truncate text-[11px] text-muted">
												{entry.detailKey ? $t(entry.detailKey) : entry.detail}
											</span>
										</span>
										{#if entry.score}
											<span class="tabular text-lg font-bold">{entry.score}</span>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{:else}
					<!-- One activity, opened. The back arrow works, which is the whole point of the row
						being a button: a visitor can look inside and get out again. -->
					<PageHeader motif={activity.kind === 'scoring' ? 'sessions' : 'exercises'}>
						{#snippet lead()}
							<div class="flex items-center gap-2">
								<button class="inline-flex text-muted" aria-label={$t('common.back')} onclick={() => (open = null)}>
									<Icon name="back" size={18} />
								</button>
								<p class="truncate text-xl font-bold tracking-tight">{titleOf(open!)}</p>
							</div>
						{/snippet}
					</PageHeader>

					<div class="space-y-2.5 p-3">
						{#if activity.kind === 'scoring'}
							<div class="rounded-xl border border-line bg-surface p-3">
								<TargetFace scoreSet={SCORE_SET} shots={END_SHOTS} showPerimeter showCentreDefault />
							</div>
							<div class="flex items-center gap-1">
								{#each END_SHOTS as shot (shot.ordinal)}
									<span
										class="tabular flex-1 rounded-md bg-sunk py-1.5 text-center font-semibold"
									>
										{shot.zoneLabel}
									</span>
								{/each}
							</div>
							<div class="flex items-baseline justify-between rounded-xl border border-line bg-surface px-3 py-2">
								<span class="text-[11px] text-muted">{$t('site.sample.end')}</span>
								<span class="tabular text-xl font-black">{activity.score}</span>
							</div>
						{:else if activity.diagram}
							<div class="rounded-xl border border-line bg-surface p-4">
								<TuningDiagram name={activity.diagram} />
							</div>
							<dl class="grid grid-cols-2 gap-2">
								{#each SESSION.tuning.rows as row (row.labelKey)}
									<div class="rounded-xl border border-line bg-surface p-2.5">
										<dt class="text-[11px] text-muted">{$t(row.labelKey)}</dt>
										<dd class="tabular font-bold">{row.value}</dd>
									</div>
								{/each}
							</dl>
							<div class="rounded-xl border border-line bg-surface p-3">
								<p class="tabular text-2xl leading-none font-bold text-brand-text">
									{SESSION.tuning.ratio}
									<span class="text-sm font-medium text-muted">{$t('ratio.unit')}</span>
								</p>
								<p class="mt-1.5 text-[11px] text-muted">{$t(SESSION.tuning.verdictKey)}</p>
							</div>
						{:else if activity.icon === 'exercise'}
							<div class="rounded-xl border border-line bg-surface p-2">
								<MovementFigure movement={SAMPLE_EXERCISE.movement} class="max-h-40 w-full" />
							</div>
							<ul class="space-y-1.5">
								{#each [1, 2, 3] as set (set)}
									<li
										class="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2"
									>
										<span class="font-medium">{$t('strength.setNumber', { n: set })}</span>
										<span class="tabular text-muted">15 {$t('exercises.measure.reps')}</span>
										<span class="text-brand-text"><Icon name="check" size={16} /></span>
									</li>
								{/each}
							</ul>
						{:else}
							<dl class="grid grid-cols-2 gap-2">
								{#each SESSION.run as row (row.labelKey)}
									<div class="rounded-xl border border-line bg-surface p-3">
										<dt class="text-[11px] text-muted">{$t(row.labelKey)}</dt>
										<dd class="tabular text-lg font-bold">
											{row.valueKey ? $t(row.valueKey) : row.value}
										</dd>
									</div>
								{/each}
							</dl>
						{/if}
					</div>
				{/if}
			</div>
		</Phone>

		<p class="mt-3 text-center text-xs text-muted">{$t('site.hero.try')}</p>
	</div>
</section>
