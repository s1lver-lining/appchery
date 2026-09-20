<script lang="ts">
	import { t } from '$lib/i18n';

	/**
	 * A distance in kilometres, typed. A wheel was tried and thrown away: a hundred kilometres and a
	 * hundred steps of ten metres are two long drags to say 0.4, and a distance is the one figure
	 * here that everybody already knows in digits before they open the app.
	 */
	let {
		metres,
		onchange,
		label = null,
		invalid = false
	}: {
		metres: number | null;
		onchange: (metres: number | null) => void;
		label?: string | null;
		invalid?: boolean;
	} = $props();

	const km = $derived(metres === null ? '' : String(Math.round(metres) / 1000));

	function set(value: string) {
		const parsed = Number(value.replace(',', '.'));
		if (value.trim() === '' || !Number.isFinite(parsed) || parsed <= 0) {
			onchange(null);
			return;
		}
		onchange(Math.round(parsed * 1000));
	}
</script>

<label class="block">
	{#if label}<span class="text-sm text-muted">{label}</span>{/if}
	<span class="mt-1 flex items-center gap-2">
		<input
			class="w-full min-w-0 rounded-lg border bg-bg px-3 py-2 text-lg tabular {invalid
				? 'border-danger'
				: 'border-line'}"
			type="text"
			inputmode="decimal"
			aria-label={label ?? $t('running.distance')}
			placeholder="0.4"
			value={km}
			onchange={(event) => set(event.currentTarget.value)}
		/>
		<span class="shrink-0 text-sm text-muted">{$t('running.km')}</span>
	</span>
</label>
