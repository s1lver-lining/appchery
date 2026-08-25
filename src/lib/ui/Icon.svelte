<script lang="ts">
	// Drawn on a 24 unit grid with stroked geometry so every icon shares one weight and inherits currentColor.
	export type IconName =
		| 'home'
		| 'target'
		| 'bow'
		| 'chart'
		| 'sliders'
		| 'plus'
		| 'trash'
		| 'camera'
		| 'wrench'
		| 'sight'
		| 'eye'
		| 'eyeOff'
		| 'close'
		| 'search'
		| 'calendar'
		| 'clock'
		| 'back'
		| 'sun'
		| 'cloud'
		| 'rain'
		| 'snow'
		| 'fog'
		| 'storm'
		| 'star'
		| 'medal'
		| 'podium'
		| 'refresh'
		| 'chevronUp'
		| 'check'
		| 'edit'
		| 'dots'
		| 'grid'
		| 'list'
		| 'share'
		| 'qr'
		| 'bulb'
		| 'muscle'
		| 'exercise'
		| 'run'
		| 'friends'
		| 'level'
		| 'help';

	let {
		name,
		size = 24,
		filled = false
	}: { name: IconName; size?: number; filled?: boolean } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={filled ? 2.1 : 1.6}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'home'}
		<path d="M3.6 10.4 12 3.8l8.4 6.6" />
		<path d="M5.6 9v10.2a.8.8 0 0 0 .8.8h11.2a.8.8 0 0 0 .8-.8V9" />
		<path d="M9.8 20V13.6h4.4V20" />
	{:else if name === 'target'}
		<circle cx="12" cy="12" r="9" />
		<circle cx="12" cy="12" r="5.2" />
		<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
	{:else if name === 'bow'}
		<!-- A recurve seen from the side: limbs curving back, string drawn straight, arrow nocked. -->
		<path d="M7.5 3.2c3.6 2 5.6 5.2 5.6 8.8s-2 6.8-5.6 8.8" />
		<path d="M7.5 3.2c1.4 .5 2.2 1.3 2.4 2.4M7.5 20.8c1.4-.5 2.2-1.3 2.4-2.4" />
		<path d="M9.9 5.6v12.8" />
		<path d="M4.6 12h9.8" />
		<path d="M18.4 12h2.6M18.4 12l-1.9-1.9M18.4 12l-1.9 1.9" />
	{:else if name === 'chart'}
		<path d="M4 19.5V4.5" />
		<path d="M4 19.5h16" />
		<path d="M7.6 16.4v-4.2M12 16.4V7.8M16.4 16.4v-6.4" />
	{:else if name === 'sliders'}
		<path d="M4 7.5h9M17.5 7.5H20" />
		<path d="M4 16.5h3.5M12 16.5h8" />
		<circle cx="15.2" cy="7.5" r="2.3" />
		<circle cx="9.7" cy="16.5" r="2.3" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'trash'}
		<path d="M4.5 7h15" />
		<path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
		<path d="M6.8 7l.8 11.4A1.6 1.6 0 0 0 9.2 20h5.6a1.6 1.6 0 0 0 1.6-1.6L17.2 7" />
		<path d="M10.5 11v5M13.5 11v5" />
	{:else if name === 'camera'}
		<path d="M3.5 8.6A1.6 1.6 0 0 1 5.1 7h2.3l1.3-2.1h6.6L16.6 7h2.3a1.6 1.6 0 0 1 1.6 1.6v8.8a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6z" />
		<circle cx="12" cy="12.8" r="3.4" />
	{:else if name === 'sight'}
		<circle cx="12" cy="12" r="6.4" />
		<path d="M12 2.4v3.6M12 18v3.6M2.4 12h3.6M18 12h3.6" />
		<circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
	{:else if name === 'eye'}
		<path d="M2.6 12s3.4-6 9.4-6 9.4 6 9.4 6-3.4 6-9.4 6-9.4-6-9.4-6z" />
		<circle cx="12" cy="12" r="2.8" />
	{:else if name === 'eyeOff'}
		<path d="M4.2 8.2C3 9.6 2.6 12 2.6 12s3.4 6 9.4 6a10 10 0 0 0 4-.8" />
		<path d="M9.6 6.3A10 10 0 0 1 12 6c6 0 9.4 6 9.4 6a17 17 0 0 1-2.9 3.5" />
		<path d="M9.9 9.9a2.9 2.9 0 0 0 4.1 4.1" />
		<path d="M3.6 3.6l16.8 16.8" />
	{:else if name === 'back'}
		<path d="M15 5l-7 7 7 7" />
	{:else if name === 'close'}
		<path d="M6 6l12 12M18 6L6 18" />
	{:else if name === 'clock'}
		<circle cx="12" cy="12" r="8.6" />
		<path d="M12 7.2V12l3.2 2" />
	{:else if name === 'calendar'}
		<rect x="3.2" y="5" width="17.6" height="15.8" rx="2.6" />
		<path d="M3.2 9.6h17.6M8 2.8v4M16 2.8v4" />
	{:else if name === 'search'}
		<circle cx="10.5" cy="10.5" r="6.5" />
		<path d="M15.2 15.2L21 21" />
	{:else if name === 'sun'}
		<circle cx="12" cy="12" r="4.2" />
		<path d="M12 2.6v2.4M12 19v2.4M4.3 4.3l1.7 1.7M18 18l1.7 1.7M2.6 12H5M19 12h2.4M4.3 19.7L6 18M18 6l1.7-1.7" />
	{:else if name === 'cloud'}
		<path d="M7.4 18.4a4.2 4.2 0 0 1-.4-8.4 5.4 5.4 0 0 1 10.3 1.4 3.5 3.5 0 0 1-.6 7z" />
	{:else if name === 'rain'}
		<path d="M7.4 15.4a4.2 4.2 0 0 1-.4-8.4 5.4 5.4 0 0 1 10.3 1.4 3.5 3.5 0 0 1-.6 7z" />
		<path d="M9 18.4l-.8 2.4M13 18.4l-.8 2.4M17 18.4l-.8 2.4" />
	{:else if name === 'snow'}
		<path d="M7.4 15.4a4.2 4.2 0 0 1-.4-8.4 5.4 5.4 0 0 1 10.3 1.4 3.5 3.5 0 0 1-.6 7z" />
		<path d="M9 19.4h.01M13 19.4h.01M17 19.4h.01M11 21.6h.01M15 21.6h.01" />
	{:else if name === 'fog'}
		<path d="M7.4 13.4a4.2 4.2 0 0 1-.4-8.4 5.4 5.4 0 0 1 10.3 1.4 3.5 3.5 0 0 1-.6 7z" />
		<path d="M5 17h14M7 20.4h10" />
	{:else if name === 'storm'}
		<path d="M7.4 14.4a4.2 4.2 0 0 1-.4-8.4 5.4 5.4 0 0 1 10.3 1.4 3.5 3.5 0 0 1-.6 7z" />
		<path d="M13 16.4l-2.6 3.6h3l-2 2.4" />
	{:else if name === 'wrench'}
		<path d="M15.6 3.6a5.4 5.4 0 0 0-5.1 8.9L4 19a2 2 0 0 0 2.8 2.8l6.5-6.5a5.4 5.4 0 0 0 6.6-7.4l-3 3-2.5-2.5 3-3a5.4 5.4 0 0 0-1.8-1.8z" />
	{:else if name === 'medal'}
		<!-- A medal on its ribbon: what a competition leaves behind. -->
		<path d="M8 3l3.2 6M16 3l-3.2 6" />
		<circle cx="12" cy="15.4" r="6.2" fill={filled ? 'currentColor' : 'none'} />
		<path d="M12 12.2l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.2-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z" />
	{:else if name === 'edit'}
		<path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z" />
		<path d="M13.5 6.5l4 4" />
	{:else if name === 'share'}
		<!-- A card going out: the arrow leaves the box rather than pointing into it. -->
		<path d="M12 3.6v11" />
		<path d="M8.4 7.2 12 3.6l3.6 3.6" />
		<path d="M5.5 12.4v6.4a1.6 1.6 0 0 0 1.6 1.6h9.8a1.6 1.6 0 0 0 1.6-1.6v-6.4" />
	{:else if name === 'qr'}
		<!-- Three corners and a scatter of modules: a code drawn small enough to still read as one. -->
		<rect x="3.4" y="3.4" width="6.4" height="6.4" rx="1.2" />
		<rect x="14.2" y="3.4" width="6.4" height="6.4" rx="1.2" />
		<rect x="3.4" y="14.2" width="6.4" height="6.4" rx="1.2" />
		<path d="M6.6 6.6h.01M17.4 6.6h.01M6.6 17.4h.01" stroke-width="2.6" />
		<path d="M14.2 14.2h2.6v2.6h-2.6zM18.6 14.2h2M14.2 18.6v2M18 18.6h2.6M17.4 21h.01" />
	{:else if name === 'friends'}
		<!-- Two archers on the line, the near one whole and the other a shoulder behind them. -->
		<circle cx="9" cy="7.6" r="3.1" />
		<path d="M3.4 19.6a5.6 5.6 0 0 1 11.2 0" />
		<path d="M16.2 5.2a3.1 3.1 0 0 1 0 5.6" />
		<path d="M17.6 14.6a5.6 5.6 0 0 1 3 5" />
	{:else if name === 'muscle'}
		<!-- A back seen from behind: two shoulder blades with the spine drawn down between them. -->
		<circle cx="12" cy="4.4" r="2.4" />
		<path d="M6.2 11.2 8 8.4a2.4 2.4 0 0 1 2-1.1h4a2.4 2.4 0 0 1 2 1.1l1.8 2.8" />
		<path d="M12 8.6v11.2" />
		<path d="M11 12.4 8.4 10.6M13 12.4l2.6-1.8" />
		<path d="M7.6 19.8h8.8" />
	{:else if name === 'exercise'}
		<!-- A dumbbell: the work done away from the shooting line. -->
		<path d="M3 9.6v4.8M6 7.4v9.2M18 7.4v9.2M21 9.6v4.8" />
		<path d="M6 12h12" />
	{:else if name === 'run'}
		<!-- A runner mid stride: the lean and the opposite arm are what make it a run and not a walk. -->
		<circle cx="15.4" cy="4.4" r="2" />
		<path d="M13.8 20.6 15 14.6l-3-2.6 1-5.2" />
		<path d="M13 6.8 9.2 8.6 7.6 12" />
		<path d="M13 11.6l3.2 2.2 1.4 4.6" />
		<path d="M12 18.2 8.6 20.8" />
	{:else if name === 'bulb'}
		<!-- The lamp over the head: something you did not know the app could do. -->
		<path d="M9.2 17.4a6 6 0 1 1 5.6 0" />
		<path d="M9.6 17.6h4.8M10.4 20.4h3.2" />
	{:else if name === 'level'}
		<!-- Chevrons climbing: a level is the one above the last one. -->
		<path d="M6 18.4l6-4.4 6 4.4" />
		<path d="M6 12.4l6-4.4 6 4.4" />
		<path d="M9.6 5.2L12 3.4l2.4 1.8" />
	{:else if name === 'help'}
		<circle cx="12" cy="12" r="9" />
		<path d="M9.5 9.4a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2-2.5 3.6" />
		<circle cx="12" cy="17.4" r="1" fill="currentColor" stroke="none" />
	{:else if name === 'dots'}
		<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
		<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
		<circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
	{:else if name === 'grid'}
		<rect x="3.6" y="3.6" width="7" height="7" rx="1.4" />
		<rect x="13.4" y="3.6" width="7" height="7" rx="1.4" />
		<rect x="3.6" y="13.4" width="7" height="7" rx="1.4" />
		<rect x="13.4" y="13.4" width="7" height="7" rx="1.4" />
	{:else if name === 'list'}
		<path d="M4 6.5h16M4 12h16M4 17.5h16" />
	{:else if name === 'chevronUp'}
		<path d="M6 14.5L12 8.5l6 6" />
	{:else if name === 'check'}
		<path d="M5 12.5l4.5 4.5L19 7" />
	{:else if name === 'refresh'}
		<!-- A circle that does not quite close, with the arrow that carries it round. -->
		<path d="M20.2 12a8.2 8.2 0 1 1-2.4-5.8" />
		<path d="M20.4 3.6v5h-5" />
	{:else if name === 'podium'}
		<!-- A podium seen from the front, second, first and third: a competition once it is over. -->
		<path d="M9.2 12.4h5.6v8.4H9.2z" fill={filled ? 'currentColor' : 'none'} />
		<path d="M3.2 15.6h6v5.2h-6z" />
		<path d="M14.8 17.2h6v3.6h-6z" />
		<path d="M12.0 2.7 L12.9 5.0 L15.4 5.2 L13.5 6.8 L14.1 9.2 L12.0 7.8 L9.9 9.2 L10.5 6.8 L8.6 5.2 L11.1 5.0 Z" fill={filled ? 'currentColor' : 'none'} />
	{:else if name === 'star'}
		<path
			d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"
			fill={filled ? 'currentColor' : 'none'}
		/>
	{/if}
</svg>
