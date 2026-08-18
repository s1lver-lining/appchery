<script lang="ts">
	import { t } from '$lib/i18n';
	import OpenApp from './OpenApp.svelte';
	import Language from './Language.svelte';
</script>

<!-- The bar stays: the address of the app is the point of the page, so it is never scrolled away. -->
<header class="sticky top-0 z-20 border-b border-line/70 bg-bg/85 backdrop-blur">
	<nav class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
		<img src="/favicon.svg" alt="" width="28" height="28" class="shrink-0" />
		<span class="text-lg font-black tracking-tight">{$t('app.name')}</span>
		<span class="ml-auto"></span>
		<Language />
		<OpenApp />
	</nav>
</header>
