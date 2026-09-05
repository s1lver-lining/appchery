<script lang="ts">
	import { t } from '$lib/i18n';
	import { SETTINGS } from '$lib/settings';
	import Icon from './Icon.svelte';

	/**
	 * A way straight to the switch behind whatever is being said. Naming a setting and leaving the
	 * archer to find it is the thing the settings search was built to answer, and the answer is
	 * better still when the app never has to be searched: the page that mentions a setting links it.
	 *
	 * The name comes from the catalogue rather than from the caller, so a setting renamed once is
	 * renamed everywhere it is pointed at.
	 */
	let { setting, label }: { setting: string; label?: string } = $props();

	const entry = $derived(SETTINGS.find((row) => row.key === setting));
</script>

{#if entry}
	<a
		href="/settings?setting={setting}"
		class="inline-flex items-center gap-1 align-baseline font-medium text-brand-text underline
			underline-offset-2"
	>
		<Icon name="sliders" size={13} />
		{label ?? $t(entry.title)}
	</a>
{/if}
