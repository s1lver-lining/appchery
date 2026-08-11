<script lang="ts">
	import { t } from '$lib/i18n';
	import { saveFile, shareFile } from '$lib/files';
	import { theme } from '$lib/theme';
	import { shareCardOptions, shareCardChosen } from '$lib/prefs';
	import Icon from './Icon.svelte';
	import Toggle from './Toggle.svelte';
	import {
		scorecardSvg,
		scorecardPng,
		CARD_OPTION_KEYS,
		DEFAULT_CARD_OPTIONS,
		type CardData,
		type CardOptionKey,
		type CardOptions
	} from './scorecard';

	/**
	 * The round as one picture, filling the screen. It exists to be shared: everything an archer
	 * would want to say about a round is on it, and nothing they would have to explain.
	 */
	let {
		data,
		onclose
	}: { data: Omit<CardData, 'options'>; onclose: () => void } = $props();

	/**
	 * The theme follows the app the first time and is then the archer's to set, because a card is
	 * posted somewhere with its own idea of light and dark.
	 */
	let dark = $state($theme === 'dark' || ($theme === 'system' && prefersDark()));

	function prefersDark() {
		return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
	}

	/** Nothing to say means nothing to show: an option with no data behind it cannot be turned on. */
	const available = $derived<Record<CardOptionKey, boolean>>({
		date: true,
		place: Boolean(data.place),
		bow: Boolean(data.bow),
		category: Boolean(data.category),
		recap: true,
		sheet: data.sheet.length > 0,
		weatherIcon: Boolean(data.weather),
		temperature: Boolean(data.weather?.temperature),
		wind: Boolean(data.weather?.wind)
	});

	const options = $derived<CardOptions>({
		...(Object.fromEntries(
			CARD_OPTION_KEYS.map((key) => [
				key,
				available[key] &&
					($shareCardChosen ? $shareCardOptions.includes(key) : DEFAULT_CARD_OPTIONS[key])
			])
		) as Record<CardOptionKey, boolean>),
		theme: dark ? 'dark' : 'light'
	});

	function toggle(key: CardOptionKey) {
		const on = CARD_OPTION_KEYS.filter((item) => options[item]);
		shareCardOptions.set(on.includes(key) ? on.filter((item) => item !== key) : [...on, key]);
		shareCardChosen.set(true);
	}

	const LABELS = $derived<Record<CardOptionKey, string>>({
		date: $t('share.optionDate'),
		place: $t('share.optionPlace'),
		bow: $t('share.optionBow'),
		category: $t('share.optionCategory'),
		recap: $t('share.optionRecap'),
		sheet: $t('share.optionSheet'),
		weatherIcon: $t('share.optionWeather'),
		temperature: $t('share.optionTemperature'),
		wind: $t('share.optionWind')
	});

	let picking = $state(false);
	const svg = $derived(scorecardSvg({ ...data, options }));
	let busy = $state<'share' | 'save' | null>(null);
	let error = $state<string | null>(null);

	const filename = $derived(
		`appchery-${data.roundName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.png`
	);

	async function send(how: 'share' | 'save') {
		busy = how;
		error = null;
		try {
			const blob = await scorecardPng(svg);
			if (how === 'share') await shareFile(blob, filename, data.roundName);
			else await saveFile(blob, filename, data.roundName);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
		busy = null;
	}
</script>

<div class="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur">
	<header class="safe-top flex items-center justify-between px-4 py-3 pt-6">
		<h2 class="text-lg font-bold text-white">{$t('share.title')}</h2>
		<button class="text-white/70" aria-label={$t('common.close')} onclick={onclose}>
			<Icon name="close" size={24} />
		</button>
	</header>

	<!-- The card keeps its 4:5 whatever the screen is, because that is the shape it will be posted in. -->
	<div class="flex min-h-0 flex-1 items-center justify-center px-4 pb-2">
		<div class="aspect-[4/5] max-h-full w-full max-w-md overflow-hidden rounded-2xl shadow-2xl">
			<!-- Built by us from escaped values, never from anything fetched. -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html svg}
		</div>
	</div>

	<div class="safe-bottom px-4 pt-2 pb-4">
		{#if error}
			<p class="mb-2 text-center text-sm text-danger">{error}</p>
		{/if}
		<!-- Two ways out: to another app, or onto the phone. Neither needs the width of the screen. -->
		<div class="mx-auto flex max-w-md items-center justify-center gap-2">
			<button
				class="flex items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
				disabled={busy !== null}
				onclick={() => send('share')}
			>
				<Icon name="share" size={18} />
				{busy === 'share' ? $t('share.saving') : $t('share.action')}
			</button>
		<button
				class="flex items-center justify-center gap-2 rounded-lg border border-white/25 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
				disabled={busy !== null}
				onclick={() => send('save')}
			>
				<Icon name="camera" size={18} />
				{busy === 'save' ? $t('share.saving') : $t('share.save')}
			</button>
			<button
				class="flex items-center justify-center rounded-lg border border-white/25 p-2.5 text-white"
				aria-label={$t('share.options')}
				onclick={() => (picking = true)}
			>
				<Icon name="sliders" size={18} />
			</button>
		</div>
	
	</div>
</div>

{#if picking}
	<!-- What goes on the card, before it goes anywhere. Greyed out is nothing to say, not a refusal. -->
	<div class="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
		<button
			class="absolute inset-0 bg-black/60"
			aria-label={$t('common.close')}
			onclick={() => (picking = false)}
		></button>

		<div
			class="relative m-4 max-h-[80dvh] w-full max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-xl"
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-lg font-bold">{$t('share.options')}</h2>
				<button class="text-muted" aria-label={$t('common.close')} onclick={() => (picking = false)}>
					<Icon name="close" size={20} />
				</button>
			</div>

			<div class="flex items-center justify-between gap-4 border-b border-line pb-3">
				<span class="text-sm font-medium">{$t('share.optionDark')}</span>
				<Toggle checked={dark} label={$t('share.optionDark')} onchange={(v) => (dark = v)} />
			</div>

			<div class="mt-3 space-y-2.5">
				{#each CARD_OPTION_KEYS as key (key)}
					<div class="flex items-center justify-between gap-4 {available[key] ? '' : 'opacity-40'}">
						<span class="text-sm">{LABELS[key]}</span>
						{#if available[key]}
							<Toggle checked={options[key]} label={LABELS[key]} onchange={() => toggle(key)} />
						{:else}
							<span class="text-xs text-muted">{$t('share.unavailable')}</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	/* The card is drawn at 1080 wide and scaled to whatever room the screen has. */
	div :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
