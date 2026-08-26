<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import { followable, marked, personColumn } from '$lib/ianseo/rows';
	import type { DocumentSection } from '$lib/ianseo/types';

	/**
	 * A published result list, redrawn.
	 *
	 * The columns ianseo's own stylesheet drops on a narrow screen are the ones folded away here, so
	 * a phone shows the placing, the archer and the score and nothing else. Opening a row gives back
	 * everything that was folded, the lines ianseo hides behind "show details", and the offer to
	 * follow whoever the row names.
	 */
	let {
		section,
		followedLabels,
		onfollow
	}: {
		section: DocumentSection;
		/** Lowercased, because a name is followed as it was written and read back however it is printed. */
		followedLabels: Set<string>;
		onfollow: (kind: 'archer' | 'club', label: string) => void;
	} = $props();

	let open = $state<number | null>(null);

	const width = $derived(section.columns.length || 1);

	/** Where a phrase stops being a phrase and starts being prose, in characters. */
	const PHRASE = 22;

	/**
	 * What each column actually holds, read from the rows rather than from its heading. ianseo heads
	 * every competition in the organiser's own language, so the values are the only thing that says
	 * whether a column is a placing, a score or somebody's name.
	 */
	const shape = $derived(
		section.columns.map((column, at) => {
			const values = section.rows.map((row) => row.cells[at]?.text ?? '').filter(Boolean);
			const longest = values.reduce((most, one) => Math.max(most, one.length), 0);
			const figures = values.length > 0 && values.every((one) => /^[\d.,:/\s+-]+$/.test(one));
			return {
				figures,
				longest,
				/** Prose, which has to be allowed to wrap. A short phrase is better kept on its line. */
				wordy: !figures && longest > PHRASE,
				/** A word or a short phrase: never a figure, never long enough to be worth breaking. */
				phrase: !figures && longest > 8 && longest <= PHRASE,
				label: column.label
			};
		})
	);

	/**
	 * The column that may wrap, which takes whatever width the others do not want. The archer's name
	 * where the document names one, and otherwise whichever column carries the most words.
	 */
	const wrapping = $derived.by(() => {
		const person = personColumn(section.columns);
		if (person !== null && !section.columns[person].secondary) return person;

		let widest = -1;
		let at = 0;
		shape.forEach((column, index) => {
			if (section.columns[index].secondary) return;
			if (column.longest > widest) {
				widest = column.longest;
				at = index;
			}
		});
		return at;
	});

	/**
	 * Columns kept off a narrow screen: the ones ianseo folds itself, and every other column of prose.
	 *
	 * A row of five columns of French is four lines tall on a phone, which turns a list of archers
	 * into a wall. The placing, the name and the figures fit on one line; the club and the class are
	 * behind the arrow, where the rest of the row already is.
	 */
	const folded = $derived(
		section.columns.map(
			(column, at) =>
				column.secondary || ((shape[at].wordy || shape[at].phrase) && at !== wrapping)
		)
	);

	const shown = $derived(folded.filter((one) => !one).length);
	const useDetail = $derived(shown === width);
</script>

<div class="overflow-hidden rounded-2xl border border-line bg-surface">
	{#if section.heading}
		<h3 class="border-b border-line bg-line/25 px-3 py-2 text-sm font-semibold break-words">
			{section.heading}
		</h3>
	{/if}

	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-line text-[10px] tracking-wide text-muted uppercase">
					{#each section.columns as column, at (at)}
						<!--
							Only the short columns are pinned to their content. Everything with words in it is
							left unmeasured, so the table hands each of them width in proportion to what they
							hold: giving one column all the room left starved the rest into a word a line.
						-->
						<th
							class="px-2 py-1.5 font-semibold {folded[at] ? 'hidden md:table-cell' : ''} {shape[at]
								.wordy || at === wrapping
								? 'text-left'
								: shape[at].phrase
									? 'w-px text-left whitespace-nowrap'
									: 'w-px text-right whitespace-nowrap'}"
						>
							{column.label}
						</th>
					{/each}
					<th class="w-6"></th>
				</tr>
			</thead>
			<tbody>
				{#each section.rows as row, index (index)}
					{@const mine = marked(row, followedLabels)}
					{@const offers = followable(row, section.columns)}
					{@const expandable = offers.length > 0 || shown < width || row.detail.length > 0}
					<tr
						class="border-b border-line/60 last:border-0 {row.strong ? 'font-semibold' : ''} {mine
							? 'bg-brand/10'
							: ''}"
					>
						{#each section.columns as column, at (at)}
							<td
								class="px-2 py-2 align-top {folded[at] ? 'hidden md:table-cell' : ''} {shape[at]
									.wordy || at === wrapping
									? 'break-words'
									: shape[at].phrase
										? 'w-px text-left whitespace-nowrap'
										: 'tabular w-px text-right whitespace-nowrap'}"
							>
								{#if at === wrapping && mine}
									<!-- A followed archer is marked on their own line, where the eye is already looking. -->
									<span class="mr-1 inline-block align-middle text-brand-text">
										<Icon name="star" size={12} filled />
									</span>
								{/if}{row.cells[at]?.text ?? ''}
							</td>
						{/each}
						<td class="w-6 px-1 py-2 align-top">
							{#if expandable}
								<button
									class="rounded p-0.5 text-muted"
									aria-expanded={open === index}
									aria-label={$t('ianseo.details')}
									onclick={() => (open = open === index ? null : index)}
								>
									<span class="block {open === index ? '' : 'rotate-180'}">
										<Icon name="chevronUp" size={14} />
									</span>
								</button>
							{/if}
						</td>
					</tr>

					{#if open === index}
						<tr class="border-b border-line/60 bg-line/15">
							<td colspan={width + 1} class="px-3 py-2.5">
								<!-- The folded columns come back as pairs, since without their heading they say nothing. -->
								<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs md:hidden">
									{#each section.columns as column, at (at)}
										{#if folded[at] && row.cells[at]?.text}
											<dt class="text-muted">{column.label}</dt>
											<dd class="break-words">{row.cells[at].text}</dd>
										{/if}
									{/each}
								</dl>

								{#if useDetail}{#each row.detail as line (line)}
									<p class="mt-1 text-xs break-words text-muted">{line}</p>
								{/each}{/if}

								{#if offers.length > 0}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each offers as offer (offer.label)}
											{@const already = followedLabels.has(offer.label.toLowerCase())}
											<button
												class="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium {already
													? 'border-brand/40 bg-brand/10 text-brand-text'
													: 'border-line text-muted'}"
												aria-pressed={already}
												onclick={() => onfollow(offer.kind, offer.label)}
											>
												<Icon name="star" size={12} filled={already} />
												<span class="max-w-48 truncate">
													{already
														? $t('ianseo.unfollowName', { name: offer.label })
														: $t('ianseo.followName', { name: offer.label })}
												</span>
											</button>
										{/each}
									</div>
								{/if}
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>
</div>
