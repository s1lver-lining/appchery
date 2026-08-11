<script lang="ts">
	import { goto } from '$app/navigation';
	import { t, locale } from '$lib/i18n';
	import { stepsFor, stepText, type GuideBow, type GuideStep } from '$lib/domain/tuning/guide';
	import { getTemplate } from '$lib/domain/tuning/templates';
	import { startOfDay } from '$lib/domain/dates';
	import { defaultBowId } from '$lib/prefs';
	import {
		listBows,
		listSessions,
		createSession,
		createTuningActivity,
		type BowRow
	} from '$lib/db/repository';
	import { originOf, registerBackGuard, setPageUp } from '$lib/nav';
	import { page } from '$app/stores';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import TabDeck from '$lib/ui/TabDeck.svelte';
	import TuningDiagram from '$lib/ui/TuningDiagram.svelte';

	// Reached from the settings page and from a bow, so back goes wherever the link came from.
	const origin = $derived(originOf($page.url, '/settings'));
	$effect(() => setPageUp(origin));

	let bow = $state<'recurve' | 'compound'>('recurve');
	let open = $state<GuideStep | null>(null);
	let bows = $state<BowRow[]>([]);
	let starting = $state(false);

	$effect(() => {
		listBows().then((rows) => (bows = rows));
	});

	/** The step sheet is a page in its own right to the archer, so the back key closes it first. */
	$effect(() => {
		if (!open) return;
		return registerBackGuard(() => {
			open = null;
			return true;
		});
	});

	const TABS = $derived([
		{ key: 'recurve' as const, label: $t('bow.recurve') },
		{ key: 'compound' as const, label: $t('bow.compound') }
	]);

	const text = $derived((key: string) => stepText(key, $locale));
	const openText = $derived(open ? text(open.key) : null);

	/** The bow a tuning started from here belongs to: the default one, or the only one recorded. */
	const target = $derived(bows.find((row) => row.id === $defaultBowId) ?? (bows.length === 1 ? bows[0] : undefined));

	/**
	 * Started the way the bow page starts one: joined to today's session for that bow when there is
	 * one, so a morning of tuning stays a single outing rather than one session per procedure.
	 */
	async function startTuning(templateKey: string) {
		if (!target || starting) return;
		starting = true;
		const sessions = await listSessions();
		const today = startOfDay(Date.now());
		const existing = sessions.find((s) => s.bowId === target.id && startOfDay(s.startedAt) === today);
		const sessionId = existing?.id ?? (await createSession({ bowId: target.id, label: target.name }));
		goto(`/activities/${await createTuningActivity(sessionId, templateKey)}`);
	}

	const list = $derived((which: GuideBow) => stepsFor(which));
</script>

<PageHeader motif="bow" title={$t('tuning.guideTitle')}>
	{#snippet lead()}
		<a href={origin} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-2xl p-4">
	<p class="mb-3 text-sm text-muted">{$t('tuning.guideHint')}</p>

	<TabDeck tabs={TABS} bind:value={bow} paneClass="space-y-2 pt-4">
		{#snippet pane(key)}
			<!-- Numbered because the order is the content: every step assumes the ones above it. -->
			<ol class="space-y-2">
				{#each list(key) as step, i (step.key)}
					{@const step_text = text(step.key)}
					<li>
						<button
							class="flex w-full items-start gap-3 rounded-xl border border-line bg-surface p-3 text-left"
							onclick={() => (open = step)}
						>
							<span
								class="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-brand-text"
							>
								{i + 1}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block font-semibold">{step_text.title}</span>
								<span class="mt-0.5 block text-xs text-muted">{step_text.why}</span>
							</span>
							<span class="shrink-0 rotate-180 text-muted"><Icon name="back" size={18} /></span>
						</button>
					</li>
				{/each}
			</ol>

			{#if key === 'recurve'}
				<!-- Where the recurve order comes from, since it is somebody else's work to have set it out. -->
				<p class="px-1 pt-2 text-xs text-muted">{$t('tuning.guideCredit')}</p>
			{/if}
		{/snippet}
	</TabDeck>
</div>

{#if open && openText}
	{@const template = open.templateKey ? getTemplate(open.templateKey) : undefined}
	<div class="fixed inset-0 z-50 flex flex-col bg-bg">
		<header class="safe-top flex items-center gap-2 border-b border-line px-4 py-3 pt-6">
			<h2 class="min-w-0 flex-1 truncate text-lg font-bold">{openText.title}</h2>
			<button class="text-muted" aria-label={$t('common.close')} onclick={() => (open = null)}>
				<Icon name="close" size={22} />
			</button>
		</header>

		<div class="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto p-4">
			<p class="text-[15px] leading-relaxed">{openText.why}</p>

			{#if open.diagram}
				<div class="rounded-xl border border-line bg-surface p-3">
					<TuningDiagram name={open.diagram} />
				</div>
			{/if}

			<section class="rounded-xl border border-line bg-surface p-4">
				<h3 class="mb-2 text-sm font-semibold">{$t('tuning.steps')}</h3>
				<ol class="list-decimal space-y-1.5 pl-5 text-sm">
					{#each openText.steps as line (line)}
						<li>{line}</li>
					{/each}
				</ol>
			</section>

			<section class="rounded-xl border border-line bg-surface p-4">
				<h3 class="mb-2 text-sm font-semibold">{$t('tuning.interpretation')}</h3>
				<ul class="space-y-2 text-sm">
					{#each openText.results as row (row.observation)}
						<li>
							<span class="font-medium">{row.observation}</span>
							<span class="block text-muted">{row.suggests}</span>
						</li>
					{/each}
				</ul>
			</section>

			{#if template}
				<button
					class="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-brand-ink disabled:opacity-50"
					disabled={!target || starting}
					onclick={() => startTuning(template.key)}
				>
					<Icon name="wrench" size={18} />
					{$t('tuning.startNamed', { name: template.name })}
				</button>
				{#if !target}
					<p class="text-center text-xs text-muted">{$t('tuning.needBow')}</p>
				{/if}
			{/if}
		</div>
	</div>
{/if}
