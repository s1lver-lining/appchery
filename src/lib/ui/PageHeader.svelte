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
		<!-- One arrow held at full draw against the rings it is aimed at. -->
		<svg
			class="pointer-events-none absolute -top-10 -right-12 h-48 w-48 text-brand"
			viewBox="0 0 100 100"
			fill="none"
			aria-hidden="true"
		>
			{#each [40, 28, 16] as r, i (r)}
				<circle cx="64" cy="46" {r} stroke="currentColor" stroke-width="5" opacity={0.09 + i * 0.05} />
			{/each}
			<circle cx="64" cy="46" r="5" fill="currentColor" opacity="0.4" />
			<path d="M2 92 L58 48" stroke="currentColor" stroke-width="3" opacity="0.3" />
			<path d="M58 48 L46 50 L52 40 Z" fill="currentColor" opacity="0.35" />
		</svg>
	{:else if motif === 'equipment'}
		<!-- A recurve profile: both limbs bending away from the string that holds them. -->
		<svg
			class="pointer-events-none absolute inset-y-0 right-0 h-full w-48 text-brand"
			viewBox="0 0 160 70"
			preserveAspectRatio="none"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M4 2 C46 16, 92 22, 156 20"
				stroke="currentColor"
				stroke-width="6"
				stroke-linecap="round"
				opacity="0.16"
			/>
			<path
				d="M4 68 C46 54, 92 48, 156 50"
				stroke="currentColor"
				stroke-width="6"
				stroke-linecap="round"
				opacity="0.16"
			/>
			<path d="M4 2 L20 35 L4 68" stroke="currentColor" stroke-width="2" opacity="0.32" />
			<circle cx="20" cy="35" r="4" fill="currentColor" opacity="0.35" />
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
		<!-- A sight ring with its scale, the one piece of geometry that exists to be adjusted. -->
		<svg
			class="pointer-events-none absolute -top-10 -right-10 h-44 w-44 text-brand"
			viewBox="0 0 100 100"
			fill="none"
			aria-hidden="true"
		>
			<circle cx="52" cy="50" r="34" stroke="currentColor" stroke-width="4" opacity="0.18" />
			<circle cx="52" cy="50" r="3" fill="currentColor" opacity="0.35" />
			<path d="M52 8 V26 M52 74 V92 M10 50 H28 M76 50 H94" stroke="currentColor" stroke-width="3" opacity="0.22" />
			{#each [20, 65, 110, 155, 200, 245, 290, 335] as angle (angle)}
				<path
					d="M52 50 m0 -42 v7"
					stroke="currentColor"
					stroke-width="2.5"
					opacity="0.16"
					transform="rotate({angle} 52 50)"
				/>
			{/each}
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
