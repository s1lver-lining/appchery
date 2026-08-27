<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { originOf, setPageUp, withOrigin } from '$lib/nav';
	import { EXERCISES, KITS, byKit, primary, type ExerciseKit } from '$lib/domain/exercises';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';

	/**
	 * The exercise library. Every card says the three things that decide whether an exercise is the
	 * one to open: what it is for, what it needs, and what it is counted in.
	 */
	const origin = $derived(originOf($page.url, '/'));
	$effect(() => setPageUp(origin));

	let kit = $state<ExerciseKit | null>(null);
	const shown = $derived(byKit(kit));

	/** How many of the catalogue each chip would leave, so a chip that empties the list says so. */
	const counts = $derived(
		Object.fromEntries(KITS.map((entry) => [entry, byKit(entry).length])) as Record<
			ExerciseKit,
			number
		>
	);
</script>

<PageHeader motif="exercises" title={$t('exercises.title')}>
	{#snippet lead()}
		<a href={origin} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-page space-y-4 p-4">
	<p class="text-sm text-muted">{$t('exercises.intro')}</p>

	<!-- Filtered by what the archer has to hand, which is the question asked before any other. -->
	<div class="flex flex-wrap gap-1.5">
		<button
			class="press rounded-full border px-3 py-1.5 text-sm
				{kit === null ? 'border-brand bg-brand/10 font-semibold' : 'border-line'}"
			onclick={() => (kit = null)}
		>
			{$t('exercises.all')}
			<span class="text-muted">{EXERCISES.length}</span>
		</button>
		{#each KITS as entry (entry)}
			<button
				class="press rounded-full border px-3 py-1.5 text-sm
					{kit === entry ? 'border-brand bg-brand/10 font-semibold' : 'border-line'}"
				onclick={() => (kit = kit === entry ? null : entry)}
			>
				{$t(`exercises.kit.${entry}`)}
				<span class="text-muted">{counts[entry]}</span>
			</button>
		{/each}
	</div>

	{#if shown.length === 0}
		<p class="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
			{$t('exercises.empty')}
		</p>
	{:else}
		<ul class="grid gap-3 sm:grid-cols-2">
			{#each shown as entry (entry.key)}
				<li>
					<a
						href={withOrigin(`/exercises/${entry.key}`, '/exercises')}
						class="press flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4"
					>
						<div class="flex items-start justify-between gap-2">
							<h2 class="font-semibold">{$t(`exercises.item.${entry.key}.name`)}</h2>
							<span class="shrink-0 rounded-full bg-sunk px-2 py-0.5 text-[11px] text-muted">
								{$t(`exercises.kit.${entry.kit}`)}
							</span>
						</div>

						<p class="flex-1 text-sm leading-snug text-muted">
							{$t(`exercises.item.${entry.key}.summary`)}
						</p>

						<!-- What it is for, said in muscles: the reason to pick this one over the next. -->
						<div class="flex flex-wrap gap-1">
							{#each primary(entry) as id (id)}
								<span class="rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent">
									{$t(`muscles.name.${id}`)}
								</span>
							{/each}
						</div>

						<p class="text-[11px] text-muted">
							{$t(`exercises.measure.${entry.measure}`)}
							·
							{$t(`exercises.level.${entry.level}`)}
						</p>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
