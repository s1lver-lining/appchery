<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { FACE_SIZES, DISTANCES_M, DISTANCES_YD } from '$lib/domain/rounds/custom';
	import { getScoreSet } from '$lib/domain/rounds/seed';
	import { scorableZones } from '$lib/domain/rounds/geometry';
	import {
		drillDefinition,
		isDrillGame,
		newDrill,
		ringRank,
		validateDrill,
		type Drill
	} from '$lib/domain/drills';
	import { createDrillActivity } from '$lib/db/repository';
	import { setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import WheelPicker from '$lib/ui/WheelPicker.svelte';

	/**
	 * Setting a drill before shooting it. Only the settings the chosen game actually reads are on
	 * show, because a form that asked every game for every setting would be a form nobody read: the
	 * catalogue says which ones matter, see src/lib/domain/drills/games.ts.
	 */

	const sessionId = $derived($page.params.id as string);
	const game = $derived(isDrillGame($page.params.game) ? $page.params.game : 'successZone');

	// Its route sits under the session, but the back key belongs to the activity picker it came from.
	$effect(() => setPageUp(`/sessions/${sessionId}`));

	let drill = $state<Drill>(newDrill('successZone'));
	let builtFor = $state<string | null>(null);
	$effect(() => {
		if (builtFor === game) return;
		builtFor = game;
		drill = newDrill(game);
	});

	const definition = $derived(drillDefinition(game));
	const asks = $derived((field: string) => definition.fields.includes(field as never));
	const errors = $derived(validateDrill(drill));
	const distances = $derived(drill.face.unit === 'm' ? DISTANCES_M : DISTANCES_YD);
	const scoreSet = $derived(getScoreSet(drill.face.scoreSetId));

	/** Outermost ring first, so the row reads the way an archer works inwards through it. */
	const rings = $derived(
		[...scorableZones(scoreSet)].sort(
			(a, b) => ringRank(scoreSet, a.label) - ringRank(scoreSet, b.label)
		)
	);

	/** Arrow counts worth offering: whole ends of the usual sizes rather than every integer. */
	const ARROW_COUNTS = [6, 12, 18, 24, 30, 36, 48, 60, 72];

	function toggleLadderStep(label: string) {
		const has = drill.config.ladder.includes(label);
		const next = has
			? drill.config.ladder.filter((step) => step !== label)
			: [...drill.config.ladder, label];
		// Always outermost to innermost, whatever order they were tapped in: a ladder goes one way.
		drill.config.ladder = next.sort((a, b) => ringRank(scoreSet, a) - ringRank(scoreSet, b));
	}

	async function create() {
		if (errors.length > 0) return;
		goto(`/activities/${await createDrillActivity(sessionId, drill)}`);
	}
</script>

<PageHeader motif="session">
	{#snippet lead()}
		<div class="flex items-center gap-2">
			<a href="/sessions/{sessionId}" class="-ml-1 text-muted" aria-label={$t('common.back')}>
				<Icon name="back" size={22} />
			</a>
			<h1 class="truncate text-2xl font-bold tracking-tight">{$t(`drill.game.${game}.name`)}</h1>
		</div>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-page space-y-4 p-4">
	<section class="rounded-xl border border-line bg-surface p-4">
		<p class="text-sm">{$t(`drill.game.${game}.hint`)}</p>
	</section>

	<!-- The rule. What makes this drill this drill, so it comes before where it is shot. -->
	{#if definition.fields.length > 0}
		<section class="space-y-4 rounded-xl border border-line bg-surface p-4">
			{#if asks('threshold')}
				{@const called = game === 'calledShot'}
				<div>
					<span class="text-sm text-muted">
						{called ? $t('drill.callFrom') : $t('drill.threshold')}
					</span>
					<p class="mb-2 text-xs text-muted">
						{called ? $t('drill.callFromHint') : $t('drill.thresholdHint')}
					</p>
					<div class="flex flex-wrap gap-1.5">
						{#each rings as ring (ring.label)}
							<button
								class="press min-w-11 rounded-lg border py-2 text-sm font-bold
									{drill.config.thresholdLabel === ring.label
									? 'border-brand bg-brand text-brand-ink'
									: 'border-line'}"
								onclick={() => (drill.config.thresholdLabel = ring.label)}
							>
								{ring.label}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if asks('ladder')}
				<div>
					<span class="text-sm text-muted">{$t('drill.ladder')}</span>
					<p class="mb-2 text-xs text-muted">{$t('drill.ladderHint')}</p>
					<div class="flex flex-wrap gap-1.5">
						{#each rings as ring (ring.label)}
							<button
								class="press min-w-11 rounded-lg border py-2 text-sm font-bold
									{drill.config.ladder.includes(ring.label)
									? 'border-brand bg-brand text-brand-ink'
									: 'border-line'}"
								onclick={() => toggleLadderStep(ring.label)}
							>
								{ring.label}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if asks('stepArrows')}
				{@render counter($t('drill.stepArrows'), [1, 2, 3, 5], drill.config.stepArrows, (v) => (drill.config.stepArrows = v))}
			{/if}

			{#if asks('lives')}
				<div>
					{@render counter($t('drill.lives'), [1, 2, 3, 5, 10], drill.config.lives, (v) => (drill.config.lives = v))}
					<p class="mt-1.5 text-xs text-muted">{$t('drill.livesHint')}</p>
				</div>
			{/if}

			{#if asks('goal')}
				<label class="block">
					<span class="text-sm text-muted">{$t('drill.goal')}</span>
					<input
						class="mt-1 w-full rounded-lg border bg-bg px-3 py-2 text-lg tabular {errors.includes('goal')
							? 'border-danger'
							: 'border-line'}"
						type="text"
						inputmode="numeric"
						value={drill.config.goal}
						onchange={(event) => (drill.config.goal = Math.round(Number(event.currentTarget.value) || 0))}
					/>
				</label>
			{/if}

			{#if asks('seconds')}
				<div>
					{@render counter($t('drill.seconds'), [30, 60, 120, 180, 300], drill.config.seconds, (v) => (drill.config.seconds = v))}
					<p class="mt-1 text-xs text-muted">
						{game === 'onePressure' ? $t('drill.waitHint') : $t('drill.secondsHint')}
					</p>
				</div>
			{/if}

			{#if asks('arrowSet')}
				<div>
					{@render counter($t('drill.arrowSet'), [4, 6, 8, 12], drill.config.arrowSet, (v) => (drill.config.arrowSet = v))}
					<p class="mt-1 text-xs text-muted">{$t('drill.arrowSetHint')}</p>
				</div>
			{/if}

			{#if asks('arrowsPerEnd')}
				{@render counter($t('drill.arrowsPerEnd'), [1, 2, 3, 6], drill.config.arrowsPerEnd, (v) => (drill.config.arrowsPerEnd = v))}
			{/if}

			{#if asks('arrows')}
				<div>
					<div class="mb-1 flex items-center justify-between">
						<span class="text-sm text-muted">{$t('drill.arrows')}</span>
						<!-- Several of these have no natural end, so "no limit" is a setting and not a gap. -->
						<button
							class="press rounded-lg border px-3 py-1 text-xs font-medium
								{drill.config.arrows === null ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
							onclick={() => (drill.config.arrows = drill.config.arrows === null ? 36 : null)}
						>
							{$t('drill.arrowsOpen')}
						</button>
					</div>
					{#if drill.config.arrows === null}
						<p class="text-xs text-muted">{$t('drill.arrowsOpenHint')}</p>
					{:else}
						<WheelPicker
							values={ARROW_COUNTS}
							value={drill.config.arrows}
							label={$t('drill.arrows')}
							item={36}
							labelHidden
							onchange={(v) => (drill.config.arrows = v)}
						/>
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	<!-- Where it is shot. Nothing here for the one drill that is shot at no face at all. -->
	{#if definition.input === 'pad'}
		<section class="rounded-xl border border-line bg-surface p-4">
			<p class="text-sm text-muted">{$t('drill.setupHint')}</p>

			<div class="mt-3">
				<span class="text-sm text-muted">{$t('round.faceSize')}</span>
				<div class="mt-1 flex gap-2">
					{#each FACE_SIZES as size (size)}
						<button
							class="press flex-1 rounded-lg border py-2 text-sm font-medium
								{drill.face.faceSize === size ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
							onclick={() => (drill.face.faceSize = size)}
						>
							{size}
						</button>
					{/each}
				</div>
			</div>

			<div class="mt-3">
				<div class="mb-1 flex items-center justify-between">
					<span class="text-sm text-muted">{$t('round.distance')}</span>
					<div class="flex gap-1 rounded-lg bg-sunk p-0.5">
						{#each ['m', 'yd'] as const as unit (unit)}
							<button
								class="press rounded-md px-3 py-1 text-xs font-medium
									{drill.face.unit === unit ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
								onclick={() => {
									drill.face.unit = unit;
									const list = unit === 'm' ? DISTANCES_M : DISTANCES_YD;
									if (drill.face.distance !== null && !list.includes(drill.face.distance))
										drill.face.distance = list[0];
								}}
							>
								{unit}
							</button>
						{/each}
					</div>
				</div>
				<WheelPicker
					values={distances}
					value={drill.face.distance ?? distances[0]}
					label={$t('round.distance')}
					item={36}
					labelHidden
					format={(v) => `${v} ${drill.face.unit}`}
					onchange={(v) => (drill.face.distance = v)}
				/>
			</div>
		</section>
	{/if}
</div>

{#snippet counter(label: string, options: number[], current: number, pick: (value: number) => void)}
	<div>
		<span class="text-sm text-muted">{label}</span>
		<div class="mt-1 flex gap-2">
			{#each options as option (option)}
				<button
					class="press flex-1 rounded-lg border py-2 text-sm font-medium tabular
						{current === option ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
					onclick={() => pick(option)}
				>
					{option}
				</button>
			{/each}
		</div>
	</div>
{/snippet}

<div class="overbar sticky bottom-0 border-t border-line bg-bg/95 p-3 backdrop-blur">
	<button
		class="press mx-auto flex w-full max-w-page items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 font-semibold text-brand-ink disabled:opacity-50"
		disabled={errors.length > 0}
		onclick={create}
	>
		<Icon name="plus" size={20} />
		{$t('drill.create')}
	</button>
</div>
