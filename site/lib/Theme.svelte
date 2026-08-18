<script lang="ts">
	import { t } from '$lib/i18n';
	import { theme } from '$lib/theme';
	import Icon from '$lib/ui/Icon.svelte';

	/**
	 * The app's own theme store, which writes the same key in the same storage: a visitor who picks
	 * dark here opens the app in dark.
	 *
	 * One button rather than three. It starts on the system's own choice and switches to the other
	 * one, which is all a page this length needs; the app's settings hold the full three way choice.
	 */
	const dark = () =>
		typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
	const showing = $derived($theme === 'system' ? (dark() ? 'dark' : 'light') : $theme);
</script>

<button
	class="rounded-full p-2 text-muted transition hover:text-ink"
	aria-label={$t('settings.theme')}
	onclick={() => theme.set(showing === 'dark' ? 'light' : 'dark')}
>
	{#if showing === 'dark'}
		<Icon name="sun" size={18} />
	{:else}
		<!-- The app has no moon of its own: it never offers this choice as one button. Drawn here on
			the same 24 unit grid and the same stroke weight as the icons beside it. -->
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.7"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
		</svg>
	{/if}
</button>
