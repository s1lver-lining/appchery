<script lang="ts">
	import { t } from '$lib/i18n';
	import { kgToPounds, poundsToKg } from '$lib/domain/units';
	import {
		IDEAL_RATIO,
		RATIO_BANDS,
		RATIO_MIN,
		RATIO_MAX,
		bandOf,
		positionOf,
		ratioOf
	} from '$lib/domain/tuning/ratio';

	/**
	 * What the bow weighs against what it draws, on a scale rather than as a bare figure: the number
	 * alone means nothing to an archer who has not been told what to compare it with, and the point
	 * on the bar says where they stand before the number is read at all.
	 *
	 * Mass is held in grams whatever the field is showing, so switching the unit never edits the
	 * measurement, only the way it is typed.
	 */
	let {
		massGrams = null,
		drawWeightLb = null,
		unit = 'kg',
		onchange
	}: {
		massGrams?: number | null;
		drawWeightLb?: number | null;
		unit?: 'kg' | 'lb';
		onchange?: (value: {
			massGrams: number | null;
			drawWeightLb: number | null;
			unit: 'kg' | 'lb';
		}) => void;
	} = $props();

	/*
	 * Initial values only, the way the face's own toggles take theirs: what is typed is the archer's
	 * from then on. Holding it here rather than round tripping through the record is what lets the
	 * reading answer the second figure the moment it is typed, before the write has landed.
	 */
	// svelte-ignore state_referenced_locally
	let mass = $state(massGrams);
	// svelte-ignore state_referenced_locally
	let weight = $state(drawWeightLb);
	// svelte-ignore state_referenced_locally
	let shown = $state(unit);

	/** What the mass field shows: grams turned into whichever unit is selected, rounded to read well. */
	const massShown = $derived(
		mass === null
			? ''
			: shown === 'kg'
				? String(Math.round((mass / 1000) * 1000) / 1000)
				: String(Math.round(kgToPounds(mass / 1000) * 100) / 100)
	);

	const ratio = $derived(mass !== null && weight !== null ? ratioOf(mass, weight) : null);
	const band = $derived(ratio === null ? null : bandOf(ratio));
	const at = $derived(ratio === null ? null : positionOf(ratio));
	const off = $derived(ratio === null ? null : ratio - IDEAL_RATIO);

	function emit(next: Partial<{ massGrams: number | null; drawWeightLb: number | null; unit: 'kg' | 'lb' }>) {
		if (next.massGrams !== undefined) mass = next.massGrams;
		if (next.drawWeightLb !== undefined) weight = next.drawWeightLb;
		if (next.unit !== undefined) shown = next.unit;
		onchange?.({ massGrams: mass, drawWeightLb: weight, unit: shown });
	}

	function setMass(text: string) {
		const value = Number(text.replace(',', '.'));
		if (text.trim() === '' || !Number.isFinite(value) || value <= 0) return emit({ massGrams: null });
		emit({ massGrams: shown === 'kg' ? value * 1000 : poundsToKg(value) * 1000 });
	}

	function setWeight(text: string) {
		const value = Number(text.replace(',', '.'));
		emit({ drawWeightLb: text.trim() === '' || !Number.isFinite(value) || value <= 0 ? null : value });
	}

	/**
	 * The bands as a run of widths across the bar: poor, off, right, off, poor. Drawn from the same
	 * figures the reading is judged against, so the colour under the point can never disagree with
	 * the colour of the number beside it.
	 */
	const span = RATIO_MAX - RATIO_MIN;
	const segments = [
		{ band: 'poor', width: ((RATIO_BANDS.poor - RATIO_BANDS.fair) / span) * 100 },
		{ band: 'fair', width: ((RATIO_BANDS.fair - RATIO_BANDS.good) / span) * 100 },
		{ band: 'good', width: ((RATIO_BANDS.good * 2) / span) * 100 },
		{ band: 'fair', width: ((RATIO_BANDS.fair - RATIO_BANDS.good) / span) * 100 },
		{ band: 'poor', width: ((RATIO_BANDS.poor - RATIO_BANDS.fair) / span) * 100 }
	];
</script>

<div class="space-y-4">
	<div class="grid gap-3 sm:grid-cols-2">
		<label class="text-sm">
			<span class="flex items-center justify-between gap-2">
				{$t('ratio.mass')}
				<!-- Two words rather than a switch: which unit is being typed has to be readable at a glance. -->
				<span class="flex overflow-hidden rounded-full border border-line text-xs">
					{#each ['kg', 'lb'] as const as option (option)}
						<button
							type="button"
							class="px-2.5 py-1 font-semibold {shown === option
								? 'bg-brand text-brand-ink'
								: 'text-muted'}"
							onclick={() => emit({ unit: option })}
						>
							{option}
						</button>
					{/each}
				</span>
			</span>
			<input
				type="number"
				inputmode="decimal"
				step="0.01"
				class="tabular mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
				value={massShown}
				oninput={(e) => setMass(e.currentTarget.value)}
			/>
		</label>

		<label class="text-sm">
			<span class="flex items-center justify-between gap-2">
				{$t('ratio.drawWeight')}
				<span class="text-xs text-muted">lb</span>
			</span>
			<input
				type="number"
				inputmode="decimal"
				step="0.5"
				class="tabular mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
				value={weight ?? ''}
				oninput={(e) => setWeight(e.currentTarget.value)}
			/>
		</label>
	</div>

	<div>
		<div class="flex items-baseline justify-between gap-3">
			<span
				class="tabular text-3xl leading-none font-bold"
				style={band ? `color: var(--c-band-${band})` : undefined}
			>
				{ratio === null ? '—' : ratio.toFixed(0)}
				<span class="text-base font-semibold">{$t('ratio.unit')}</span>
			</span>
			{#if ratio !== null && off !== null}
				<span class="text-sm text-muted">
					{off >= 0 ? '+' : '−'}{Math.abs(off).toFixed(0)} {$t('ratio.fromIdeal')}
				</span>
			{/if}
		</div>

		<div class="relative mt-3 pt-1 pb-6">
			<div class="flex h-2.5 overflow-hidden rounded-full">
				{#each segments as segment, i (i)}
					<span
						style="width: {segment.width}%; background: var(--c-band-{segment.band}); opacity: 0.35"
					></span>
				{/each}
			</div>

			<!-- The mark to aim at, drawn on the bar rather than written under it. -->
			<span class="absolute top-0 bottom-6 left-1/2 w-px -translate-x-1/2 bg-ink/40"></span>

			{#if at !== null && band}
				<span
					class="absolute top-0 h-4.5 w-4.5 -translate-x-1/2 rounded-full border-2 border-surface shadow"
					style="left: {at * 100}%; background: var(--c-band-{band})"
				></span>
			{/if}

			<div class="tabular absolute inset-x-0 bottom-0 flex justify-between text-[11px] text-muted">
				<span>{RATIO_MIN}</span>
				<span>{IDEAL_RATIO}</span>
				<span>{RATIO_MAX}</span>
			</div>
		</div>

		<p class="text-xs text-muted">
			{ratio === null ? $t('ratio.hint') : $t(`ratio.verdict.${band}`)}
		</p>
	</div>
</div>
