<script lang="ts">
	import { t } from '$lib/i18n';
	import { clock } from '$lib/domain/running';
	import { ZONES, timeInZones, zoneBand, type Zone } from '$lib/domain/run/zones';
	import type { TrackedFix } from '$lib/domain/run/track';

	/**
	 * What the run cost, zone by zone.
	 *
	 * An average beat a minute says almost nothing about a session: an hour held steady and half an
	 * hour of intervals with half an hour of standing about come out at the same figure, and they are
	 * not the same training. Where the time went is the thing worth keeping.
	 */
	let { fixes, max }: { fixes: TrackedFix[]; max: number } = $props();

	const held = $derived(timeInZones(fixes, max));
	const total = $derived(ZONES.reduce((sum, zone) => sum + held[zone], 0));
	/** Drawn top down, hardest first: the top of a session is what it was for. */
	const rows = $derived([...ZONES].reverse().filter((zone) => held[zone] > 0));

	function band(zone: Zone): string {
		const { from, to } = zoneBand(zone, max);
		return to === null ? `${from}+` : `${from}–${to}`;
	}
</script>

{#if total > 0}
	<section class="rounded-xl border border-line bg-surface p-3.5">
		<h2 class="mb-3 text-sm font-semibold">{$t('running.zones')}</h2>
		<dl class="space-y-1.5">
			{#each rows as zone (zone)}
				<div class="flex items-center gap-2 text-sm">
					<dt class="w-14 shrink-0 text-xs font-semibold" style="color:var(--c-zone-{zone})">
						{$t('running.zoneName', { n: zone })}
					</dt>
					<span class="relative h-4 flex-1 overflow-hidden rounded-md bg-sunk">
						<span
							class="absolute inset-y-0 left-0 rounded-md"
							style="width:{(held[zone] / total) * 100}%;background:var(--c-zone-{zone});opacity:0.45"
						></span>
						<!-- The beats the zone covers, inside its own bar: a zone number on its own is a
						     number nobody can check against the figure they were watching all run. -->
						<span class="absolute inset-y-0 left-2 flex items-center text-[10px] text-muted tabular">
							{band(zone)}
						</span>
					</span>
					<dd class="w-14 shrink-0 text-right text-xs font-semibold tabular">{clock(held[zone])}</dd>
				</div>
			{/each}
		</dl>
	</section>
{/if}
