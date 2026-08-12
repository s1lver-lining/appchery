<script lang="ts">
	import { PROGRESSION_ARROWS, type ArrowColour, type EarnedBadge } from '$lib/domain/badges';
	import Icon from './Icon.svelte';

	/**
	 * What a badge looks like. The progression arrows get an arrow in the colour they are named for,
	 * because that colour is the award: an archer says "the blue arrow", never "the 20m one".
	 */
	let { badge, size = 28 }: { badge: EarnedBadge; size?: number } = $props();

	/** The regulated face colours where there is one, so a red arrow is the red on the target. */
	const COLOURS: Record<ArrowColour, string> = {
		white: 'var(--color-face-white)',
		black: 'var(--color-face-black)',
		blue: 'var(--color-face-blue)',
		red: 'var(--color-face-red)',
		yellow: 'var(--color-face-gold)',
		bronze: '#c07a3e',
		silver: '#b7bec6',
		gold: '#d9a441'
	};

	const arrow = $derived(PROGRESSION_ARROWS.find((a) => a.key === badge.definition.key));
	const earned = $derived(badge.earnedAt !== null);
</script>

{#if arrow}
	<!--
		An unearned arrow keeps its colour and is only dimmed: the colour is the name of the award, and
		a wall of grey tells an archer nothing about what is left to shoot.
	-->
	<span
		class="inline-flex items-center justify-center rounded-full border {earned ? '' : 'opacity-55'}"
		style="width: {size * 1.35}px; height: {size * 1.35}px;
			background: color-mix(in srgb, {COLOURS[arrow.colour]} 22%, var(--color-surface));
			border-color: color-mix(in srgb, {COLOURS[arrow.colour]} 55%, var(--color-line))"
	>
		<!--
			Outlined in the page's own ink as well as filled, because a white arrow on a light theme and
			a black one on a dark theme are otherwise the same as no arrow at all.
		-->
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			stroke-width="0.9"
			stroke-linejoin="round"
			style="fill: {COLOURS[arrow.colour]};
				stroke: color-mix(in srgb, var(--color-ink) 55%, transparent)"
			aria-hidden="true"
		>
			<!-- Nock at the bottom left, point at the top right, the way an arrow leaves a bow. -->
			<path
				d="M5.2 18.8 17 7"
				stroke-width="2.2"
				stroke-linecap="round"
				style="stroke: color-mix(in srgb, var(--color-ink) 35%, {COLOURS[arrow.colour]})"
			/>
			<path d="M21 3l-6.4 1.4 5 5z" />
			<!-- Vanes widening towards the nock, which is the way round fletching actually sits. -->
			<path d="M9 15 4.6 19.4 3.1 16.5z" />
			<path d="M9 15 4.6 19.4 7.5 20.9z" />
		</svg>
	</span>
{:else}
	<span class={earned ? 'text-accent' : 'text-muted/50'}>
		<Icon name={badge.definition.icon} {size} filled={earned} />
	</span>
{/if}
