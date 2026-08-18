<script lang="ts">
	import { t } from '$lib/i18n';
	import OpenApp from './OpenApp.svelte';
	import Rings from './Rings.svelte';
	import Language from './Language.svelte';
</script>

<!-- The bar stays: the address of the app is the point of the page, so it is never scrolled away. -->
<header class="sticky top-0 z-20 overflow-hidden border-b border-line/70 bg-bg/85 backdrop-blur">
	<!-- The rings run off the top right corner the way they do on the home header, struck from
		off screen rather than sitting in the bar as a badge would. -->
	<Rings class="absolute -top-20 -right-16 h-56 w-56 overflow-visible" />
	<nav class="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
		<span class="text-lg font-black tracking-tight">{$t('app.name')}</span>
		<span class="ml-auto"></span>
		<Language />
		<OpenApp />
	</nav>
</header>
