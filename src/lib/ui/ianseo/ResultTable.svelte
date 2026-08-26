<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import { bodyColumn, followable, marked } from '$lib/ianseo/rows';
	import { clubName } from '$lib/ianseo/clubs';
	import { ianseoFullClubNames } from '$lib/prefs';
	import { NO_CHOICE, shapeOf, visibleColumns, wrappingColumn, type ColumnChoice } from '$lib/ianseo/columns';
	import type { DocumentSection } from '$lib/ianseo/types';

	/**
	 * A published result list, redrawn.
	 *
	 * The table carries the few columns that tell one line from the next, plus whichever others the
	 * archer has asked for. Opening a row gives back the whole of it, every column the document holds
	 * whatever the table is showing, the lines ianseo hides behind "show details", and the offer to
	 * follow whoever the row names.
	 */
	let {
		section,
		choice = NO_CHOICE,
		followedLabels,
		onfollow
	}: {
		section: DocumentSection;
		/** Which columns the archer has asked for, and which they have sent away. */
		choice?: ColumnChoice;
		/** Lowercased, because a name is followed as it was written and read back however it is printed. */
		followedLabels: Set<string>;
		onfollow: (kind: 'archer' | 'club', label: string) => void;
	} = $props();

	let open = $state<number | null>(null);

	const shape = $derived(shapeOf(section));
	const wrapping = $derived(wrappingColumn(section, shape));
	const visible = $derived(visibleColumns(section, choice, shape));
	const width = $derived(visible.filter(Boolean).length || 1);

	/** The column a club is written in, which is the one the federation's own reference sits in front of. */
	const club = $derived(bodyColumn(section.columns));
	const named = (at: number, value: string) =>
		at === club ? clubName(value, $ianseoFullClubNames) : value;
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
						{#if visible[at]}
						<!--
							Only the short columns are pinned to their content. Everything with words in it is
							left unmeasured, so the table hands each of them width in proportion to what they
							hold: giving one column all the room left starved the rest into a word a line.
						-->
						<th
							class="px-2 py-1.5 font-semibold {shape[at].wordy || at === wrapping
								? 'text-left'
								: shape[at].phrase
									? 'w-px text-left whitespace-nowrap'
									: 'w-px text-right whitespace-nowrap'}"
						>
							{column.label}
						</th>
						{/if}
					{/each}
					<th class="w-6"></th>
				</tr>
			</thead>
			<tbody>
				{#each section.rows as row, index (index)}
					{@const mine = marked(row, followedLabels)}
					{@const offers = followable(row, section.columns)}
					<!-- Always: the row opens onto everything the document holds, columns and all. -->
					{@const expandable = true}
					<tr
						class="border-b border-line/60 last:border-0 {row.strong ? 'font-semibold' : ''} {mine
							? 'bg-brand/10'
							: ''}"
					>
						{#each section.columns as column, at (at)}
							{#if visible[at]}
							<td
								class="px-2 py-2 align-top {shape[at].wordy || at === wrapping
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
								{/if}{named(at, row.cells[at]?.text ?? '')}
							</td>
							{/if}
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
								<!--
									The whole row, not only the part the table left out: what a column choice
									decides is what fits across a line, never what the archer is allowed to read.
								-->
								<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
									{#each section.columns as column, at (at)}
										{#if column.label && row.cells[at]?.text}
											<dt class="text-muted">{column.label}</dt>
											<!-- The whole of it here, reference and all: this is the row read out in full. -->
											<dd class="break-words">{row.cells[at].text}</dd>
										{/if}
									{/each}
								</dl>

								{#each row.detail as line (line)}
									<p class="mt-1 text-xs break-words text-muted">{line}</p>
								{/each}

								{#if offers.length > 0}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each offers as offer (offer.label)}
											{@const already = followedLabels.has(offer.label.toLowerCase())}
											{@const shown =
												offer.kind === 'club'
													? clubName(offer.label, $ianseoFullClubNames)
													: offer.label}
											<button
												class="press flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium {already
													? 'border-brand/40 bg-brand/10 text-brand-text'
													: 'border-line text-muted'}"
												aria-pressed={already}
												onclick={() => onfollow(offer.kind, offer.label)}
											>
												<Icon name="star" size={12} filled={already} />
												<span class="max-w-48 truncate">
													{already
														? $t('ianseo.unfollowName', { name: shown })
														: $t('ianseo.followName', { name: shown })}
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
