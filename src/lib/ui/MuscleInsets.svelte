<script lang="ts">
	import { t } from '$lib/i18n';
	import { MUSCLES, loadAt, type MuscleId, type ShotPhase } from '$lib/domain/muscles';

	/**
	 * The muscles that do not reach the skin. Four of them wrap the shoulder blade, one holds three
	 * fingers on a string, one is a belt around the waist, and none of them can be drawn on a
	 * silhouette because something else is in front. So each gets a close up with the covering muscle
	 * taken away, which is how an anatomy book shows them and the only way a tap can reach them.
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

	const INSETS = ['scapula', 'forearm', 'trunk'] as const;
	type Inset = (typeof INSETS)[number];

	/**
	 * The shapes of one close up, each in a 200 by 150 frame. The subscapularis gets a second blade
	 * of its own rather than a dashed patch over the first: it is on the other face of the bone, and
	 * three cuff muscles stacked in one outline is a smear nobody can tap accurately.
	 */
	const SHAPES: Record<Inset, { id: MuscleId; d: string }[]> = {
		scapula: [
			{ id: 'levatorScapulae', d: 'M2 0 20 2 28 26 14 28z' },
			{ id: 'supraspinatus', d: 'M23 27 92 18 93 29 28 40z' },
			{ id: 'infraspinatus', d: 'M30 52 88 36 76 72 50 92z' },
			{ id: 'teresMinor', d: 'M50 94 66 76 70 88 54 104z' },
			{ id: 'subscapularis', d: 'M126 30 182 22 160 104 140 70z' }
		],
		forearm: [
			// The belly at the elbow, and the three tendons it sends down to the fingers on the string.
			{ id: 'fingerFlexors', d: 'M24 44 88 50 122 62 148 66 152 76 118 76 86 80 26 70z' }
		],
		trunk: [
			// A ring, because that is the shape of it: a belt drawn round the waist under everything else.
			{
				id: 'transverseAbdominis',
				d: 'M100 18a68 52 0 1 0 .1 0zM100 34a52 36 0 1 1-.1 0z'
			}
		]
	};

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

<div class="grid gap-3 sm:grid-cols-3">
	{#each INSETS as inset (inset)}
		<figure class="rounded-xl border border-line bg-surface p-3">
			<svg
				viewBox="0 0 200 150"
				class="w-full"
				role="group"
				aria-label={$t(`muscles.inset.${inset}`)}
			>
				<!-- The bone or the limb the muscles are read against, so a shape has somewhere to be. -->
				{#if inset === 'scapula'}
					<!-- The blade twice: from behind on the left, and turned over on the right. -->
					<path d="M20 24 96 16 58 126z" fill="var(--c-bg)" stroke="var(--c-line)" stroke-width="1.5" />
					<path d="M25 42 90 26" stroke="var(--c-line)" stroke-width="1.5" fill="none" />
					<path
						d="M120 24 188 16 154 126z"
						fill="var(--c-bg)"
						stroke="var(--c-line)"
						stroke-width="1.5"
						stroke-dasharray="5 4"
					/>
				{:else if inset === 'forearm'}
					<path
						d="M16 34 100 42 142 54 162 46 180 60 160 80 138 88 96 90 18 78z"
						fill="var(--c-bg)"
						stroke="var(--c-line)"
						stroke-width="1.5"
					/>
					<!-- Three fingers on a string, which is what the muscle in this panel is holding. -->
					<g stroke="var(--c-line)" stroke-width="1.5" fill="none">
						<path d="M152 68 172 62M152 72 174 70M150 76 172 78" />
						<path d="M182 40v70" stroke-width="2" />
					</g>
				{:else}
					<ellipse cx="100" cy="70" rx="76" ry="56" fill="var(--c-bg)" stroke="var(--c-line)" stroke-width="1.5" />
					<circle cx="100" cy="70" r="13" fill="var(--c-sunk)" stroke="var(--c-line)" stroke-width="1" />
				{/if}

				{#each SHAPES[inset] as shape (shape.id)}
					{@const label = $t(`muscles.name.${shape.id}`)}
					<path
						d={shape.d}
						fill-rule="evenodd"
						role="checkbox"
						tabindex="0"
						aria-checked={selected.includes(shape.id)}
						aria-label={label}
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
			</svg>
			<figcaption class="mt-1 text-center text-[11px] leading-tight text-muted">
				{$t(`muscles.inset.${inset}`)}
			</figcaption>
		</figure>
	{/each}
</div>

<p class="mt-2 text-[11px] text-muted">{$t('muscles.insetHint')}</p>
