<script lang="ts">
	import { t } from '$lib/i18n';
	import { BRACE_HEIGHT_TABLE } from '$lib/domain/tuning/guide';

	/** Where to start a brace height from, by bow length. A table because that is how makers quote it. */
</script>

<div class="rounded-xl border border-line bg-sunk p-3">
	<h4 class="text-xs font-semibold">{$t('brace.tableTitle')}</h4>
	<p class="mt-0.5 text-[11px] text-muted">{$t('brace.tableHint')}</p>
	<table class="mt-2 w-full text-sm">
		<thead>
			<tr class="text-left text-[11px] tracking-wide text-muted uppercase">
				<th class="py-1 font-semibold">{$t('brace.tableBow')}</th>
				<th class="py-1 text-right font-semibold">{$t('brace.tableMin')}</th>
				<th class="py-1 text-right font-semibold">{$t('brace.tableMax')}</th>
			</tr>
		</thead>
		<tbody class="tabular">
			{#each BRACE_HEIGHT_TABLE as row (row.bowLength)}
				<tr class="border-t border-line">
					<td class="py-1.5">
						{row.bowLength}"
						<span class="text-xs text-muted">({row.size})</span>
					</td>
					<td class="py-1.5 text-right">{row.minCm} cm</td>
					<td class="py-1.5 text-right">{row.maxCm} cm</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
