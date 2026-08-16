<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { originOf, setPageUp } from '$lib/nav';
	import { encodeQr, qrPath } from '$lib/domain/qr';
	import Icon from '$lib/ui/Icon.svelte';
	import { ownsStatusBar } from '$lib/ui/statusBar';

	/**
	 * The poster: the address of the app as a code somebody can point a phone at, and the same
	 * address written out for somebody who would rather type it. It is the first page a new archer
	 * ever sees, so it says what the app is before it says where it is.
	 */
	const PROD_URL = 'https://appchery.pages.dev';

	const from = $derived(originOf($page.url, '/settings'));
	$effect(() => setPageUp(from));

	const code = encodeQr(PROD_URL);
	// One quiet module of margin per side is the minimum a scanner asks for; four is what it likes.
	const quiet = 4;
	const path = qrPath(code);
	const span = code.size + quiet * 2;
	/** Written without its scheme: nobody types https, and the line reads as an address that way. */
	const shown = PROD_URL.replace(/^https:\/\//, '');
</script>

<svelte:head><title>{$t('invite.title')} · {$t('app.name')}</title></svelte:head>

<!-- The poster wears the page background top to bottom, so the bar takes it too rather than
	keeping the brand band of the page this one was opened from. -->
<div class="poster flex min-h-full flex-col bg-bg" use:ownsStatusBar>
	<div class="safe-top flex items-center justify-between px-4 py-3 no-print">
		<a href={from} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
		<button class="text-sm font-medium text-brand-text" onclick={() => window.print()}>
			{$t('invite.print')}
		</button>
	</div>

	<main class="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
		<div>
			<p class="name text-3xl font-black tracking-tight">{$t('app.name')}</p>
			<p class="mt-1 text-sm text-muted">{$t('app.tagline')}</p>
		</div>

		<!-- Ink on paper whatever the theme is: a dark themed code prints as a grey square. -->
		<figure class="card w-full max-w-sm rounded-3xl border border-line bg-white p-5 shadow-sm">
			<svg
				class="block h-auto w-full"
				viewBox="0 0 {span} {span}"
				shape-rendering="crispEdges"
				role="img"
				aria-label={PROD_URL}
			>
				<rect width={span} height={span} fill="#fff" />
				<g transform="translate({quiet} {quiet})"><path d={path} fill="#000" /></g>
			</svg>
		</figure>

		<div>
			<p class="tabular text-lg font-bold break-all">{shown}</p>
			<p class="mt-1 text-xs tracking-wide text-muted uppercase">{$t('invite.scan')}</p>
		</div>

		<p class="max-w-sm text-sm leading-relaxed text-muted">{$t('invite.body')}</p>
	</main>

	<p class="px-6 pb-6 text-center text-[11px] text-muted">{$t('invite.free')}</p>
</div>

<style>
	/*
	 * A3 because that is the size a club noticeboard takes, and pure black on white because a
	 * poster is printed once on whatever machine the club owns.
	 */
	@media print {
		@page {
			size: A3;
			margin: 2cm;
		}

		:global(body) {
			background: #fff;
		}

		.no-print {
			display: none;
		}

		.poster {
			background: #fff;
			color: #000;
		}

		.poster :global(p) {
			color: #000;
		}

		.name {
			font-size: 4rem;
		}

		.card {
			border-color: #000;
			box-shadow: none;
			max-width: 22cm;
		}
	}
</style>
