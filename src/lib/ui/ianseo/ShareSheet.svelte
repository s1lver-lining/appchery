<script lang="ts">
	import { t } from '$lib/i18n';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { encodeQr, qrPath } from '$lib/domain/qr';
	import { shareLink } from '$lib/files';

	/**
	 * A competition handed to somebody standing next to you: they point a phone at the code and land
	 * on the same page. The address is the app's own, so a phone with Appchery installed opens it
	 * there and a phone without opens the web app, which is the same page either way.
	 */
	let {
		open,
		title,
		url,
		onclose
	}: {
		open: boolean;
		title: string;
		url: string;
		onclose: () => void;
	} = $props();

	const code = $derived(encodeQr(url));
	/** One quiet module of margin is the least a scanner asks for; four is what it likes. */
	const quiet = 4;
	const span = $derived(code.size + quiet * 2);
	/** Written without its scheme: nobody types https, and the line reads as an address that way. */
	const shown = $derived(url.replace(/^https:\/\//, ''));

	let said = $state<string | null>(null);

	async function hand() {
		const how = await shareLink(title, url);
		said = how === 'copied' ? $t('ianseo.shareCopied') : null;
	}
</script>

<Sheet {open} title={$t('ianseo.share')} {onclose}>
	<p class="mb-3 text-xs text-muted">{$t('ianseo.shareHint')}</p>

	<!-- Ink on paper whatever the theme is: a dark themed code is a grey square to a scanner. -->
	<figure class="mx-auto w-full max-w-56 rounded-2xl border border-line bg-white p-4">
		<svg
			class="block h-auto w-full"
			viewBox="0 0 {span} {span}"
			shape-rendering="crispEdges"
			role="img"
			aria-label={url}
		>
			<rect width={span} height={span} fill="#fff" />
			<g transform="translate({quiet} {quiet})"><path d={qrPath(code)} fill="#000" /></g>
		</svg>
	</figure>

	<p class="mt-3 text-center text-sm font-semibold break-words">{title}</p>
	<p class="mt-1 text-center text-xs break-all text-muted">{shown}</p>

	{#if said}<p class="mt-2 text-center text-xs text-brand-text">{said}</p>{/if}

	<button
		class="mt-4 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-brand-ink"
		onclick={hand}
	>
		{$t('ianseo.shareLink')}
	</button>
</Sheet>
