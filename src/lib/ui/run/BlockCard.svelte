<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import { clock } from '$lib/domain/running';
	import { sayDistance } from './distance';
	import { BLOCK_KINDS, formatPace, type BlockKind, type RunBlock } from '$lib/domain/run/workout';
	import { blockColour, blockSkin, blockTint } from './kinds';
	import TimePicker from './TimePicker.svelte';
	import DistanceField from './DistanceField.svelte';
	import PacePicker from './PacePicker.svelte';

	/**
	 * One block: a coloured line saying what it is, and the whole of its editing when it is opened.
	 *
	 * A programme is read far more often than it is written, and it is read as a shape: warm up, a
	 * stack of work and recovery, a way down. A card per block that fills the screen hides that
	 * shape, so the list is lines and only the block being edited is a card.
	 */
	let {
		block,
		open,
		ontoggle,
		onchange,
		onduplicate,
		ondelete,
		onmove,
		ongrab = undefined,
		held = false
	}: {
		block: RunBlock;
		open: boolean;
		ontoggle: () => void;
		onchange: (block: RunBlock) => void;
		onduplicate: () => void;
		ondelete: () => void;
		onmove: (by: -1 | 1) => void;
		/** Picked up to be put somewhere else. Absent where this list cannot be dragged. */
		ongrab?: (event: PointerEvent) => void;
		/** Whether this is the card being carried, which is drawn as lifted off the list. */
		held?: boolean;
	} = $props();

	const skin = $derived(blockSkin(block.kind));
	const colour = $derived(blockColour(block.kind));
	const seconds = $derived(block.goal.type === 'time' ? block.goal.seconds : 0);
	const metres = $derived(block.goal.type === 'distance' ? block.goal.metres : 0);
	const kindName = $derived($t(`workouts.blockKinds.${block.kind}`));

	/**
	 * What the block comes to, in the order a runner reads it: how far, how fast, how long. Two of
	 * the three are asked for and the third falls out of them, so a block set in metres at a pace
	 * says its time too, and one set in minutes says its distance.
	 */
	const figures = $derived.by(() => {
		const pace = block.targetPace;
		const metres =
			block.goal.type === 'distance'
				? block.goal.metres
				: block.goal.type === 'time' && pace
					? (block.goal.seconds / pace) * 1000
					: null;
		const seconds =
			block.goal.type === 'time'
				? block.goal.seconds
				: block.goal.type === 'distance' && pace
					? (block.goal.metres / 1000) * pace
					: null;
		const said: string[] = [];
		if (metres !== null) said.push(sayDistance(metres, $t));
		if (pace) said.push(`${formatPace(pace)} ${$t('running.perKm')}`);
		if (seconds !== null) said.push(clock(seconds));
		return said.length > 0 ? said.join(' · ') : $t('workouts.goalOpen');
	});

	function setKind(kind: BlockKind) {
		onchange({ ...block, kind });
	}

	function setGoal(type: 'time' | 'distance' | 'open') {
		if (type === block.goal.type) return;
		// Carried across rather than reset: switching unit on a block already written keeps its size.
		const goal =
			type === 'time'
				? { type, seconds: block.goal.type === 'distance' ? 300 : 600 }
				: type === 'distance'
					? { type, metres: block.goal.type === 'time' ? 1000 : 400 }
					: { type };
		onchange({ ...block, goal: goal as RunBlock['goal'] });
	}
</script>

<!-- The kind's colour runs the whole height of the block, so a programme is read as bands first. -->
<div
	class="flex items-stretch overflow-hidden rounded-xl border transition-shadow {held
		? 'relative z-10 opacity-90 shadow-lg ring-2 ring-brand'
		: ''}"
	style={skin}
