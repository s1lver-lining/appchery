<script lang="ts">
	import { t } from '$lib/i18n';
	import { tap } from '$lib/haptics';
	import Icon from '$lib/ui/Icon.svelte';
	import BlockCard from './BlockCard.svelte';
	import { workoutSummary } from './summary';
	import {
		duplicateItem,
		newBlock,
		newRepeat,
		validateWorkout,
		workoutTotals,
		type RunBlock,
		type RunItem,
		type RunWorkout
	} from '$lib/domain/run/workout';

	/**
	 * A programme written block by block.
	 *
	 * A repeat is drawn as a frame around the blocks it repeats rather than as a number on a block,
	 * because that is what an interval session is: 7 times (200 fast, 100 easy) is two blocks inside
	 * one frame, and seeing the frame is what makes the difference to reading it back at a glance.
	 */
	let {
		workout,
		onchange
	}: { workout: RunWorkout; onchange: (workout: RunWorkout) => void } = $props();

	/**
	 * Open unless it has been shut. A programme is written as a whole, so every block shows its own
	 * settings; a block is folded away to see the shape of the session rather than to edit it.
	 */
	let shut = $state<Record<string, boolean>>({});
	const toggle = (id: string) => (shut = { ...shut, [id]: !shut[id] });

	/** Every block there is, repeats unrolled to the blocks inside them, which is what folds. */
	const everyId = $derived(
		workout.items.flatMap((item) =>
			item.type === 'block' ? [item.id] : item.blocks.map((block) => block.id)
		)
	);
	const anyOpen = $derived(everyId.some((id) => !shut[id]));

	/**
	 * All of them at once. A programme is opened to change one block and then has to be shut a block
	 * at a time to see its shape again, which is the state it is read in and the state it is left in.
	 */
	function foldAll() {
		const next: Record<string, boolean> = {};
		for (const id of everyId) next[id] = anyOpen;
		shut = next;
	}

	const totals = $derived(workoutTotals(workout));
	const errors = $derived(validateWorkout(workout));

	const replace = (items: RunItem[]) => onchange({ ...workout, items });

	/**
	 * A block carried to where it belongs.
	 *
	 * The arrows move one step at a time, which is the right gesture for the one block that is in
	 * the wrong place and a dozen taps for a programme being written. Dragging is the same move made
	 * once, and it is the grip that starts it rather than the card itself: the card is scrolled past
	 * far more often than it is moved.
	 *
	 * The list is reordered as the finger passes each card rather than when it is let go, so what is
	 * on the screen is always what would be kept. The editor saves on every change anyway, so there
	 * is no moment where the two disagree.
	 */
	let list = $state<HTMLElement | null>(null);
	let carrying = $state<number | null>(null);

	function grab(index: number, event: PointerEvent) {
		carrying = index;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		tap();
	}

	function carry(event: PointerEvent) {
		if (carrying === null || !list) return;
		const cards = [...list.children] as HTMLElement[];
		// The card whose middle the finger has passed, which is the one it should now be above.
		let to = cards.findIndex((card) => {
			const box = card.getBoundingClientRect();
			return event.clientY < box.top + box.height / 2;
		});
		if (to === -1) to = cards.length - 1;
		if (to === carrying || to < 0) return;
		const items = [...workout.items];
		const [moved] = items.splice(carrying, 1);
		items.splice(to, 0, moved);
		carrying = to;
		tap();
		replace(items);
	}

	const drop = () => (carrying = null);

	function put(index: number, item: RunItem) {
		replace(workout.items.map((current, i) => (i === index ? item : current)));
	}

	function move(index: number, by: -1 | 1) {
		const to = index + by;
		if (to < 0 || to >= workout.items.length) return;
		const items = [...workout.items];
		[items[index], items[to]] = [items[to], items[index]];
		replace(items);
	}

	function duplicate(index: number) {
		const items = [...workout.items];
		items.splice(index + 1, 0, duplicateItem(workout.items[index]));
		replace(items);
	}

	function remove(index: number) {
		replace(workout.items.filter((_, i) => i !== index));
	}

	function insideBlocks(index: number, blocks: RunBlock[]) {
		const item = workout.items[index];
		if (item.type !== 'repeat') return;
		put(index, { ...item, blocks });
	}

	function addInside(index: number) {
		const item = workout.items[index];
		if (item.type !== 'repeat') return;
		const block = newBlock('work');
		if (block.type !== 'block') return;
		const { type: _type, ...bare } = block;
		insideBlocks(index, [...item.blocks, bare]);
	}
</script>

