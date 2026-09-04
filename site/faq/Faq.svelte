<script lang="ts">
	import { t } from '$lib/i18n';
	import Footer from '../lib/Footer.svelte';
	import Nav from '../lib/Nav.svelte';
	import OpenApp from '../lib/OpenApp.svelte';
	import { QUESTIONS } from './questions';
</script>

<div class="min-h-full bg-bg text-ink">
	<Nav page="faq" />
	<main class="mx-auto max-w-3xl px-4 py-10 sm:px-6">
		<h1 class="text-3xl font-black tracking-tight sm:text-4xl">{$t('faq.title')}</h1>
		<p class="mt-3 text-lg text-muted">{$t('faq.intro')}</p>

		<!-- Written out rather than folded into accordions: eleven short answers are quicker to read
			down than to open one by one, and a closed answer is one a reader has to guess the shape of. -->
		<dl class="mt-10 space-y-8">
			{#each QUESTIONS as key (key)}
				<div>
					<dt class="text-lg font-bold text-balance">{$t(`faq.items.${key}.q`)}</dt>
					<dd class="mt-2 text-muted">{$t(`faq.items.${key}.a`)}</dd>
				</div>
			{/each}
		</dl>

		<div class="mt-12 flex justify-center border-t border-line pt-10">
			<OpenApp />
		</div>
	</main>
	<Footer page="faq" />
</div>