>
	<span class="w-1 shrink-0" style="background:{colour}"></span>
	<div class="min-w-0 flex-1">
		<!-- The controls sit on this line whether the block is open or shut: a programme is reordered
		     while it is being read, which is exactly when every block is folded away. -->
		<div class="flex min-w-0 items-center {open ? 'py-0.5 pr-1 pl-2.5' : 'py-1 pr-1 pl-2.5'}">
			<button class="press flex min-w-0 flex-1 items-center gap-1 py-1 text-left" onclick={ontoggle}>
				<span class="min-w-0 flex-1">
					<span
						class="block truncate font-semibold {open ? 'text-xs' : 'text-sm'}"
						style="color:{colour}"
					>
						{block.label?.trim() || kindName}
					</span>
					<span class="block truncate text-xs text-muted tabular {open ? 'hidden' : ''}">{figures}</span>
				</span>
				<!-- A chevron for opening and an arrow for moving: the one thing that must not be
				     confused is the caret with the button that sends the block down the list. -->
				<span class="shrink-0 text-muted transition-transform {open ? '' : 'rotate-180'}">
					<Icon name="chevronUp" size={16} />
				</span>
			</button>

			<span class="ml-1 flex shrink-0 items-center">
				{#if ongrab}
					<!-- Held rather than tapped: a programme of a dozen blocks is a dozen taps an arrow
					     at a time, and the arrows stay for the one step nobody wants to drag. -->
					<button
						class="press touch-none rounded-lg p-1.5 text-muted"
						aria-label={$t('workouts.reorder')}
						onpointerdown={ongrab}
					>
						<Icon name="grip" size={16} />
					</button>
				{/if}
				<button class="press rounded-lg p-1.5 text-muted" aria-label={$t('common.up')} onclick={() => onmove(-1)}>
					<Icon name="arrowUp" size={16} />
				</button>
				<button class="press rounded-lg p-1.5 text-muted" aria-label={$t('common.down')} onclick={() => onmove(1)}>
					<span class="block rotate-180"><Icon name="arrowUp" size={16} /></span>
				</button>
				<button class="press rounded-lg p-1.5 text-muted" aria-label={$t('workouts.duplicate')} onclick={onduplicate}>
					<Icon name="copy" size={16} />
				</button>
				<button class="press rounded-lg p-1.5 text-muted" aria-label={$t('common.delete')} onclick={ondelete}>
					<Icon name="trash" size={16} />
				</button>
			</span>
		</div>

	{#if open}
		<div class="px-2.5 pb-2.5">
			<!-- A fixed grid rather than a wrapping row: the labels differ in length in every language,
			     and a card that changes shape with the word in it is what reads as unfinished. -->
			<div class="grid grid-cols-2 gap-1">
				{#each BLOCK_KINDS as kind (kind)}
					<button
						class="press truncate rounded-lg px-2 py-1.5 text-xs font-medium {block.kind === kind
							? ''
							: 'bg-surface/70 text-muted'}"
						style={block.kind === kind
							? `background:${blockColour(kind)};color:${blockTint(kind)}`
							: ''}
						aria-pressed={block.kind === kind}
						onclick={() => setKind(kind)}
					>
						{$t(`workouts.blockKinds.${kind}`)}
					</button>
				{/each}
			</div>

			<div class="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface p-0.5">
				{#each [{ key: 'time', label: $t('workouts.goalTime') }, { key: 'distance', label: $t('workouts.goalDistance') }, { key: 'open', label: $t('workouts.goalOpen') }] as option (option.key)}
					<button
						class="press truncate rounded-md px-2 py-1.5 text-xs font-medium {block.goal.type ===
						option.key
							? 'bg-brand text-brand-ink'
							: 'text-muted'}"
						aria-pressed={block.goal.type === option.key}
						onclick={() => setGoal(option.key as 'time' | 'distance' | 'open')}
					>
						{option.label}
					</button>
				{/each}
			</div>

			<!-- What ends the block and what pace to hold it at, on one line: the control above already
			     says which of the two the left hand side is, so neither needs a label of its own. -->
			<div class="mt-2 grid grid-cols-5 items-end gap-2">
				<div class="col-span-3">
					{#if block.goal.type === 'time'}
						<TimePicker
							{seconds}
							onchange={(value) =>
								onchange({ ...block, goal: { type: 'time', seconds: Math.max(5, value) } })}
						/>
					{:else if block.goal.type === 'distance'}
						<DistanceField
							{metres}
							onchange={(value) =>
								onchange({ ...block, goal: { type: 'distance', metres: Math.max(20, value ?? 20) } })}
						/>
					{:else}
						<p class="pb-2 text-xs text-muted">{$t('workouts.openHint')}</p>
					{/if}
				</div>

				<div class="col-span-2">
					<PacePicker
						pace={block.targetPace}
						onchange={(value) => onchange({ ...block, targetPace: value })}
					/>
				</div>
			</div>

			<input
				class="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-2 text-sm"
				type="text"
				maxlength="40"
				aria-label={$t('workouts.label')}
				placeholder={$t('workouts.labelPlaceholder')}
				value={block.label ?? ''}
				onchange={(event) => onchange({ ...block, label: event.currentTarget.value.trim() || null })}
			/>
		</div>
	{/if}
	</div>
</div>
