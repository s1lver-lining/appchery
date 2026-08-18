<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import TargetFace from '$lib/ui/TargetFace.svelte';
	import TuningDiagram from '$lib/ui/TuningDiagram.svelte';
	import OpenApp from '../lib/OpenApp.svelte';
	import Phone from '../lib/Phone.svelte';
	import { SESSION, SCORE_SET } from '../lib/sample';

	const done = Math.min(1, SESSION.arrows / SESSION.goal);
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

	<!--
		An outing as the app really lays one out: what was shot against what was meant to be shot, the
		weather it was shot in, the arrows that belong to no round, and everything done that day in the
		order it was done. Built from the app's own header and target faces rather than drawn to look
		like them.
	-->
	<!-- The header is brand tinted, so the bar above it takes the same tint: a pale strip over a
		coloured header reads as a gap in the phone rather than as its top edge. -->
	<Phone label={$t('site.hero.session')} bar="bg-brand/10">
		<div class="flex h-full flex-col bg-bg text-[13px]">
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
							<p class="tabular text-2xl leading-none font-bold text-brand-text">{SESSION.arrows}</p>
							<span class="tabular text-xs font-semibold text-muted">/ {SESSION.goal}</span>
						</div>
						<p class="mt-1 text-[11px] text-muted">
							{$t('session.arrowsShot')}, {$t('session.goalLeft', { n: SESSION.goal - SESSION.arrows })}
						</p>
						<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-sunk">
							<div class="h-full rounded-full bg-brand" style="width: {done * 100}%"></div>
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

				<section class="flex items-center justify-between rounded-xl border border-line bg-surface p-2.5">
					<div>
						<p class="tabular text-lg leading-none font-bold">{SESSION.trainingArrows}</p>
						<p class="mt-1 text-[11px] text-muted">{$t('session.trainingArrows')}</p>
					</div>
					<div class="flex items-center gap-1">
						<span class="rounded-md border border-line px-2 py-1 text-xs font-semibold">−</span>
						{#each [1, 3, 6] as step (step)}
							<span class="tabular rounded-md border border-line px-2 py-1 text-xs font-medium">
								+{step}
							</span>
						{/each}
						<span class="rounded-md bg-brand px-2 py-1 text-brand-ink"><Icon name="plus" size={13} /></span>
					</div>
				</section>

				<ul class="space-y-1.5">
					{#each SESSION.activities as activity (activity.titleKey ?? activity.title)}
						<li class="flex items-center gap-2 rounded-xl border border-line bg-surface p-2">
							<span class="h-8 w-8 shrink-0">
								{#if activity.kind === 'scoring'}
									<TargetFace scoreSet={SCORE_SET} />
								{:else if activity.diagram}
									<!-- The drawing of the test itself, in the dark tile the session list gives it. -->
									<span
										class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border"
										style="background: color-mix(in srgb, var(--color-ink) 82%, var(--color-brand));
											border-color: color-mix(in srgb, var(--color-ink) 45%, var(--color-line))"
									>
										<TuningDiagram name={activity.diagram} tone="inverted" />
									</span>
								{:else}
									<span
										class="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-sunk text-muted"
									>
										<Icon name={activity.icon} size={16} />
									</span>
								{/if}
							</span>
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium">
									{activity.titleKey ? $t(activity.titleKey) : activity.title}
								</p>
								<p class="truncate text-[11px] text-muted">
									{activity.detailKey ? $t(activity.detailKey) : activity.detail}
								</p>
							</div>
							{#if activity.score}
								<span class="tabular text-lg font-bold">{activity.score}</span>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</Phone>
</section>
