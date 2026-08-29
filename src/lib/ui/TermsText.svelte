<script lang="ts">
	import { t } from '$lib/i18n';

	/** Written once and read from both the app route and the landing page, so the two cannot drift. */
	const SECTIONS = [
		'shooting',
		'tuning',
		'liability',
		'data',
		'scores',
		'licence',
		'changes'
	] as const;
</script>

<p class="text-sm leading-snug text-muted">{$t('terms.intro')}</p>

{#each SECTIONS as section (section)}
	<section class="rounded-2xl border border-line bg-surface p-4">
		<h2 class="mb-1 font-semibold">{$t(`terms.${section}Title`)}</h2>
		<p class="text-sm leading-snug text-muted">{$t(`terms.${section}Body`)}</p>
	</section>
{/each}
