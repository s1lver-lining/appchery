<script lang="ts">
	import { t } from '$lib/i18n';
	import WheelPicker from '$lib/ui/WheelPicker.svelte';

	/**
	 * A length of time, dragged rather than typed: an hour, minutes and seconds, because a run is an
	 * hour and ten and a recovery is ninety seconds, and a field in minutes alone cannot say either.
	 *
	 * Each wheel carries its unit in the values it shows, so the row needs one label rather than
	 * four, and the labels the wheels keep are there for a screen reader.
	 *
	 * The rows are short on purpose: sixty minutes is a long wheel, and a short row is both less of
	 * the screen and fewer pixels of drag per minute, which is the same complaint answered twice.
	 */
	let {
		seconds,
		onchange,
		label,
		item = 28
	}: {
		seconds: number;
		onchange: (seconds: number) => void;
		label?: string | null;
		item?: number;
	} = $props();

	const HOURS = Array.from({ length: 10 }, (_, i) => i);
	const MINUTES = Array.from({ length: 60 }, (_, i) => i);
	/** Five second steps: nobody plans a block to the second, and a wheel of sixty is a long drag. */
	const SECONDS = Array.from({ length: 12 }, (_, i) => i * 5);

	const whole = $derived(Math.max(0, Math.round(seconds)));
	const hours = $derived(Math.floor(whole / 3600));
	const minutes = $derived(Math.floor((whole % 3600) / 60));
	/**
	 * Rounded down rather than to the nearest. Fifty eight seconds rounds up to sixty, which is not
	 * a row on the wheel: it showed nothing selected, and touching the minutes then stored the extra
	 * minute. A tracked run handed to this to be corrected is where those seconds come from.
	 */
	const rest = $derived(Math.floor((whole % 60) / 5) * 5);

	const set = (h: number, m: number, s: number) => onchange(h * 3600 + m * 60 + s);
</script>

<div>
	{#if label}<span class="text-sm text-muted">{label}</span>{/if}
	<!-- One frame around the three, because an hour, its minutes and its seconds are one figure. -->
	<div class="mt-1 grid grid-cols-3 divide-x divide-line overflow-hidden rounded-lg border border-line">
		<WheelPicker
			values={HOURS}
			value={hours}
			{item}
			labelHidden
			flush
			label={$t('common.hour')}
			format={(value) => `${value} ${$t('running.hoursShort')}`}
			onchange={(value) => set(value, minutes, rest)}
		/>
		<WheelPicker
			values={MINUTES}
			value={minutes}
			{item}
			labelHidden
			flush
			label={$t('common.minute')}
			format={(value) => `${value} ${$t('running.minutesShort')}`}
			onchange={(value) => set(hours, value, rest)}
		/>
		<WheelPicker
			values={SECONDS}
			value={rest}
			{item}
			labelHidden
			flush
			label={$t('running.secondsShort')}
			format={(value) => `${value} ${$t('running.secondsShort')}`}
			onchange={(value) => set(hours, minutes, value)}
		/>
	</div>
</div>
