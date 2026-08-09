<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Each page carries its own piece of archery geometry: rings, fletching, a limb, a trajectory, a
	 * sight ring. The motif names the page before the title is read, which is why no two repeat.
	 */
	export type HeaderMotif = 'sessions' | 'session' | 'equipment' | 'stats' | 'settings';

	let {
		motif,
		title,
		subtitle,
		lead,
		actions,
		children
	}: {
		motif: HeaderMotif;
		title?: string;
		subtitle?: string;
		lead?: Snippet;
		actions?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<!-- The inset lives on the element and the spacing inside it, because both are a padding-top. -->
<header class="safe-top relative overflow-hidden bg-brand/10">
	{#if motif === 'sessions'}
		<!-- Fletching: vanes stacked along a shaft, the mark of arrows already loosed. -->
		<svg
			class="pointer-events-none absolute -top-2 right-0 h-28 w-56 text-brand"
			viewBox="0 0 140 70"
			fill="none"
			aria-hidden="true"
		>
			<path d="M6 62 L134 6" stroke="currentColor" stroke-width="2.5" opacity="0.3" />
			{#each [0, 26, 52] as offset, i (offset)}
				<path
					d="M{18 + offset} 58 C{34 + offset} 44, {42 + offset} 26, {44 + offset} 8 C{54 +
						offset} 22, {50 + offset} 44, {36 + offset} 62 Z"
					fill="currentColor"
					opacity={0.12 + i * 0.07}
				/>
			{/each}
		</svg>
	{:else if motif === 'session'}
		<!-- A session is a handful of arrows loosed together, so they fan out from one nock point. -->
		<svg
			class="pointer-events-none absolute top-2 right-0 h-28 w-52 text-brand"
			viewBox="0 0 130 90"
			fill="none"
			aria-hidden="true"
		>
			{#each [-8, 6, 20] as tilt, i (tilt)}
				<g transform="rotate({tilt} 8 68)" opacity={0.34 - i * 0.07}>
					<path d="M8 68 L104 26" stroke="currentColor" stroke-width="2.5" />
					<path d="M122 18 L100 20 L106 34 Z" fill="currentColor" />
					<path
						d="M8 68 L26 60 L22 70 Z M18 64 L36 56 L32 66 Z"
						fill="currentColor"
						opacity="0.8"
					/>
				</g>
			{/each}
		</svg>
	{:else if motif === 'equipment'}
		<!-- A recurve seen side on: limbs recurving off the riser, string nocked, arrow on the rest. -->
		<svg
			class="pointer-events-none absolute inset-y-0 right-6 h-full w-32 text-brand"
			viewBox="0 0 100 120"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M24 4 C40 12, 50 26, 52 42 M52 78 C50 94, 40 108, 24 116"
				stroke="currentColor"
				stroke-width="5"
				stroke-linecap="round"
				opacity="0.2"
			/>
			<path d="M52 40 L52 80" stroke="currentColor" stroke-width="9" stroke-linecap="round" opacity="0.24" />
			<path d="M24 4 L30 60 L24 116" stroke="currentColor" stroke-width="1.8" opacity="0.35" />
			<path d="M30 60 L86 60" stroke="currentColor" stroke-width="2.5" opacity="0.3" />
			<path d="M86 60 L74 55 L74 65 Z" fill="currentColor" opacity="0.35" />
		</svg>
	{:else if motif === 'stats'}
		<!-- Flight paths climbing to the same point, which is what a tightening group looks like. -->
		<svg
			class="pointer-events-none absolute -top-4 -right-6 h-40 w-56 text-brand"
			viewBox="0 0 140 100"
			fill="none"
			aria-hidden="true"
		>
			{#each [0, 12, 24] as drop, i (drop)}
				<path
					d="M-6 {96 + drop} C40 {40 + drop}, 84 {14 + drop}, 138 {8 + drop}"
					stroke="currentColor"
					stroke-width="3"
					opacity={0.22 - i * 0.06}
				/>
			{/each}
			{#each [[112, 22], [124, 14], [104, 30]] as [cx, cy] (cx)}
				<circle {cx} {cy} r="4" fill="currentColor" opacity="0.3" />
			{/each}
		</svg>
	{:else}
		<!-- Two meshing cogs: the page is where the app itself is adjusted, not where arrows are shot. -->
		<svg
			class="pointer-events-none absolute -top-1 -right-6 h-32 w-32 text-brand"
			viewBox="0 0 100 100"
			fill="none"
			aria-hidden="true"
		>
			<g opacity="0.22" fill="currentColor">
				{#each [0, 45, 90, 135, 180, 225, 270, 315] as angle (angle)}
					<rect x="44" y="10" width="12" height="26" rx="3" transform="rotate({angle} 50 50)" />
				{/each}
				<path fill-rule="evenodd" d="M50 20 a30 30 0 1 0 0.1 0 Z M50 37 a13 13 0 1 0 0.1 0 Z" />
			</g>
			<g opacity="0.13" fill="currentColor">
				{#each [0, 60, 120, 180, 240, 300] as angle (angle)}
					<rect x="12" y="0" width="8" height="14" rx="2" transform="rotate({angle} 16 16)" />
				{/each}
				<path fill-rule="evenodd" d="M16 2 a14 14 0 1 0 0.1 0 Z M16 10 a6 6 0 1 0 0.1 0 Z" />
			</g>
		</svg>
	{/if}

	<div class="relative mx-auto flex w-full max-w-2xl items-start gap-3 px-4 pt-5 pb-8">
		<div class="min-w-0 flex-1">
			{#if lead}{@render lead()}{/if}
			{#if title}<h1 class="truncate text-2xl font-bold tracking-tight">{title}</h1>{/if}
			{#if subtitle}<p class="mt-0.5 text-sm text-muted">{subtitle}</p>{/if}
			{#if children}{@render children()}{/if}
		</div>
		{#if actions}<div class="shrink-0">{@render actions()}</div>{/if}
	</div>

	<!-- A drawn edge instead of a hard line, so the block stops reading as a coloured box. -->
	<svg
		class="absolute inset-x-0 -bottom-px h-6 w-full text-bg"
		viewBox="0 0 100 12"
		preserveAspectRatio="none"
		aria-hidden="true"
	>
		{#if motif === 'sessions'}
			<path d="M0 12 V7 C30 -2 68 3 100 7 V12 Z" fill="currentColor" />
		{:else if motif === 'session'}
			<path d="M0 12 V6 C26 12 62 -2 100 5 V12 Z" fill="currentColor" />
		{:else if motif === 'equipment'}
			<path d="M0 12 V4 C34 14 66 14 100 4 V12 Z" fill="currentColor" />
		{:else if motif === 'stats'}
			<path d="M0 12 V9 C38 -3 70 9 100 2 V12 Z" fill="currentColor" />
		{:else}
			<path d="M0 12 V5 C20 0 40 10 60 6 C78 3 90 8 100 6 V12 Z" fill="currentColor" />
		{/if}
	</svg>
</header>
