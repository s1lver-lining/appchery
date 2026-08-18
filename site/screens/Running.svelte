<script lang="ts">
	import { t } from '$lib/i18n';

	/**
	 * A run, written down: how far and how long, typed in, with the pace working itself out. The two
	 * fields are the app's own, which is the whole of the screen: a run is two numbers and how it
	 * felt.
	 */
	let km = $state(5.2);
	let minutes = $state(27);
	let seconds = $state(4);
	let effort = $state('steady');

	const EFFORTS = ['easy', 'steady', 'tempo', 'hard'];

	const pace = $derived.by(() => {
		if (km <= 0) return null;
		const perKm = (minutes * 60 + seconds) / km;
		return `${Math.floor(perKm / 60)}:${String(Math.round(perKm % 60)).padStart(2, '0')}`;
	});
</script>

<div class="space-y-2.5 p-3">
	<section class="rounded-xl border border-line bg-surface p-3">
		<h2 class="mb-2 text-[11px] font-semibold text-muted">{$t('running.what')}</h2>
		<div class="grid grid-cols-2 gap-2">
			<label class="block">
				<span class="text-[11px] text-muted">{$t('running.distance')}</span>
				<div class="mt-1 flex items-center gap-1.5">
					<input
						type="number"
						step="0.1"
						min="0"
						class="tabular w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-ink"
						bind:value={km}
					/>
					<span class="shrink-0 text-[11px] text-muted">{$t('running.km')}</span>
				</div>
			</label>
			<label class="block">
				<span class="text-[11px] text-muted">{$t('running.duration')}</span>
				<div class="mt-1 flex items-center gap-1">
					<input
						type="number"
						min="0"
						class="tabular w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-ink"
						bind:value={minutes}
					/>
					<span class="shrink-0 text-[11px] text-muted">{$t('running.minutesShort')}</span>
					<input
						type="number"
						min="0"
						max="59"
						class="tabular w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-ink"
						bind:value={seconds}
					/>
					<span class="shrink-0 text-[11px] text-muted">{$t('running.secondsShort')}</span>
				</div>
			</label>
		</div>
	</section>

	<section class="rounded-xl border border-line bg-surface p-3">
		<h2 class="text-[11px] font-semibold text-muted">{$t('running.pace')}</h2>
		{#if pace === null}
			<p class="text-[11px] text-muted">{$t('running.paceWaiting')}</p>
		{:else}
			<p class="tabular text-2xl font-bold">
				{pace}
				<span class="text-sm font-medium text-muted">{$t('running.perKm')}</span>
			</p>
		{/if}
	</section>

	<section class="rounded-xl border border-line bg-surface p-3">
		<h2 class="mb-2 text-[11px] font-semibold text-muted">{$t('running.effort')}</h2>
		<div class="flex gap-1.5">
			{#each EFFORTS as key (key)}
				<button
					class="flex-1 rounded-lg border py-1.5 text-[11px] font-medium
						{effort === key ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
					aria-pressed={effort === key}
					onclick={() => (effort = key)}
				>
					{$t(`running.efforts.${key}`)}
				</button>
			{/each}
		</div>
	</section>
</div>
