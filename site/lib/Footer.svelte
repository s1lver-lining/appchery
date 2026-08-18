<script lang="ts">
	import { LOCALES, LOCALE_NAMES, locale, t } from '$lib/i18n';
	import { APP_URL } from './app';
</script>

<footer class="border-t border-line bg-surface">
	<div class="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:px-6">
		<div>
			<p class="font-semibold text-ink">{$t('app.name')}</p>
			<p>{$t('site.footer.licence')}</p>
		</div>
		<div class="flex flex-wrap items-center gap-4 sm:ml-auto">
			<a class="font-medium text-brand-text" href={APP_URL}>app.appchery.com</a>
			<span class="flex gap-2">
				{#each LOCALES as code (code)}
					<button
						class={$locale === code ? 'font-semibold text-ink' : ''}
						onclick={() => locale.set(code)}>{LOCALE_NAMES[code]}</button
					>
				{/each}
			</span>
		</div>
	</div>
</footer>
