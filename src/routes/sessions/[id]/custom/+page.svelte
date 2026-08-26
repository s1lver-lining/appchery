<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import {
		buildCustomRound,
		validateCustomRound,
		FACE_SIZES,
		DISTANCES_M,
		DISTANCES_YD,
		END_COUNTS,
		ARROWS_PER_END,
		type CustomRoundInput
	} from '$lib/domain/rounds/custom';
	import { createScoringActivity } from '$lib/db/repository';
	import { setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import WheelPicker from '$lib/ui/WheelPicker.svelte';

	const sessionId = $derived($page.params.id as string);

	// Its route sits under the session, but the back key belongs to the activity picker it came from.
	$effect(() => setPageUp(`/sessions/${sessionId}`));

	let custom = $state<CustomRoundInput>({
		ends: 6,
		arrowsPerEnd: 6,
		faceSize: 40,
		distance: 18,
		unit: 'm',
		name: ''
	});
	const errors = $derived(validateCustomRound(custom));
	const distances = $derived(custom.unit === 'm' ? DISTANCES_M : DISTANCES_YD);

	async function create() {
		if (errors.length > 0) return;
		const round = buildCustomRound(custom);
		goto(`/activities/${await createScoringActivity(sessionId, round)}`);
	}
</script>

<!-- Back arrow and title on one line, like the session page: the whole form has to fit one screen. -->
<PageHeader motif="session">
	{#snippet lead()}
		<div class="flex items-center gap-2">
			<a href="/sessions/{sessionId}" class="-ml-1 text-muted" aria-label={$t('common.back')}>
				<Icon name="back" size={22} />
			</a>
			<h1 class="truncate text-2xl font-bold tracking-tight">{$t('round.customTitle')}</h1>
		</div>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-2xl space-y-4 p-4">
	<section class="rounded-xl border border-line bg-surface p-4">
		<label class="block text-sm">
			{$t('round.name')} <span class="text-muted">({$t('common.optional')})</span>
			<input
				class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
				bind:value={custom.name}
			/>
		</label>

		<div class="mt-3 grid grid-cols-2 gap-3">
			<WheelPicker
				values={END_COUNTS}
				value={custom.ends}
				label={$t('round.ends')}
				item={36}
				onchange={(v) => (custom.ends = v)}
			/>
			<WheelPicker
				values={ARROWS_PER_END}
				value={custom.arrowsPerEnd}
				label={$t('round.arrowsPerEnd')}
				item={36}
				onchange={(v) => (custom.arrowsPerEnd = v)}
			/>
		</div>

		<div class="mt-3">
			<span class="text-sm text-muted">{$t('round.faceSize')}</span>
			<div class="mt-1 flex gap-2">
				{#each FACE_SIZES as size (size)}
					<button
						class="press flex-1 rounded-lg border py-2 text-sm font-medium
							{custom.faceSize === size ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
						onclick={() => (custom.faceSize = size)}
					>
						{size}
					</button>
				{/each}
			</div>
		</div>

		<div class="mt-3">
			<!-- The unit rides on the distance heading: it is a property of that number, not its own field. -->
			<div class="mb-1 flex items-center justify-between">
				<span class="text-sm text-muted">{$t('round.distance')}</span>
				<div class="flex gap-1 rounded-lg bg-sunk p-0.5">
					{#each ['m', 'yd'] as const as unit (unit)}
						<button
							class="press rounded-md px-3 py-1 text-xs font-medium
								{custom.unit === unit ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
							onclick={() => {
								custom.unit = unit;
								// Keep the value on the new unit's scale rather than leaving an impossible one.
								const list = unit === 'm' ? DISTANCES_M : DISTANCES_YD;
								if (!list.includes(custom.distance)) custom.distance = list[0];
							}}
						>
							{unit}
						</button>
					{/each}
				</div>
			</div>
			<WheelPicker
				values={distances}
				value={custom.distance}
				label={$t('round.distance')}
				item={36}
				labelHidden
				format={(v) => `${v} ${custom.unit}`}
				onchange={(v) => (custom.distance = v)}
			/>
		</div>
	</section>
</div>

<!-- Sticky rather than fixed, so the picker above it scrolls yet the action stays under the thumb. -->
<div class="overbar sticky bottom-0 border-t border-line bg-bg/95 p-3 backdrop-blur">
	<button
		class="press mx-auto flex w-full max-w-2xl items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 font-semibold text-brand-ink disabled:opacity-50"
		disabled={errors.length > 0}
		onclick={create}
	>
		<Icon name="plus" size={20} />
		{$t('round.create')}
	</button>
</div>
