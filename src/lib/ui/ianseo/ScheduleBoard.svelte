<script lang="ts">
	import type { ScheduleDay } from '$lib/ianseo/schedule';

	/**
	 * A competition's timetable, drawn as the report prints it: a day to a block, the times down the
	 * left, and what is being shot beside them. Nothing is rearranged and nothing is folded away.
	 * An archer reads a schedule to find the one line that is theirs, and the shape of the printed
	 * page is what they will already have been handed at the greffe.
	 */
	let { days }: { days: ScheduleDay[] } = $props();
</script>

{#each days as day (day.title)}
	<section class="overflow-hidden rounded-2xl border border-line bg-surface">
		<h2 class="border-b border-line bg-line/25 px-3 py-2 text-sm font-semibold">{day.title}</h2>
		<!--
			One grid a day rather than one a line, so every time in the day lines up under the last. The
			second track is told it may be narrower than what it holds, or an organiser's own link to
			their timings runs the whole day off the side of the phone.
		-->
		<div class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-3 py-2 text-sm">
			{#each day.lines as line, at (at)}
				<div class="tabular pt-1 text-right text-xs whitespace-nowrap text-muted {line.spaced ? 'mt-2' : ''}">
					{line.time ?? ''}
					{#if line.duration}
						<span class="block text-[10px] opacity-70">{line.duration}</span>
					{/if}
				</div>
				<div class="pt-1 [overflow-wrap:anywhere] {line.strong ? 'font-semibold' : ''} {line.spaced ? 'mt-2' : ''}">
					{line.text}
				</div>
			{/each}
		</div>
	</section>
{/each}
