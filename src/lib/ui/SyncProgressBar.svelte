<script lang="ts">
	import { t } from '$lib/i18n';
	import { syncProgress } from '$lib/sync/progress';

	const fraction = $derived($syncProgress && $syncProgress.total > 0 ? $syncProgress.done / $syncProgress.total : 0);
</script>

{#if $syncProgress}
	<div class="mt-2">
		<p class="tabular text-xs text-muted">
			{$t(`syncProgress.${$syncProgress.step}`, {
				done: $syncProgress.done,
				total: $syncProgress.total,
				received: $syncProgress.received ?? 0
			})}
		</p>
		<div
			class="mt-1 h-2 overflow-hidden rounded-full bg-sunk"
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(fraction * 100)}
		>
			<div class="h-full rounded-full bg-brand transition-[width] duration-200" style="width: {Math.round(fraction * 100)}%"></div>
		</div>
	</div>
{/if}
