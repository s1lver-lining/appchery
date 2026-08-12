<script lang="ts">
	import { PROGRESSION_ARROWS, type ArrowColour, type EarnedBadge } from '$lib/domain/badges';
	import Icon from './Icon.svelte';

	/**
	 * What a badge looks like. The progression arrows get an arrow in the colour they are named for,
	 * because that colour is the award: an archer says "the blue arrow", never "the 20m one".
	 */
	let { badge, size = 28 }: { badge: EarnedBadge; size?: number } = $props();

	/** The target face palette, so a red arrow is the red an archer already looks at. */
	const COLOURS: Record<ArrowColour, string> = {
		white: '#f4f1ea',
		black: '#23282c',
		blue: '#3aa0d8',
		red: '#e8453c',
		yellow: '#ffcf3f',
		bronze: '#c07a3e',
		silver: '#b7bec6',
		gold: '#d9a441'
	};

	const arrow = $derived(PROGRESSION_ARROWS.find((a) => a.key === badge.definition.key));
	const earned = $derived(badge.earnedAt !== null);
</script>

{#if arrow}
	<!-- Unearned arrows keep their shape and lose their colour, which is the thing being played for. -->
	<span
		class="inline-flex items-center justify-center rounded-full border {earned
			? ''
			: 'opacity-40 grayscale'}"
		style="width: {size * 1.35}px; height: {size * 1.35}px;
			background: color-mix(in srgb, {COLOURS[arrow.colour]} 22%, transparent);
			border-color: color-mix(in srgb, {COLOURS[arrow.colour]} 55%, transparent)"
	>
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill={COLOURS[arrow.colour]}
			stroke={COLOURS[arrow.colour]}
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<!-- Nock at the bottom left, point at the top right, the way an arrow leaves a bow. -->
			<path d="M6 18 16.4 7.6" fill="none" />
			<path d="M21 3l-6.2 1.2 5 5z" />
			<path d="M3.4 20.6 3 15.4l3.6 1.6z" />
			<path d="M3.4 20.6 8.6 21l-1.6-3.6z" />
		</svg>
	</span>
{:else}
	<span class={earned ? 'text-accent' : 'text-muted/50'}>
		<Icon name={badge.definition.icon} {size} filled={earned} />
	</span>
{/if}
