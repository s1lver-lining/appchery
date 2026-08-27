<script lang="ts">
	import { goto } from '$app/navigation';
	import { get } from 'svelte/store';
	import { t } from '$lib/i18n';
	import { incomingFile, namedFile, SHARE_CACHE, SHARE_KEY } from '$lib/import/incoming';
	import ImportDialog from '$lib/ui/ImportDialog.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';

	// Where an export opened from a file manager, a share sheet or another app lands.
	let file = $state<File | null>(null);
	let missing = $state(false);

	$effect(() => {
		claim();
	});

	async function claim() {
		// Read once rather than subscribed: claiming it clears the store, which would run this again.
		const handed = get(incomingFile);
		if (handed) {
			incomingFile.set(null);
			file = handed;
			return;
		}

		// A share sheet posts the file to the service worker, which parks it here for this page.
		try {
			const cache = await caches.open(SHARE_CACHE);
			const response = await cache.match(SHARE_KEY);
			if (response) {
				await cache.delete(SHARE_KEY);
				file = namedFile(await response.blob(), response.headers.get('x-filename') ?? '');
				return;
			}
		} catch {
			// No cache storage means no shared file, which the empty state below already covers.
		}
		missing = true;
	}
</script>

<PageHeader motif="settings" title={$t('importer.title')} />

<div class="mx-auto w-full max-w-page p-4">
	{#if missing}
		<p class="text-sm text-muted">{$t('importer.nothingHanded')}</p>
		<a href="/settings" class="mt-3 inline-block text-sm font-semibold text-brand-text">
			{$t('importer.openSettings')}
		</a>
	{:else}
		<p class="text-sm text-muted">{$t('importer.reading')}</p>
	{/if}
</div>

{#if file}
	<ImportDialog {file} onclose={() => goto('/sessions')} />
{/if}
