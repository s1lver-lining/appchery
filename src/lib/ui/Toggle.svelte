<script lang="ts">
	let {
		checked = false,
		disabled = false,
		label,
		onchange
	}: {
		checked?: boolean;
		disabled?: boolean;
		label: string;
		onchange: (value: boolean) => void;
	} = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	{disabled}
	class="relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40
		{checked ? 'bg-brand' : 'bg-line'}"
	onclick={() => onchange(!checked)}
>
	<span
		class="absolute top-1 h-5 w-5 rounded-full bg-surface shadow transition-all
			{checked ? 'left-6' : 'left-1'}"
	></span>
</button>
