<script lang="ts">
	import { t } from '$lib/i18n';
	import { APP_URL } from './app';
	import Icon from '$lib/ui/Icon.svelte';

	/** The one thing the page is for. It says the address as well as the words, because a visitor
		who is not going to tap it now still has to be able to remember where to go. */
	let { size = 'md' }: { size?: 'md' | 'lg' } = $props();
</script>

<a
	href={APP_URL}
	class="inline-flex items-center gap-2 rounded-full bg-brand font-semibold text-brand-ink shadow-sm transition hover:brightness-105 active:scale-[0.98]
		{size === 'lg' ? 'px-7 py-3.5 text-lg' : 'px-5 py-2.5'}"
>
	{$t('site.open')}
	<Icon name="target" size={size === 'lg' ? 22 : 18} />
</a>
