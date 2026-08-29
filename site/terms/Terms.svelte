<script lang="ts">
	import { t } from '$lib/i18n';
	import TermsText from '$lib/ui/TermsText.svelte';
	import Footer from '../lib/Footer.svelte';
	import Nav from '../lib/Nav.svelte';
</script>

<div class="min-h-full bg-bg text-ink">
	<Nav />
	<main class="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6">
		<h1 class="text-3xl font-black tracking-tight sm:text-4xl">{$t('terms.title')}</h1>
		<TermsText />
	</main>
	<Footer />
</div>
