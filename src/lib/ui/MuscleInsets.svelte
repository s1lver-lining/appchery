<script lang="ts">
	import { t } from '$lib/i18n';
	import { MUSCLES, loadAt, type MuscleId, type ShotPhase } from '$lib/domain/muscles';
	import { smooth } from './muscleMap';

	/**
	 * The shoulder blade, close up. Four muscles wrap it and one lies against its far side, and on a
	 * silhouette every one of them is under something else — so this is the only place they can be
	 * pointed at. It is also the only close up left: a panel showing one muscle on its own was a
	 * caption with a picture stuck to it, and those muscles are picked from the list instead.
	 *
	 * Both blades are drawn, and both are labelled. A single blade forces the reader to work out
	 * which shoulder they are looking at, and the answer changes depending on whether the archer is
	 * facing them — which is exactly the confusion a diagram is supposed to remove.
	 */
	let {
		selected = [],
		phase = null,
		onpick
	}: {
		selected?: MuscleId[];
		phase?: ShotPhase | null;
		onpick?: (id: MuscleId) => void;
	} = $props();

	/** The two faces of the bone: what sits on the back of it, and what sits against the ribs. */
	const FACES = ['scapulaBack', 'scapulaFront'] as const;
	type Face = (typeof FACES)[number];

	const SHAPES: Record<Face, { id: MuscleId; d: string }[]> = {
		scapulaBack: [
			{ id: 'levatorScapulae', d: smooth([[9, 2], [19, 5], [26, 24], [17, 26]]) },
			{ id: 'supraspinatus', d: smooth([[29, 29], [60, 23], [88, 20], [90, 29], [60, 34], [33, 38]]) },
			{ id: 'infraspinatus', d: smooth([[32, 53], [60, 44], [85, 38], [78, 64], [62, 82], [50, 90]]) },
			{ id: 'teresMinor', d: smooth([[52, 93], [65, 78], [70, 87], [56, 101]]) }
		],
		scapulaFront: [
			{ id: 'subscapularis', d: smooth([[30, 34], [58, 27], [82, 23], [70, 70], [58, 99], [44, 68]]) }
		]
	};

	/** The bone itself: a flat triangle with its point down, and the ridge across the back of it. */
	const BONE = 'M20 24 96 16 58 126z';
	const SPINE = 'M25 42 90 26';

	/**
	 * Seen from behind an archer, their right shoulder is on your left, and from the front it swaps.
	 * Rather than ask anyone to hold that in their head, each blade is put where it belongs for the
	 * face being shown and says whose it is underneath.
	 */
	const PANEL = 220;
	const FLIP = `translate(${PANEL} 0) scale(-1 1)`;

	const blades = (face: Face) =>
		face === 'scapulaBack'
			? [
					{ side: 'right', transform: undefined, x: 58 },
					{ side: 'left', transform: FLIP, x: PANEL - 58 }
				]
			: [
					{ side: 'left', transform: undefined, x: 58 },
					{ side: 'right', transform: FLIP, x: PANEL - 58 }
				];

	function fill(id: MuscleId): string {
		if (selected.includes(id)) return 'var(--c-brand)';
		if (!phase || loadAt(phase, id) === 0) return 'var(--c-sunk)';
		const fault = MUSCLES.find((entry) => entry.id === id)?.role === 'fault';
		return fault ? 'var(--c-danger)' : 'var(--c-accent)';
	}

	function opacity(id: MuscleId): number {
		if (selected.includes(id)) return 0.9;
		if (!phase) return 1;
		return [1, 0.3, 0.6, 1][loadAt(phase, id)];
	}
</script>

<div class="space-y-3">
	{#each FACES as face (face)}
		<figure class="rounded-xl border border-line bg-surface p-3">
			<figcaption class="mb-1 text-center text-xs font-medium">
				{$t(`muscles.inset.${face}`)}
			</figcaption>
			<svg
				viewBox="0 0 {PANEL} 152"
				class="w-full"
				role="group"
				aria-label={$t(`muscles.inset.${face}`)}
			>
				{#each blades(face) as blade (blade.side)}
					<g transform={blade.transform}>
						<path d={BONE} fill="var(--c-bg)" stroke="var(--c-line)" stroke-width="1.5" />
						{#if face === 'scapulaBack'}
							<path d={SPINE} stroke="var(--c-line)" stroke-width="1.5" fill="none" />
						{/if}
						{#each SHAPES[face] as shape (shape.id)}
							{@const label = $t(`muscles.name.${shape.id}`)}
							<path
								d={shape.d}
								role="checkbox"
								tabindex="0"
								aria-checked={selected.includes(shape.id)}
								aria-label="{label} · {$t(`muscles.side.${blade.side}`)}"
								class="cursor-pointer outline-none transition-[fill,fill-opacity] duration-300"
								fill={fill(shape.id)}
								fill-opacity={opacity(shape.id)}
								stroke={selected.includes(shape.id) ? 'var(--c-brand)' : 'var(--c-line)'}
								stroke-width={selected.includes(shape.id) ? 1.6 : 0.8}
								onclick={() => onpick?.(shape.id)}
								onkeydown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										onpick?.(shape.id);
									}
								}}
							>
								<title>{label}</title>
							</path>
						{/each}
					</g>
				{/each}

				<!-- Said in words, because a diagram that needs a convention explained has not explained it. -->
				{#each blades(face) as blade (blade.side)}
					<text
						x={blade.x}
						y="146"
						text-anchor="middle"
						font-size="11"
						fill="var(--c-muted)"
					>
						{$t(`muscles.side.${blade.side}`)}
					</text>
				{/each}
			</svg>
		</figure>
	{/each}
</div>

<p class="mt-2 text-[11px] text-muted">{$t('muscles.insetHint')}</p>
