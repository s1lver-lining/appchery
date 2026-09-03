<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import type { ScheduleDay } from '$lib/ianseo/schedule';

	/**
	 * A competition's timetable, drawn as the report prints it: a day to a block, the times down the
	 * left, and what is being shot beside them. Nothing is rearranged and nothing is folded away
	 * unless the archer folds it, because the shape of the printed page is what they will already
	 * have been handed at the greffe.
	 */
	let {
		days,
		closed = new Set<string>(),
		ontoggle
	}: {
		days: ScheduleDay[];
		/** The days the archer has folded away, by the heading the report gives them. */
		closed?: Set<string>;
		/** Absent where the days are not the archer's to fold, which is while something is searched for. */
		ontoggle?: (title: string) => void;
	} = $props();
</script>

<div class="space-y-4">
	<!--
		Keyed by where it sits rather than by what it says. A report that headed the same day twice
		would otherwise be two rows under one name, which is a page that will not draw at all: a
		schedule the app cannot read is answered with the PDF, never with a blank screen.
	-->
	{#each days as day, index (index)}
		{@const shut = Boolean(ontoggle) && closed.has(day.title)}
		<section class="overflow-hidden rounded-2xl border border-line bg-surface">
			<h2 class="bg-line/25 {shut ? '' : 'border-b border-line'}">
				{#if ontoggle}
					<button
						class="press flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold"
						aria-expanded={!shut}
						onclick={() => ontoggle(day.title)}
					>
						<span class="min-w-0 flex-1 break-words">{day.title}</span>
						<span class="shrink-0 text-muted" title={$t(shut ? 'ianseo.openDay' : 'ianseo.closeDay')}>
							<span class="block {shut ? 'rotate-180' : ''}"><Icon name="chevronUp" size={16} /></span>
						</span>
					</button>
				{:else}
					<span class="block px-3 py-2 text-sm font-semibold break-words">{day.title}</span>
				{/if}
			</h2>

			{#if !shut}
				<!--
					One grid a day rather than one a line, so every time in the day lines up under the last.
					The second track is told it may be narrower than what it holds, or an organiser's own
					link to their timings runs the whole day off the side of the phone. A time is set
					smaller than what it is the time of, so the two line up on the writing and not on the box.
				-->
				<div class="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
					{#each day.lines as line, at (at)}
						<div class="tabular text-right text-xs whitespace-nowrap text-muted {line.spaced ? 'mt-2' : ''}">
							{line.time ?? ''}
							{#if line.duration}
								<span class="block text-[10px] opacity-70">{line.duration}</span>
							{/if}
						</div>
						<div class="[overflow-wrap:anywhere] {line.strong ? 'font-semibold' : ''} {line.spaced ? 'mt-2' : ''}">
							{line.text}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/each}
</div>
