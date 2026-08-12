<script lang="ts">
	import { t } from '$lib/i18n';
	import { matchesQuery } from '$lib/domain/sessions';

	/**
	 * A name typed by hand, with the ones already used offered underneath it. Opponents are free text
	 * and always will be, but an archer met twice should be one name in the history rather than two
	 * spellings of it, and choosing beats remembering.
	 */
	let {
		value,
		known = [],
		placeholder,
		onchange
	}: {
		value: string | null;
		/** Names used before, most recent first. */
		known?: string[];
		placeholder: string;
		onchange: (name: string | null) => void;
	} = $props();

	let typed = $state('');
	let open = $state(false);

	// Reset when the caller hands over a different name, so the field never shows a stale draft.
	$effect(() => {
		typed = value ?? '';
	});

	/** What is offered: names that match what has been typed, minus the one already exactly typed. */
	const offered = $derived(
		known
			.filter((name) => name !== typed.trim() && matchesQuery(typed, [name]))
			.slice(0, 6)
	);

	function commit(name: string) {
		typed = name;
		open = false;
		onchange(name.trim() || null);
	}
</script>

<div class="relative min-w-0 flex-1">
	<input
		class="w-full rounded-lg border border-line bg-bg p-2 text-sm text-ink"
		{placeholder}
		aria-label={placeholder}
		autocomplete="off"
		value={typed}
		oninput={(event) => {
			typed = event.currentTarget.value;
			open = true;
		}}
		onfocus={() => (open = true)}
		onchange={() => onchange(typed.trim() || null)}
	/>

	{#if open && offered.length > 0}
		<!-- Over the fields below rather than pushing them down: a suggestion list that moves the form
			under the thumb is a list that gets tapped by accident. -->
		<ul
			class="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-xl"
		>
			{#each offered as name (name)}
				<li>
					<button
						class="w-full truncate px-3 py-2 text-left text-sm"
						onclick={() => commit(name)}
					>
						{name}
					</button>
				</li>
			{/each}
			<li class="border-t border-line">
				<button
					class="w-full px-3 py-1.5 text-left text-xs text-muted"
					onclick={() => (open = false)}
				>
					{$t('common.close')}
				</button>
			</li>
		</ul>
	{/if}
</div>
