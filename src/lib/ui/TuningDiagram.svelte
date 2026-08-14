<script lang="ts">
	import { t } from '$lib/i18n';
	import type { DiagramName } from '$lib/domain/tuning/guide';

	/**
	 * The few tuning steps that are geometry rather than instruction. Drawn rather than photographed
	 * so they read at any size and in either theme, and kept to the one thing the step is about: a
	 * diagram that shows the whole bow shows nothing.
	 *
	 * Where a step is about telling right from wrong, the picture shows both side by side, because a
	 * single correct drawing never says what the fault looks like.
	 */
	let { name }: { name: DiagramName } = $props();

	const RIGHT = 'M-5 0 L-1.5 3.5 L5 -3.5';
	const WRONG = 'M-4 -4 L4 4 M4 -4 L-4 4';
</script>

<svg
	class="w-full text-ink"
	viewBox="0 0 240 150"
	fill="none"
	stroke="currentColor"
	stroke-width="1.4"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'limbAlignment'}
		<!--
			The bow seen down the string, twice: the string splitting the limb, and the same limb sat
			off to one side. The pair is the point, since the fault only reads against the good case.
		-->
		{#each [{ x: 62, off: 0, ok: true }, { x: 178, off: 9, ok: false }] as panel (panel.x)}
			<g>
				<!-- Limb tip and fadeout, drawn as a taper so its own centre line is readable. -->
				<path
					d="M{panel.x + panel.off - 7} 20 L{panel.x + panel.off + 7} 20 L{panel.x +
						panel.off +
						13} 88 L{panel.x + panel.off - 13} 88 Z"
					opacity="0.3"
					fill="currentColor"
					stroke="none"
				/>
				<path
					d="M{panel.x + panel.off} 20 L{panel.x + panel.off} 88"
					stroke-dasharray="3 3"
					opacity="0.6"
				/>

				<!--
					The alignment gauge clipped across the limb, which is what actually finds its centre: the
					limb tapers, so an eye reading its edges calls it centred long before it is.
				-->
				<g transform="translate({panel.x + panel.off} 46)">
					<rect x="-16" y="-5.5" width="32" height="11" rx="2" opacity="0.6" />
					<path d="M0 -9 L0 9" stroke-width="2" class="text-brand-text" stroke="currentColor" />
				</g>

				<!--
					The grip. The string crosses it too: limbs centred on a bow the string misses are still
					off plane. Solid and wider than the limb, because it is the part being held still while
					everything else is moved around it.
				-->
				<rect
					x={panel.x - 19}
					y="88"
					width="38"
					height="26"
					rx="3"
					opacity="0.45"
					fill="currentColor"
					stroke="none"
				/>

				<!-- The string: straight, and the only fixed reference in the picture. -->
				<path
					d="M{panel.x} 12 L{panel.x} 118"
					stroke-width="2"
					class="text-brand-text"
					stroke="currentColor"
				/>

				<g
					transform="translate({panel.x} 128)"
					class={panel.ok ? 'text-brand-text' : 'text-danger'}
					stroke="currentColor"
					stroke-width="2.2"
				>
					<path d={panel.ok ? RIGHT : WRONG} />
				</g>
			</g>
		{/each}

		<text x="98" y="50" font-size="9" fill="currentColor" stroke="none" class="text-muted">
			{$t('tuning.diagram.limbGauge')}
		</text>
		<path d="M96 47 L{62 + 16} 47" opacity="0.4" />

		<text x="8" y="146" font-size="9" fill="currentColor" stroke="none" class="text-muted">
			{$t('tuning.diagram.downString')}
		</text>
		<text x="232" y="146" font-size="9" fill="currentColor" stroke="none" text-anchor="end" class="text-muted">
			{$t('tuning.diagram.bowPlane')}
		</text>
	{:else if name === 'centreShot'}
		<!--
			What the eye actually sees looking down the string: the shaft end on, the window edge behind
			it, and the string falling a touch inside the shaft centre rather than across it.
		-->
		<path d="M104 14 L104 136" stroke-dasharray="4 4" stroke-width="2" class="text-brand-text" stroke="currentColor" />
		<text x="60" y="24" font-size="9" fill="currentColor" stroke="none" class="text-muted" text-anchor="end">
			{$t('tuning.diagram.stringLine')}
		</text>
		<path d="M64 20 L100 20" opacity="0.4" />

		<!-- The riser window, and the button standing out of its face onto the shaft. -->
		<path d="M164 20 L164 130 L212 130 L212 20 Z" opacity="0.25" fill="currentColor" stroke="none" />
		<rect x="150" y="70" width="16" height="12" rx="3" fill="currentColor" stroke="none" opacity="0.8" />
		<text x="176" y="112" font-size="9" fill="currentColor" stroke="none" class="text-muted">
			{$t('tuning.diagram.button')}
		</text>
		<path d="M172 104 L160 88" opacity="0.4" />

		<!-- The shaft, seen from behind: a circle, because that is all there is to see of it. -->
		<circle cx="122" cy="76" r="24" stroke-width="2" />
		<circle cx="122" cy="76" r="3" fill="currentColor" stroke="none" opacity="0.7" />
		<path d="M122 40 L122 112" stroke-dasharray="2 3" opacity="0.4" />

		<g class="text-brand-text" stroke="currentColor">
			<path d="M104 124 L122 124" />
			<path d="M104 119 L104 129M122 119 L122 129" />
		</g>
		<text x="98" y="146" font-size="9" fill="currentColor" stroke="none" class="text-muted">
			{$t('tuning.diagram.insideCentre')}
		</text>
	{:else if name === 'tiller'}
		<!-- The bow from the side: string straight, both limbs curving away, measured at the fadeouts. -->
		<path d="M60 14 L60 136" stroke-width="2" class="text-brand-text" stroke="currentColor" />
		<path d="M60 14 C 92 26, 108 38, 112 52" opacity="0.75" />
		<path d="M60 136 C 92 124, 108 112, 112 98" opacity="0.75" />
		<rect
			x="106"
			y="52"
			width="13"
			height="46"
			rx="4"
			opacity="0.4"
			fill="currentColor"
			stroke="none"
		/>
		<path d="M112 52 L112 98" opacity="0.5" />

		<g class="text-brand-text" stroke="currentColor">
			<path d="M60 52 L112 52" />
			<path d="M60 47 L60 57M112 47 L112 57" />
			<path d="M60 98 L112 98" />
			<path d="M60 93 L60 103M112 93 L112 103" />
		</g>
		<text x="126" y="56" font-size="9.5" fill="currentColor" stroke="none">
			{$t('tuning.diagram.upper')}
		</text>
		<text x="126" y="102" font-size="9.5" fill="currentColor" stroke="none">
			{$t('tuning.diagram.lower')}
		</text>
		<text x="126" y="79" font-size="9" fill="currentColor" stroke="none" class="text-muted">
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
		<!-- The face as it reads: the fletched group at the centre, and where a bare shaft can land. -->
		<circle cx="118" cy="72" r="46" opacity="0.28" />
		<circle cx="118" cy="72" r="30" opacity="0.42" />
		<circle cx="118" cy="72" r="14" opacity="0.6" />
		{#each [[113, 68], [123, 66], [117, 78]] as [cx, cy] (cx)}
			<circle {cx} {cy} r="3.2" fill="currentColor" stroke="none" opacity="0.85" />
		{/each}

		<!-- Each position, with a line back to the group so it reads as a difference, not as a dot. -->
		{#each [{ x: 58, y: 72, label: $t('tuning.diagram.stiff'), anchor: 'end', tx: 50, ty: 76 }, { x: 178, y: 72, label: $t('tuning.diagram.weak'), anchor: 'start', tx: 186, ty: 76 }, { x: 118, y: 22, label: $t('tuning.diagram.nockLow'), anchor: 'middle', tx: 118, ty: 12 }, { x: 118, y: 122, label: $t('tuning.diagram.nockHigh'), anchor: 'middle', tx: 118, ty: 142 }] as mark (mark.label)}
			<g>
				<path
					d="M118 72 L{mark.x} {mark.y}"
					stroke-dasharray="2 4"
					opacity="0.5"
					class="text-brand-text"
					stroke="currentColor"
				/>
				<circle
					cx={mark.x}
					cy={mark.y}
					r="5"
					stroke-width="2"
					class="text-brand-text"
					stroke="currentColor"
				/>
				<text
					x={mark.tx}
					y={mark.ty}
					font-size="9"
					fill="currentColor"
					stroke="none"
					text-anchor={mark.anchor}
					class="text-muted"
				>
					{mark.label}
				</text>
			</g>
		{/each}
	{:else if name === 'paperTear'}
		<!-- The four tears: the hole the point makes, and the slit the nock end drags through it. -->
		{#each [{ x: 30, dx: 0, dy: -1, label: $t('tuning.diagram.tailHigh') }, { x: 90, dx: 0, dy: 1, label: $t('tuning.diagram.tailLow') }, { x: 150, dx: -1, dy: 0, label: $t('tuning.diagram.tailLeft') }, { x: 210, dx: 1, dy: 0, label: $t('tuning.diagram.tailRight') }] as tear (tear.x)}
			<g transform="translate({tear.x} 60)">
				<rect x="-24" y="-42" width="48" height="84" rx="2" opacity="0.28" />
				<!-- The slit, drawn as two torn edges rather than as one clean line. -->
				<path
					d="M{tear.dx * 6 - tear.dy * 4} {tear.dy * 6 + tear.dx * 4} L{tear.dx * 20 - tear.dy * 3} {tear.dy *
						20 +
						tear.dx * 3}"
					class="text-brand-text"
					stroke="currentColor"
					stroke-width="1.8"
				/>
				<path
					d="M{tear.dx * 6 + tear.dy * 4} {tear.dy * 6 - tear.dx * 4} L{tear.dx * 20 + tear.dy * 3} {tear.dy *
						20 -
						tear.dx * 3}"
					class="text-brand-text"
					stroke="currentColor"
					stroke-width="1.8"
				/>
				<circle cx="0" cy="0" r="6" stroke-width="1.8" />
				<text
					x="0"
					y="60"
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
