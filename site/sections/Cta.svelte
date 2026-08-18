<script lang="ts">
	import { t } from '$lib/i18n';
	import OpenApp from '../lib/OpenApp.svelte';
</script>

<section class="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
	<h2 class="text-3xl font-black tracking-tight text-balance sm:text-4xl">{$t('site.cta.title')}</h2>
	<p class="mx-auto mt-4 max-w-xl text-lg text-muted">{$t('site.cta.body')}</p>
	<div class="mt-8 flex justify-center"><OpenApp size="lg" /></div>
</section>