<div class="space-y-3">
	<!--
		Unkeyed on purpose. Keyed by id, moving a block moves its card through the DOM, and a browser
		silently resets the scroll position of anything it reparents without firing a scroll event:
		the wheels came back showing their first row while holding their real value. Unkeyed, a move
		is the same cards taking new values, which is a change the wheels already follow.
	-->
	{#if everyId.length > 1}
		<!-- Over the list rather than under it: it is reached for before reading, not after writing. -->
		<button class="press ml-auto block py-0.5 text-xs font-medium text-muted" onclick={foldAll}>
			{anyOpen ? $t('workouts.foldAll') : $t('workouts.unfoldAll')}
		</button>
	{/if}

	<div
		bind:this={list}
		class="space-y-3 {carrying !== null ? 'touch-none' : ''}"
		onpointermove={carry}
		onpointerup={drop}
		onpointercancel={drop}
		role="presentation"
	>
	{#each workout.items as item, index}
		{#if item.type === 'block'}
			<BlockCard
				block={item}
				open={!shut[item.id]}
				held={carrying === index}
				ontoggle={() => toggle(item.id)}
				onchange={(block) => put(index, { ...block, type: 'block' })}
				onduplicate={() => duplicate(index)}
				ondelete={() => remove(index)}
				onmove={(by) => move(index, by)}
				ongrab={(event) => grab(index, event)}
			/>
		{:else}
			<div
				class="rounded-xl border-2 border-dashed border-brand/40 bg-brand/5 p-2 {carrying === index
					? 'relative z-10 opacity-90 shadow-lg ring-2 ring-brand'
					: ''}"
			>
				<div class="mb-2 flex items-center gap-2 px-1">
					<span class="text-sm font-semibold">{$t('workouts.repeat')}</span>
					<input
						class="w-16 rounded-lg border border-line bg-bg px-2 py-1 text-base tabular"
						type="number"
						inputmode="numeric"
						min="2"
						max="60"
						aria-label={$t('workouts.timesLabel')}
						value={item.times}
						onchange={(event) =>
							put(index, {
								...item,
								times: Math.min(60, Math.max(2, Number(event.currentTarget.value) || 2))
							})}
					/>
					<span class="flex-1 text-sm text-muted">{$t('workouts.times')}</span>
					<button
						class="press touch-none rounded-lg p-1.5 text-muted"
						aria-label={$t('workouts.reorder')}
						onpointerdown={(event) => grab(index, event)}
					>
						<Icon name="grip" size={16} />
					</button>
					<button
						class="press rounded-lg p-1.5 text-muted"
						aria-label={$t('common.up')}
						onclick={() => move(index, -1)}
					>
						<Icon name="arrowUp" size={16} />
					</button>
					<button
						class="press rounded-lg p-1.5 text-muted"
						aria-label={$t('common.down')}
						onclick={() => move(index, 1)}
					>
						<span class="block rotate-180"><Icon name="arrowUp" size={16} /></span>
					</button>
					<button
						class="press rounded-lg p-1.5 text-muted"
						aria-label={$t('workouts.duplicate')}
						onclick={() => duplicate(index)}
					>
						<Icon name="copy" size={16} />
					</button>
					<button
						class="press rounded-lg p-1.5 text-muted"
						aria-label={$t('common.delete')}
						onclick={() => remove(index)}
					>
						<Icon name="trash" size={16} />
					</button>
				</div>

				<div class="space-y-2">
					{#each item.blocks as block, inner}
						<BlockCard
							{block}
							open={!shut[block.id]}
							ontoggle={() => toggle(block.id)}
							onchange={(edited) =>
								insideBlocks(
									index,
									item.blocks.map((current, i) => (i === inner ? edited : current))
								)}
							onduplicate={() => {
								const blocks = [...item.blocks];
								const copy = duplicateItem({ ...block, type: 'block' });
								if (copy.type !== 'block') return;
								const { type: _type, ...bare } = copy;
								blocks.splice(inner + 1, 0, bare);
								insideBlocks(index, blocks);
							}}
							ondelete={() =>
								insideBlocks(
									index,
									item.blocks.filter((_, i) => i !== inner)
								)}
							onmove={(by) => {
								const to = inner + by;
								if (to < 0 || to >= item.blocks.length) return;
								const blocks = [...item.blocks];
								[blocks[inner], blocks[to]] = [blocks[to], blocks[inner]];
								insideBlocks(index, blocks);
							}}
						/>
					{/each}
				</div>

				<button
					class="press mt-2 w-full rounded-lg border border-line py-2 text-sm font-medium text-muted"
					onclick={() => addInside(index)}
				>
					{$t('workouts.addBlock')}
				</button>
			</div>
		{/if}
	{/each}
	</div>

	<div class="flex gap-2">
		<button
			class="press flex-1 rounded-xl border border-line bg-surface py-3 text-sm font-semibold"
			onclick={() => replace([...workout.items, newBlock(workout.items.length === 0 ? 'warmup' : 'work')])}
		>
			<span class="mr-1 inline-block align-[-2px]"><Icon name="plus" size={16} /></span>
			{$t('workouts.addBlock')}
		</button>
		<button
			class="press flex-1 rounded-xl border border-line bg-surface py-3 text-sm font-semibold"
			onclick={() => replace([...workout.items, newRepeat()])}
		>
			<span class="mr-1 inline-block align-[-2px]"><Icon name="plus" size={16} /></span>
			{$t('workouts.addRepeat')}
		</button>
	</div>

	{#if workout.items.length > 0}
		<p class="text-center text-sm text-muted tabular">{workoutSummary(workout, $t)}</p>
	{/if}

	{#if errors.length > 0}
		<p class="text-center text-xs text-danger">{$t('workouts.outOfRange')}</p>
	{/if}
</div>
