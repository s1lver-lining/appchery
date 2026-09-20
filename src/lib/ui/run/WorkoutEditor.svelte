<script lang="ts">
	import { t } from '$lib/i18n';
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
		onchange,
		showName = true
	}: { workout: RunWorkout; onchange: (workout: RunWorkout) => void; showName?: boolean } = $props();

	/**
	 * Open unless it has been shut. A programme is written as a whole, so every block shows its own
	 * settings; a block is folded away to see the shape of the session rather than to edit it.
	 */
	let shut = $state<Record<string, boolean>>({});
	const toggle = (id: string) => (shut = { ...shut, [id]: !shut[id] });

	const totals = $derived(workoutTotals(workout));
	const errors = $derived(validateWorkout(workout));

	const replace = (items: RunItem[]) => onchange({ ...workout, items });

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

	function drop(index: number) {
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
	{#if showName}
		<label class="block">
			<span class="text-sm text-muted">{$t('workouts.name')}</span>
			<input
				class="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-lg"
				type="text"
				maxlength="60"
				placeholder={$t('workouts.namePlaceholder')}
				value={workout.name}
				oninput={(event) => onchange({ ...workout, name: event.currentTarget.value })}
			/>
		</label>
	{/if}

	<!--
		Unkeyed on purpose. Keyed by id, moving a block moves its card through the DOM, and a browser
		silently resets the scroll position of anything it reparents without firing a scroll event:
		the wheels came back showing their first row while holding their real value. Unkeyed, a move
		is the same cards taking new values, which is a change the wheels already follow.
	-->
	{#each workout.items as item, index}
		{#if item.type === 'block'}
			<BlockCard
				block={item}
				open={!shut[item.id]}
				ontoggle={() => toggle(item.id)}
				onchange={(block) => put(index, { ...block, type: 'block' })}
				onduplicate={() => duplicate(index)}
				ondelete={() => drop(index)}
				onmove={(by) => move(index, by)}
			/>
		{:else}
			<div class="rounded-xl border-2 border-dashed border-brand/40 bg-brand/5 p-2">
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
						class="press rounded-lg p-1.5 text-muted"
						aria-label={$t('common.up')}
						onclick={() => move(index, -1)}
					>
						<Icon name="chevronUp" size={16} />
					</button>
					<button
						class="press rounded-lg p-1.5 text-muted"
						aria-label={$t('common.down')}
						onclick={() => move(index, 1)}
					>
						<span class="block rotate-180"><Icon name="chevronUp" size={16} /></span>
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
						onclick={() => drop(index)}
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
