<script lang="ts">
	import type { Snippet } from 'svelte';
	import HeaderEdge from './HeaderEdge.svelte';
	import { SNAP_EASE } from './swipe';

	/**
	 * Each page carries its own piece of archery geometry: rings, fletching, a limb, a trajectory, a
	 * sight ring. The motif names the page before the title is read, which is why no two repeat.
	 */
	export type HeaderMotif =
		| 'sessions'
		| 'session'
		| 'equipment'
		| 'bow'
		| 'stats'
		| 'badges'
		| 'tricks'
		| 'exercises'
		| 'experience'
		| 'feed'
		| 'settings';

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
<!-- The rise is set by the pager mid swipe: the header alone climbs, so nothing below it moves. -->
<header
	data-page-header
	class="safe-top relative bg-brand/10"
	style="transform: var(--header-shift, none); transition: transform var(--header-ease, 0ms) {SNAP_EASE}"
>
	<!-- The motif is clipped here rather than on the header, which would cut a menu opened inside it. -->
	<div class="pointer-events-none absolute inset-0 overflow-hidden">
	{#if motif === 'sessions'}
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
	{:else if motif === 'session'}
		<!-- Four waves running together: a session is a run of ends, one after another. -->
		<svg
			class="pointer-events-none absolute inset-y-0 right-0 h-full w-64 text-brand"
			viewBox="0 0 160 100"
			fill="none"
			aria-hidden="true"
		>
			<!-- Swung and blown up so the crests read as curves rather than as a stripe pattern. -->
			<g transform="translate(88 26) rotate(-22) scale(1.6)">
				{#each [0, 1, 2, 3] as line (line)}
					<path
						d="M-110 26 C -60 26, -20 0, 4 0 S 32 20, 52 14 S 84 -6, 100 -8"
						transform="translate(0 {line * 13})"
						stroke="currentColor"
						stroke-width="3.5"
						stroke-linecap="round"
						opacity={0.34 - line * 0.06}
					/>
				{/each}
			</g>
		</svg>
	{:else if motif === 'equipment'}
		<!-- The two bows the app knows, side on: a recurve with an arrow on the rest, and a compound. -->
		<svg
			class="pointer-events-none absolute inset-y-0 right-0 h-full w-72 text-brand"
			viewBox="-24 0 254 120"
			preserveAspectRatio="xMaxYMid meet"
			fill="none"
			aria-hidden="true"
		>
			<g transform="translate(166 62) rotate(-30) scale(1.5) translate(-50 -60)">
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
			</g>

		<!-- Mirrored so the two bows face away from each other rather than fighting for the same room. -->
			<g transform="translate(32 62) rotate(12) scale(-1.4 1.4) translate(-50 -60)">
				<path
					d="M52 46 L30 24 M52 74 L30 96"
					stroke="currentColor"
					stroke-width="5"
					stroke-linecap="round"
					opacity="0.16"
				/>
				<path d="M52 42 L52 78" stroke="currentColor" stroke-width="8" stroke-linecap="round" opacity="0.2" />
				<circle cx="28" cy="22" r="8" stroke="currentColor" stroke-width="3" opacity="0.22" />
				<circle cx="28" cy="98" r="8" stroke="currentColor" stroke-width="3" opacity="0.22" />
				<path d="M28 14 L36 60 L28 106" stroke="currentColor" stroke-width="1.6" opacity="0.28" />
				<path d="M28 30 C 46 44, 46 76, 28 90" stroke="currentColor" stroke-width="1.6" opacity="0.2" />
				<path d="M36 60 L84 60" stroke="currentColor" stroke-width="2.5" opacity="0.3" />
				<path d="M84 60 L72 55 L72 65 Z" fill="currentColor" opacity="0.35" />
			</g>
		</svg>
	{:else if motif === 'bow'}
		<!--
			The limb curve stood on end: parabolas rising out of the header, each one opening wider than
			the last, overlapping the way a limb does through the draw.
		-->
		<svg
			class="pointer-events-none absolute inset-y-0 right-0 h-full w-80 text-brand"
			viewBox="0 0 160 100"
			preserveAspectRatio="xMaxYMid meet"
			fill="none"
			aria-hidden="true"
		>
			<!-- Turned a quarter anticlockwise and blown up, so the arcs rise out of the header edge.
				Held left of the corner, which belongs to the menu button rather than to the motif. -->
			<g transform="translate(94 22) rotate(-90) scale(1.55)">
				{#each [0, 1, 2, 3] as step (step)}
					<path
						d="M-70 {-42 + step * 4} C {-18 - step * 6} {-30 + step * 2}, {14 + step * 8} {step *
							3}, {-70 + step * 2} {42 - step * 4}"
						stroke="currentColor"
						stroke-width={3.4 - step * 0.4}
						stroke-linecap="round"
						opacity={0.3 - step * 0.06}
					/>
				{/each}
			</g>
		</svg>
	{:else if motif === 'feed'}
		<!-- Targets at a distance from each other, each with an arrow in it: other people's shooting. -->
		<svg
			class="pointer-events-none absolute inset-y-0 right-0 h-full w-64 text-brand"
			viewBox="0 0 140 100"
			preserveAspectRatio="xMaxYMid meet"
			fill="none"
			aria-hidden="true"
		>
			{#each [
				{ x: 40, y: 62, r: 20 },
				{ x: 86, y: 34, r: 26 },
				{ x: 124, y: 74, r: 16 }
			] as face, i (face.x)}
				<circle
					cx={face.x}
					cy={face.y}
					r={face.r}
					stroke="currentColor"
					stroke-width="3"
					opacity={0.14 + i * 0.06}
				/>
				<circle cx={face.x} cy={face.y} r="3" fill="currentColor" opacity={0.2 + i * 0.08} />
			{/each}
		</svg>
	{:else if motif === 'exercises'}
		<!-- A band stretched wider each time: the same movement, asked for a little more of. -->
		<svg
			class="pointer-events-none absolute inset-y-0 right-0 h-full w-60 text-brand"
			viewBox="0 0 140 100"
			preserveAspectRatio="xMaxYMid meet"
			fill="none"
			aria-hidden="true"
		>
			{#each [0, 1, 2] as step (step)}
				<path
					d="M{46 - step * 14} 22C{70 - step * 4} {56 + step * 10}, {70 + step * 4} {56 + step * 10}, {94 + step * 14} 22"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					opacity={0.3 - step * 0.07}
				/>
			{/each}
		</svg>
	{:else if motif === 'tricks'}
		<!-- Arrows fanned out of a quiver: a page of what was in there all along. -->
		<svg
			class="pointer-events-none absolute inset-y-0 right-0 h-full w-56 text-brand"
			viewBox="0 0 140 100"
			preserveAspectRatio="xMaxYMid meet"
			fill="none"
			aria-hidden="true"
		>
			{#each [-24, -8, 8, 24] as angle, i (angle)}
				<g transform="rotate({angle} 78 104)" opacity={0.3 - i * 0.05}>
					<path d="M78 104V16" stroke="currentColor" stroke-width="3" />
					<path d="M78 12l-7 16 7-5 7 5z" fill="currentColor" />
				</g>
			{/each}
		</svg>
	{:else if motif === 'experience'}
		<!-- Arcs struck one inside the next, each reaching higher: what a level costs over the last one. -->
		<svg
			class="pointer-events-none absolute inset-y-0 right-0 h-full w-64 text-brand"
			viewBox="0 0 140 100"
			preserveAspectRatio="xMaxYMid meet"
			fill="none"
			aria-hidden="true"
		>
			{#each [0, 1, 2, 3, 4] as step (step)}
				<path
					d="M{18 + step * 8} 104 A {86 - step * 16} {86 - step * 16} 0 0 1 {126 - step * 4} {30 - step * 4}"
					stroke="currentColor"
					stroke-width="3"
					opacity={0.1 + step * 0.05}
				/>
			{/each}
		</svg>
	{:else if motif === 'badges'}
		<!-- The stats fletching, over a shaft drawn the full width so it enters and leaves the header. -->
		<svg
			class="pointer-events-none absolute inset-0 h-full w-full text-brand"
			viewBox="0 0 100 70"
			preserveAspectRatio="none"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M-4 78 L104 -8"
				stroke="currentColor"
				stroke-width="2.5"
				opacity="0.3"
				vector-effect="non-scaling-stroke"
			/>
		</svg>
		<svg
			class="pointer-events-none absolute inset-y-0 right-0 h-full w-64 text-brand"
			viewBox="0 0 140 70"
			preserveAspectRatio="xMaxYMid meet"
			fill="none"
			aria-hidden="true"
		>
			{#each [0, 26, 52] as offset, i (offset)}
				<path
					d="M{18 + offset} 72 C{34 + offset} 48, {42 + offset} 26, {44 + offset} 4 C{54 +
						offset} 22, {50 + offset} 48, {36 + offset} 82 Z"
					fill="currentColor"
					opacity={0.12 + i * 0.07}
				/>
			{/each}
		</svg>
	{:else if motif === 'stats'}
		<!-- Fletching: vanes stacked along a shaft, the mark of arrows already loosed. -->
		<!-- Sized off the header height rather than a fixed box, so the vanes reach the bottom edge. -->
		<svg
			class="pointer-events-none absolute inset-y-0 right-0 h-full w-64 text-brand"
			viewBox="0 0 140 70"
			preserveAspectRatio="xMaxYMid meet"
			fill="none"
			aria-hidden="true"
		>
			<path d="M2 74 L152 -8" stroke="currentColor" stroke-width="2.5" opacity="0.3" />
			{#each [0, 26, 52] as offset, i (offset)}
				<path
					d="M{18 + offset} 72 C{34 + offset} 48, {42 + offset} 26, {44 + offset} 4 C{54 +
						offset} 22, {50 + offset} 48, {36 + offset} 82 Z"
					fill="currentColor"
					opacity={0.12 + i * 0.07}
				/>
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
			<!-- The same cog at half size, so the pair reads as one mechanism rather than two shapes. -->
			<g opacity="0.13" fill="currentColor" transform="translate(16 16) scale(0.46) translate(-50 -50)">
				{#each [0, 45, 90, 135, 180, 225, 270, 315] as angle (angle)}
					<rect x="44" y="10" width="12" height="26" rx="3" transform="rotate({angle} 50 50)" />
				{/each}
				<path fill-rule="evenodd" d="M50 20 a30 30 0 1 0 0.1 0 Z M50 37 a13 13 0 1 0 0.1 0 Z" />
			</g>
		</svg>
	{/if}

	</div>

	{#snippet heading()}
		{#if title}<h1 class="truncate text-2xl font-bold tracking-tight">{title}</h1>{/if}
		{#if subtitle}<p class="mt-0.5 text-sm text-muted">{subtitle}</p>{/if}
	{/snippet}

	<div class="relative mx-auto flex w-full max-w-2xl items-start gap-3 px-4 pt-5 pb-8">
		<div class="min-w-0 flex-1">
			<!--
				A page that brings its own title inside the lead lays itself out; where the header owns the
				title, the back arrow keeps it company on its line rather than sitting on top of it.
			-->
			{#if lead && title}
				<div class="flex min-w-0 items-start gap-2">
					<!-- Nudged down so the arrow sits against the title rather than against its cap height. -->
					<div class="shrink-0 pt-1">{@render lead()}</div>
					<div class="min-w-0 flex-1">{@render heading()}</div>
				</div>
			{:else}
				{#if lead}{@render lead()}{/if}
				{@render heading()}
			{/if}
			{#if children}{@render children()}{/if}
		</div>
		{#if actions}<div class="shrink-0">{@render actions()}</div>{/if}
	</div>

	<HeaderEdge />
</header>
