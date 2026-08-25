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
	const primary = $derived(section.columns.filter((column) => !column.secondary).length);

	/**
	 * ianseo's own "show details" lines are the row again, written out for the narrow layout it
	 * ships. They are shown only where there are no folded columns to show instead: with both, the
	 * archer reads the same club twice and the same distances twice under worse labels.
	 */
	const useDetail = $derived(primary === width);

	/**
	 * The one column allowed to wrap, which takes whatever width the others do not want. Every other
	 * column here is a figure, and a figure broken over two lines is unreadable at any width.
	 *
	 * The archer's name is that column where the document has one. Where it does not, the column
	 * whose text is longest is, which is the same answer for a table of clubs or of countries.
	 */
	const wrapping = $derived.by(() => {
		const person = personColumn(section.columns);
		if (person !== null && !section.columns[person].secondary) return person;

		let widest = 0;
		let at = 0;
		section.columns.forEach((column, index) => {
			if (column.secondary) return;
			const length = section.rows.reduce(
				(total, row) => total + (row.cells[index]?.text.length ?? 0),
				0
			);
			if (length > widest) {
				widest = length;
				at = index;
			}
		});
		return at;
	});
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
						<th
							class="px-2 py-1.5 font-semibold {column.secondary ? 'hidden md:table-cell' : ''} {at ===
							wrapping
								? 'w-full text-left'
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
					{@const expandable = offers.length > 0 || primary < width || row.detail.length > 0}
					<tr
						class="border-b border-line/60 last:border-0 {row.strong ? 'font-semibold' : ''} {mine
							? 'bg-brand/10'
							: ''}"
					>
						{#each section.columns as column, at (at)}
							<td
								class="px-2 py-2 align-top {column.secondary ? 'hidden md:table-cell' : ''} {at ===
								wrapping
									? 'w-full break-words'
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
										{#if column.secondary && row.cells[at]?.text}
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
