<script lang="ts">
	import { t } from '$lib/i18n';
	import type { DiagramName } from '$lib/domain/tuning/guide';

	/**
	 * The few tuning steps that are geometry rather than instruction. Drawn rather than photographed
	 * so they read at any size and in either theme, and kept to the one thing the step is about: a
	 * diagram that shows the whole bow shows nothing.
	 */
	let { name }: { name: DiagramName } = $props();
</script>

<svg
	class="w-full text-ink"
	viewBox="0 0 240 140"
	fill="none"
	stroke="currentColor"
	stroke-width="1.4"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'limbAlignment'}
		<!-- The bow seen down the string: the string should split both limbs and the grip. -->
		<path d="M120 12 C 104 44, 104 96, 120 128" opacity="0.5" />
		<path d="M120 12 C 136 44, 136 96, 120 128" opacity="0.5" />
		<path d="M120 8 L120 132" stroke-dasharray="4 4" class="text-brand-text" stroke="currentColor" />
		<rect x="112" y="56" width="16" height="28" rx="4" opacity="0.6" />
		<!-- The two gaps the eye is judging, marked where the limb is at its widest. -->
		<g class="text-brand-text" stroke="currentColor">
			<path d="M106 40 L120 40" />
			<path d="M106 36 L106 44M120 36 L120 44" />
			<path d="M120 40 L134 40" />
			<path d="M134 36 L134 44" />
		</g>
		<text x="140" y="44" font-size="9" fill="currentColor" stroke="none" class="text-muted">
			{$t('tuning.diagram.equalGaps')}
		</text>
		<text x="8" y="132" font-size="9" fill="currentColor" stroke="none" class="text-muted">
			{$t('tuning.diagram.downString')}
		</text>
	{:else if name === 'centreShot'}
		<!-- Looking down on the riser: the string line, the shaft, and the gap the button sets. -->
		<path d="M40 20 L40 120" stroke-dasharray="4 4" class="text-brand-text" stroke="currentColor" />
		<text x="18" y="16" font-size="9" fill="currentColor" stroke="none" class="text-muted">
			{$t('tuning.diagram.stringLine')}
		</text>
		<path d="M52 30 L52 110" opacity="0.6" />
		<path d="M52 62 L200 62" stroke-width="3" />
		<path d="M200 62 L188 57 L188 67 Z" fill="currentColor" stroke="none" />
		<circle cx="52" cy="62" r="5" opacity="0.7" />
		<g class="text-muted" stroke="currentColor">
			<path d="M40 96 L52 96" />
			<path d="M40 92 L40 100M52 92 L52 100" />
		</g>
		<text x="58" y="100" font-size="9" fill="currentColor" stroke="none" class="text-muted">
			{$t('tuning.diagram.insideCentre')}
		</text>
	{:else if name === 'tiller'}
		<!-- The bow from the side: both measurements taken square to the limb. -->
		<path d="M70 16 C 100 44, 100 96, 70 124" opacity="0.7" />
		<path d="M70 16 L70 124" stroke-dasharray="4 4" opacity="0.8" />
		<rect x="92" y="52" width="12" height="36" rx="3" opacity="0.6" />
		<g class="text-brand-text" stroke="currentColor">
			<path d="M70 34 L96 34" />
			<path d="M70 30 L70 38M96 30 L96 38" />
			<path d="M70 106 L96 106" />
			<path d="M70 102 L70 110M96 102 L96 110" />
		</g>
		<text x="104" y="38" font-size="9" fill="currentColor" stroke="none">{$t('tuning.diagram.upper')}</text>
		<text x="104" y="110" font-size="9" fill="currentColor" stroke="none">{$t('tuning.diagram.lower')}</text>
		<text x="8" y="136" font-size="9" fill="currentColor" stroke="none" class="text-muted">
			{$t('tuning.diagram.tillerFormula')}
		</text>
	{:else if name === 'nockingPoint'}
		<!-- The square on the rest, and the nock set above where it reads. -->
		<path d="M96 12 L96 128" opacity="0.7" />
		<path d="M96 96 L170 96" opacity="0.5" />
		<path d="M96 96 L152 96" stroke-width="3" class="text-brand-text" stroke="currentColor" />
		<rect x="88" y="72" width="16" height="7" rx="2" fill="currentColor" stroke="none" opacity="0.85" />
		<rect x="88" y="58" width="16" height="7" rx="2" fill="currentColor" stroke="none" opacity="0.45" />
		<g class="text-muted" stroke="currentColor">
			<path d="M120 79 L120 96" />
			<path d="M116 79 L124 79M116 96 L124 96" />
		</g>
		<text x="128" y="88" font-size="9" fill="currentColor" stroke="none" class="text-muted">
			{$t('tuning.diagram.aboutHalf')}
		</text>
		<text x="24" y="100" font-size="9" fill="currentColor" stroke="none" class="text-muted">
			{$t('tuning.diagram.squareOnRest')}
		</text>
	{:else if name === 'bareShaft'}
		<!-- The face as it reads: the fletched group, and what each bare shaft position means. -->
		<circle cx="120" cy="70" r="52" opacity="0.35" />
		<circle cx="120" cy="70" r="34" opacity="0.5" />
		<circle cx="120" cy="70" r="16" opacity="0.7" />
		{#each [[112, 64], [124, 62], [118, 76]] as [cx, cy] (cx)}
			<circle {cx} {cy} r="3.4" fill="currentColor" stroke="none" opacity="0.8" />
		{/each}
		<circle cx="74" cy="70" r="4.4" class="text-brand-text" stroke="currentColor" stroke-width="2" />
		<text x="8" y="74" font-size="9" fill="currentColor" stroke="none" class="text-muted">{$t('tuning.diagram.stiff')}</text>
		<circle cx="166" cy="70" r="4.4" class="text-brand-text" stroke="currentColor" stroke-width="2" />
		<text x="176" y="74" font-size="9" fill="currentColor" stroke="none" class="text-muted">{$t('tuning.diagram.weak')}</text>
		<circle cx="120" cy="24" r="4.4" class="text-brand-text" stroke="currentColor" stroke-width="2" />
		<text x="130" y="27" font-size="9" fill="currentColor" stroke="none" class="text-muted">
			{$t('tuning.diagram.nockLow')}
		</text>
		<circle cx="120" cy="116" r="4.4" class="text-brand-text" stroke="currentColor" stroke-width="2" />
		<text x="130" y="119" font-size="9" fill="currentColor" stroke="none" class="text-muted">
			{$t('tuning.diagram.nockHigh')}
		</text>
	{:else if name === 'paperTear'}
		<!-- The four tears, each with the correction it calls for. -->
		{#each [{ x: 26, dx: 0, dy: -1, label: $t('tuning.diagram.tailHigh') }, { x: 86, dx: 0, dy: 1, label: $t('tuning.diagram.tailLow') }, { x: 146, dx: -1, dy: 0, label: $t('tuning.diagram.tailLeft') }, { x: 206, dx: 1, dy: 0, label: $t('tuning.diagram.tailRight') }] as tear (tear.x)}
			<g>
				<rect x={tear.x - 24} y="26" width="48" height="60" rx="3" opacity="0.35" />
				<circle cx={tear.x} cy="56" r="5" opacity="0.8" />
				<path
					d="M{tear.x + tear.dx * 5} {56 + tear.dy * 5} L{tear.x + tear.dx * 22} {56 + tear.dy * 24}"
					class="text-brand-text"
					stroke="currentColor"
					stroke-width="2"
				/>
				<text
					x={tear.x}
					y="102"
					font-size="8.5"
					fill="currentColor"
					stroke="none"
					text-anchor="middle"
					class="text-muted"
				>
					{tear.label}
				</text>
			</g>
		{/each}
	{/if}
</svg>
