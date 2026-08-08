<script lang="ts">
	import { t, locale, LOCALES, LOCALE_NAMES } from '$lib/i18n';
	import { dbInfo } from '$lib/db';

	const info = dbInfo();
</script>

<div class="safe-top mx-auto w-full max-w-2xl p-4">
	<h1 class="mb-4 text-2xl font-bold">{$t('settings.title')}</h1>

	<section class="mb-6">
		<h2 class="mb-2 text-sm font-semibold text-slate-500">{$t('settings.language')}</h2>
		<div class="flex gap-2">
			{#each LOCALES as code (code)}
				<button
					class="rounded-lg border px-4 py-2 text-sm
						{$locale === code
						? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
						: 'border-slate-300 dark:border-slate-700'}"
					onclick={() => locale.set(code)}
				>
					{LOCALE_NAMES[code]}
				</button>
			{/each}
		</div>
	</section>

	<section>
		<h2 class="mb-2 text-sm font-semibold text-slate-500">{$t('settings.storage')}</h2>
		<p class="text-sm">
			<code class="rounded bg-slate-200 px-1 dark:bg-slate-800">{info.kind}</code>
			— {info.persistent ? 'persistent' : 'in-memory (data is lost on reload)'}
		</p>
	</section>
</div>
