<script lang="ts">
	import { t } from '$lib/i18n';
	import TuningDiagram from '$lib/ui/TuningDiagram.svelte';
	import WeightRatio from '$lib/ui/WeightRatio.svelte';
	import { SESSION } from '../lib/sample';

	/**
	 * The mass to draw weight test as the app runs it: what to do, drawn, and the app's own scale
	 * underneath. `WeightRatio` is the real measurement panel, so the figures can be edited here and
	 * the verdict moves with them, which is the whole of what the test is.
	 */
	let mass = $state<number | null>(SESSION.tuning.massGrams);
	let drawWeight = $state<number | null>(SESSION.tuning.drawWeightLb);
</script>

<div class="space-y-2.5 p-3">
	<section class="rounded-xl border border-line bg-surface p-3">
		<TuningDiagram name="bowStrength" />
	</section>

	<WeightRatio
		massGrams={mass}
		drawWeightLb={drawWeight}
		onchange={(value) => {
			mass = value.massGrams;
			drawWeight = value.drawWeightLb;
		}}
	/>

	<p class="px-1 text-[11px] text-muted">{$t('ratio.hint')}</p>
</div>
