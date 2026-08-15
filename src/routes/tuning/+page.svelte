<script lang="ts">
	import { goto } from '$app/navigation';
	import { t, locale } from '$lib/i18n';
	import {
		groupsFor,
		stepText,
		HANDED_DIAGRAMS,
		HANDED_STEPS,
		type GuideBow,
		type GuideStep
	} from '$lib/domain/tuning/guide';
	import { getTemplate } from '$lib/domain/tuning/templates';
	import { startOfDay } from '$lib/domain/dates';
	import { bowHand, defaultBowId } from '$lib/prefs';
	import {
		listBows,
		currentRevision,
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
	import BraceHeightTable from '$lib/ui/BraceHeightTable.svelte';
	import BraceCurves from '$lib/ui/BraceCurves.svelte';
	import WeightRatio from '$lib/ui/WeightRatio.svelte';
	import { ownsStatusBar } from '$lib/ui/statusBar';

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

	const text = $derived((key: string) => stepText(key, $locale, hand ?? 'right'));

	/**
	 * Which hand the diagrams are drawn for. Taken from the default bow when it says, and the
	 * archer's from the moment they touch the switch: a coach reading the page next to a left handed
	 * pupil needs the other picture without changing anybody's bow.
	 */
	let hand = $state<'right' | 'left' | null>(null);
	$effect(() => {
		if (hand !== null) return;
		// The bow on record answers for itself; failing that, whatever the archer said last time.
		if (!target) {
			if ($bowHand === 'left' || $bowHand === 'right') hand = $bowHand;
			return;
		}
		currentRevision(target.id).then((revision) => {
			if (hand !== null) return;
			const settings = revision ? JSON.parse(revision.settings) : {};
			if (settings.handedness === 'Left') hand = 'left';
			else if (settings.handedness === 'Right') hand = 'right';
			else if ($bowHand === 'left' || $bowHand === 'right') hand = $bowHand;
		});
	});

	/** Both switches move the one value, so a step never shows a picture and a table that disagree. */
	function chooseHand(value: 'right' | 'left') {
		hand = value;
		bowHand.set(value);
	}

	/**
	 * Nothing on record says which hand this is, and the step being opened reads backwards for the
	 * wrong one. Asked once, then remembered: guessing here is worse than a question.
	 */
	const mustAsk = $derived(
		hand === null && open !== null && (HANDED_STEPS.includes(open.key) || (open.diagram !== undefined && HANDED_DIAGRAMS.includes(open.diagram)))
	);

	/**
	 * What was typed into the step's calculator while reading. Kept in the page rather than written
	 * anywhere: the guide is a reading list, and a figure worth keeping belongs to the procedure.
	 */
	let scratch = $state<{ massGrams: number | null; drawWeightLb: number | null; unit: 'kg' | 'lb' }>(
		{ massGrams: null, drawWeightLb: null, unit: 'kg' }
	);
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

	/**
	 * The shape the test makes when it is going right, drawn with the same chart the procedure fills
	 * in for real: both curves peak on the brace height to keep. Figures invented to draw the shape,
	 * which is the only thing the reader is meant to take from it.
	 */
	const EXAMPLE_CURVE = [
		{ braceCm: 22.4, centreCm: -3.5, spreadCm: 14.5, arrows: 6 },
		{ braceCm: 22.7, centreCm: -0.5, spreadCm: 10.5, arrows: 6 },
		{ braceCm: 23, centreCm: 2, spreadCm: 7.5, arrows: 6 },
		{ braceCm: 23.4, centreCm: 4.5, spreadCm: 5, arrows: 6 },
		{ braceCm: 23.7, centreCm: 1.5, spreadCm: 9, arrows: 6 },
		{ braceCm: 24, centreCm: -2.5, spreadCm: 13, arrows: 6 }
	];

	const list = $derived((which: GuideBow) => groupsFor(which));

	/** Where a step falls in the whole list, so a heading does not restart the count. */
	function numberOf(groups: { steps: GuideStep[] }[], step: GuideStep) {
		return groups.flatMap((group) => group.steps).indexOf(step) + 1;
	}
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

	<!--
		Not swipeable: the recurve list and the compound one are long, and a sideways drag while
		scrolling a list of steps swaps the whole bow underneath the reader.
	-->
	<TabDeck tabs={TABS} bind:value={bow} paneClass="space-y-2 pt-4" swipeable={false}>
		{#snippet pane(key)}
			<!--
				Numbered because the order is the content: every step assumes the ones above it. The
				headings only say what kind of work a run of steps is, so the numbering runs straight
				through them rather than restarting under each one.
			-->
			{@const groups = list(key)}
			<div class="space-y-5">
				{#each groups as group, g (group.category ?? g)}
					<section>
						{#if group.category}
							<h3 class="mb-2 text-sm font-semibold text-muted">
								{$t(`tuning.guideCategory.${group.category}`)}
							</h3>
						{/if}
						<ol class="space-y-2">
							{#each group.steps as step (step.key)}
								{@const step_text = text(step.key)}
								<li>
									<button
										class="flex w-full items-start gap-3 rounded-xl border border-line bg-surface p-3 text-left"
										onclick={() => (open = step)}
									>
										<span
											class="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-brand-text"
										>
											{numberOf(groups, step)}
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
					</section>
				{/each}
			</div>

			{#if key === 'recurve'}
				<!-- Where the recurve order comes from, since it is somebody else's work to have set it out. -->
				<p class="px-1 pt-2 text-xs text-muted">{$t('tuning.guideCredit')}</p>
			{/if}
		{/snippet}
	</TabDeck>
</div>

{#if open && openText}
	{@const template = open.templateKey ? getTemplate(open.templateKey) : undefined}
	<div class="fixed inset-0 z-50 flex flex-col bg-bg" use:ownsStatusBar>
		<header class="safe-top flex items-center gap-2 border-b border-line px-4 py-3 pt-6">
			<h2 class="min-w-0 flex-1 truncate text-lg font-bold">{openText.title}</h2>
			<button class="text-muted" aria-label={$t('common.close')} onclick={() => (open = null)}>
				<Icon name="close" size={22} />
			</button>
		</header>

		<div class="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto p-4">
			<p class="text-[15px] leading-relaxed">{openText.why}</p>

			{#if mustAsk}
				<!-- Asked, not guessed: half of what follows reads backwards on the other bow. -->
				<section class="rounded-xl border border-brand/60 bg-brand/5 p-4">
					<p class="text-sm font-semibold">{$t('tuning.askHand')}</p>
					<p class="mt-0.5 mb-3 text-xs text-muted">{$t('tuning.askHandHint')}</p>
					<div class="flex gap-2">
						{#each ['right', 'left'] as const as option (option)}
							<button
								class="flex-1 rounded-lg border border-line py-2 text-sm font-semibold"
								onclick={() => chooseHand(option)}
							>
								{$t(`tuning.hand.${option}`)}
							</button>
						{/each}
					</div>
				</section>
			{/if}

			{#if open.diagram}
				{@const handed = HANDED_DIAGRAMS.includes(open.diagram)}
				<div class="rounded-xl border border-line bg-surface p-3">
					{#if handed}
						<!-- The reading swaps with the bow hand, so the picture says which one it is drawn for. -->
						<div class="mb-2 flex justify-end">{@render handSwitch()}</div>
					{/if}
					<TuningDiagram name={open.diagram} hand={hand ?? 'right'} />
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
				<div class="mb-2 flex items-center justify-between gap-3">
					<h3 class="text-sm font-semibold">{$t('tuning.interpretation')}</h3>
					<!-- A second switch rather than a scroll back to the picture: this is where it is read. -->
					{#if HANDED_STEPS.includes(open.key)}{@render handSwitch()}{/if}
				</div>
				<ul class="space-y-2 text-sm">
					{#each openText.results as row (row.observation)}
						<li>
							<span class="font-medium">{row.observation}</span>
							<span class="block text-muted">{row.suggests}</span>
						</li>
					{/each}
				</ul>
			</section>

			<!--
				The block a step carries: the figure it hands the archer, right where the step asks for
				it. Read only here, since the guide is a reading list; what is measured is kept by the
				procedure the step starts.
			-->
			{#if open.block === 'braceHeightTable'}
				<BraceHeightTable />
			{:else if open.block === 'braceCurveExample'}
				<section class="rounded-xl border border-line bg-surface p-4">
					<h3 class="mb-1 text-sm font-semibold">{$t('brace.exampleTitle')}</h3>
					<p class="mb-3 text-xs text-muted">{$t('brace.exampleHint')}</p>
					<BraceCurves points={EXAMPLE_CURVE} />
				</section>
			{:else if open.block === 'weightRatio'}
				<section class="rounded-xl border border-line bg-surface p-4">
					<h3 class="mb-3 text-sm font-semibold">{$t('ratio.title')}</h3>
					<WeightRatio
						massGrams={scratch.massGrams}
						drawWeightLb={scratch.drawWeightLb}
						unit={scratch.unit}
						onchange={(value) => (scratch = value)}
					/>
				</section>
			{/if}

			{#if template}
				<button
					class="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-brand-ink disabled:opacity-50"
					disabled={!target || starting}
					onclick={() => startTuning(template.key)}
				>
					<Icon name="wrench" size={18} />
					{$t('tuning.startNamed', { name: $t(`tuning.template.${template.key}`) })}
				</button>
				{#if !target}
					<p class="text-center text-xs text-muted">{$t('tuning.needBow')}</p>
				{/if}
			{/if}
		</div>
	</div>
{/if}

{#snippet handSwitch()}
	<div class="flex shrink-0 overflow-hidden rounded-full border border-line text-xs">
		{#each ['right', 'left'] as const as option (option)}
			<button
				type="button"
				class="px-2.5 py-1 font-semibold {(hand ?? 'right') === option
					? 'bg-brand text-brand-ink'
					: 'text-muted'}"
				onclick={() => chooseHand(option)}
			>
				{$t(`tuning.hand.${option}`)}
			</button>
		{/each}
	</div>
{/snippet}
