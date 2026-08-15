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
	let { name, hand = 'right' }: { name: DiagramName; hand?: 'right' | 'left' } = $props();

	/**
	 * How far the arrow shot at the nth distance sits off the middle of the strip: nothing on a
	 * straight line, growing with the distance on a tilt, and bulging in the middle on a belly.
	 */
	function offset(shape: string, bend: number, i: number): number {
		if (shape === 'straight') return 0;
		if (shape === 'tilt') return bend * (i / 5) * 11;
		return bend * Math.sin((i / 5) * Math.PI) * 11;
	}

	/** The plunger test is a row of paper strips, which needs more room across than a single face. */
	const box = $derived(
		name === 'plungerLine'
			? '0 0 300 176'
			: name === 'drawLength'
				? '0 0 260 170'
				: name === 'sightAlignment'
					? '0 0 240 162'
					: '0 0 240 158'
	);

	const RIGHT = 'M-5 0 L-1.5 3.5 L5 -3.5';
	const WRONG = 'M-4 -4 L4 4 M4 -4 L-4 4';
</script>

<svg
	class="w-full text-ink"
	viewBox={box}
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
			What the eye sees looking down the string: the shaft end on, the button standing off the
			window onto it, and the string laid over the shaft. Drawn for the bow hand, because the
			window is on one side and the whole picture turns over with it.
		-->
		{@const dir = hand === 'left' ? -1 : 1}
		{@const cx = 120}
		{@const r = 13}
		<!-- The riser window the shaft sits against, and the button standing out of its face. -->
		<path
			d="M{cx + dir * 24} 22 L{cx + dir * 24} 128 L{cx + dir * 104} 128 L{cx + dir * 104} 22 Z"
			opacity="0.22"
			fill="currentColor"
			stroke="none"
		/>
		<rect
			x={dir === 1 ? cx + r : cx - r - 9}
			y="70"
			width="9"
			height="12"
			rx="2.5"
			fill="currentColor"
			stroke="none"
			opacity="0.8"
		/>

		<!-- The shaft, seen from behind, sat in the bow plane: one solid disc, nothing to read into. -->
		<circle {cx} cy="76" r={r} fill="currentColor" stroke="none" opacity="0.55" />

		<!-- How far out it may sit: a millimetre or two outside the plane, away from the window. -->
		<circle
			cx={cx - dir * 10}
			cy="76"
			r={r}
			stroke-dasharray="3 3"
			stroke-width="1.6"
			class="text-brand-text"
			stroke="currentColor"
			opacity="0.9"
		/>
		<path
			d="M{cx - dir * 10} 30 L{cx - dir * 10} 122"
			stroke-dasharray="2 3"
			opacity="0.5"
			class="text-brand-text"
			stroke="currentColor"
		/>

		<!-- The string, drawn last so it lies over the shaft the way it does to the eye. -->
		<path
			d="M{cx} 14 L{cx} 136"
			stroke-width="2.4"
			class="text-brand-text"
			stroke="currentColor"
		/>

		<g class="text-brand-text" stroke="currentColor">
			<path d="M{cx - dir * 10} 128 L{cx} 128" />
			<path d="M{cx - dir * 10} 123 L{cx - dir * 10} 133M{cx} 123 L{cx} 133" />
		</g>

		<text
			x={cx - dir * 30}
			y="24"
			font-size="9"
			fill="currentColor"
			stroke="none"
			class="text-muted"
			text-anchor="middle"
		>
			{$t('tuning.diagram.stringLine')}
		</text>
		<path d="M{cx - dir * 30} 30 L{cx - dir * 3} 42" opacity="0.4" />

		<text
			x={cx + dir * 34}
			y="112"
			font-size="9"
			fill="currentColor"
			stroke="none"
			class="text-muted"
			text-anchor={dir === 1 ? 'start' : 'end'}
		>
			{$t('tuning.diagram.button')}
		</text>
		<path d="M{cx + dir * 32} 104 L{cx + dir * 20} 88" opacity="0.4" />

		<text
			x={cx}
			y="148"
			font-size="9"
			fill="currentColor"
			stroke="none"
			class="text-muted"
			text-anchor="middle"
		>
			{$t('tuning.diagram.maxOutside')}
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
		<!-- The figure to start from, under the drawing: it is what the reader came for. -->
		<text
			x="120"
			y="146"
			font-size="9.5"
			fill="currentColor"
			stroke="none"
			text-anchor="middle"
			class="text-brand-text"
		>
			{$t('tuning.diagram.tillerTarget')}
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
	{:else if name === 'drawLength'}
		<!--
			The bow at full draw, with the two distances the figure is made of: what a tape reads from
			the string groove to the pivot point, and the standard length that adds 1.75 inches to it.
		-->
		<!-- Riser and limbs: the riser is the straight part, and the pivot point sits on its throat. -->
		<rect x="140" y="48" width="9" height="40" rx="3" fill="currentColor" stroke="none" opacity="0.55" />
		<path d="M144 48 C148 34 162 24 186 18" stroke-width="2" opacity="0.75" />
		<path d="M144 88 C148 102 162 112 186 118" stroke-width="2" opacity="0.75" />

		<!-- The string, drawn back: two straight runs from the tips to the fingers. -->
		<path d="M186 18 L232 68 L186 118" class="text-brand-text" stroke="currentColor" />
		<!-- The arrow lying across it, point towards the target. -->
		<path d="M46 68 L232 68" opacity="0.8" />
		<path d="M46 68 L58 64 L58 72 Z" fill="currentColor" stroke="none" opacity="0.8" />
		<circle cx="144" cy="68" r="3" fill="currentColor" stroke="none" opacity="0.9" />
		<circle cx="232" cy="68" r="3" fill="currentColor" stroke="none" opacity="0.9" />

		<g class="text-brand-text" stroke="currentColor">
			<path d="M144 136 L232 136" />
			<path d="M144 131 L144 141M232 131 L232 141" />
			<path d="M144 158 L250 158" stroke-dasharray="4 3" />
			<path d="M144 153 L144 163M250 153 L250 163" />
		</g>
		<text x="188" y="132" font-size="8" fill="currentColor" stroke="none" text-anchor="middle" class="text-muted">
			{$t('tuning.diagram.nockToPivot')}
		</text>
		<text x="197" y="154" font-size="8" fill="currentColor" stroke="none" text-anchor="middle" class="text-brand-text">
			{$t('tuning.diagram.amoLength')}
		</text>
		<text x="66" y="158" font-size="9" fill="currentColor" stroke="none" text-anchor="middle" class="text-muted">
			{$t('tuning.diagram.amoFormula')}
		</text>
	{:else if name === 'bowStrength'}
		<!--
			The same bow at full draw, pulled by a scale hooked where the fingers would be: the weight
			that counts is the one at the archer's own draw length, not the number on the limb.
		-->
		<rect x="106" y="50" width="9" height="40" rx="3" fill="currentColor" stroke="none" opacity="0.55" />
		<path d="M110 50 C114 36 128 26 152 20" stroke-width="2" opacity="0.75" />
		<path d="M110 90 C114 104 128 114 152 120" stroke-width="2" opacity="0.75" />
		<path d="M152 20 L196 70 L152 120" class="text-brand-text" stroke="currentColor" />
		<path d="M40 70 L196 70" opacity="0.55" />
		<path d="M40 70 L52 66 L52 74 Z" fill="currentColor" stroke="none" opacity="0.55" />

		<!-- The nocking point, the hook on it, and the scale pulled straight back from there. -->
		<circle cx="196" cy="70" r="3.6" fill="currentColor" stroke="none" opacity="0.9" />
		<path d="M196 70 L204 70" stroke-width="2" />
		<path d="M204 64 A6 6 0 1 1 204 76" stroke-width="1.8" />
		<rect x="210" y="54" width="28" height="32" rx="4" stroke-width="1.8" />
		<text x="224" y="76" font-size="14" fill="currentColor" stroke="none" text-anchor="middle" class="text-brand-text">#</text>

		<text x="120" y="140" font-size="8.5" fill="currentColor" stroke="none" text-anchor="middle" class="text-muted">
			{$t('tuning.diagram.atNockingPoint')}
		</text>
		<path d="M170 134 L194 78" opacity="0.35" />
		<text x="120" y="152" font-size="8.5" fill="currentColor" stroke="none" text-anchor="middle" class="text-muted">
			{$t('tuning.diagram.atYourDraw')}
		</text>
	{:else if name === 'braceMeasure'}
		<!--
			Where the brace height is read: the bow braced and seen from the side, the square sat on the
			string, and the distance taken square to it at the throat of the grip.
		-->
		<path
			d="M150 16 C126 34 112 40 110 58 L110 92 C112 110 126 116 150 134"
			stroke-width="2"
			opacity="0.75"
		/>
		<!-- The grip, drawn solid: the throat of it is one end of the measurement. -->
		<path d="M104 58 L104 92" stroke-width="5" opacity="0.5" />
		<path d="M150 16 L150 134" stroke-width="2.2" class="text-brand-text" stroke="currentColor" />

		<!-- The bow square, clipped on the string and lying across to the grip. -->
		<rect x="96" y="68" width="86" height="9" rx="1.5" opacity="0.45" fill="currentColor" stroke="none" />
		{#each [0, 1, 2, 3, 4, 5, 6, 7] as tick (tick)}
			<path d="M{104 + tick * 10} 68 L{104 + tick * 10} 73" opacity="0.5" stroke-width="1" />
		{/each}

		<g class="text-brand-text" stroke="currentColor">
			<path d="M110 96 L150 96" stroke-dasharray="4 3" />
			<path d="M110 91 L110 101M150 91 L150 101" />
		</g>
		<text x="130" y="112" font-size="9" fill="currentColor" stroke="none" text-anchor="middle" class="text-brand-text">
			{$t('tuning.diagram.braceLabel')}
		</text>
		<text x="130" y="146" font-size="8.5" fill="currentColor" stroke="none" text-anchor="middle" class="text-muted">
			{$t('tuning.diagram.gripThroat')}
		</text>
	{:else if name === 'sightAlignment'}
		<!--
			The sight seen down the string with the block run to the top of the bar and then to the
			bottom: aligned, the ring keeps the string through its middle at both ends. The two faults
			are the same sight at each end of its travel, which is the only way the error shows.
		-->
		{#each [{ cx: 42, top: 0, bottom: 0, label: $t('tuning.diagram.sightAligned'), ok: true }, { cx: 120, top: 9, bottom: 0, label: $t('tuning.diagram.sightTop'), ok: false }, { cx: 198, top: 0, bottom: 9, label: $t('tuning.diagram.sightBottom'), ok: false }] as panel (panel.cx)}
			{@const words = panel.label.split(' ')}
			<g>
				<!-- The bar the block slides along, and the string it is read against. -->
				<rect x={panel.cx - 20} y="18" width="12" height="96" rx="2" opacity="0.28" fill="currentColor" stroke="none" />
				<path d="M{panel.cx} 12 L{panel.cx} 120" stroke-width="2" class="text-brand-text" stroke="currentColor" />

				<!-- The ring at the top of the travel, and again at the bottom. -->
				{#each [{ y: 36, off: panel.top }, { y: 98, off: panel.bottom }] as ring (ring.y)}
					<g>
						<path d="M{panel.cx - 14} {ring.y} L{panel.cx + ring.off - 7} {ring.y}" opacity="0.6" />
						<circle
							cx={panel.cx + ring.off}
							cy={ring.y}
							r="7"
							stroke-width="1.8"
							class={ring.off === 0 ? 'text-brand-text' : 'text-danger'}
							stroke="currentColor"
						/>
					</g>
				{/each}

				<g
					transform="translate({panel.cx} 132)"
					class={panel.ok ? 'text-brand-text' : 'text-danger'}
					stroke="currentColor"
					stroke-width="2.2"
				>
					<path d={panel.ok ? RIGHT : WRONG} />
				</g>
				<text font-size="8" fill="currentColor" stroke="none" text-anchor="middle" class="text-muted">
					<tspan x={panel.cx} y="146">{words.slice(0, Math.ceil(words.length / 2)).join(' ')}</tspan>
					<tspan x={panel.cx} y="156">{words.slice(Math.ceil(words.length / 2)).join(' ')}</tspan>
				</text>
			</g>
		{/each}
	{:else if name === 'plungerLine'}
		<!--
			The five lines the six arrows can draw down the paper strip, in the order the guide prints
			them. The drawing never changes with the bow hand; what changes is what each line means, so
			the labels swap and the shapes stay put.
		-->
		{#each [{ cx: 40, shape: 'belly', bend: -1, right: 'plungerIn', left: 'plungerOut' }, { cx: 96, shape: 'belly', bend: 1, right: 'plungerOut', left: 'plungerIn' }, { cx: 152, shape: 'tilt', bend: -1, right: 'springStiff', left: 'springSoft' }, { cx: 208, shape: 'straight', bend: 0, right: 'pressureOk', left: 'pressureOk' }, { cx: 264, shape: 'tilt', bend: 1, right: 'springSoft', left: 'springStiff' }] as panel (panel.cx)}
			{@const key = hand === 'left' ? panel.left : panel.right}
			{@const words = $t(`tuning.diagram.${key}`).split(' ')}
			<g>
				<!-- The strip, with the aiming mark near its top: every arrow is shot at that one mark. -->
				<rect x={panel.cx - 23} y="14" width="46" height="116" rx="2" opacity="0.3" />
				<circle cx={panel.cx} cy="32" r="7" opacity="0.5" />
				<circle cx={panel.cx} cy="32" r="2.6" fill="currentColor" stroke="none" opacity="0.7" />

				<!--
					The line of impacts, nearest distance at the top and furthest at the bottom. A tilt is
					the spring; a belly is the button sat wrong, which no spring change will put right.
				-->
				<path
					d={[0, 1, 2, 3, 4, 5]
						.map(
							(i) =>
								`${i === 0 ? 'M' : 'L'}${panel.cx + offset(panel.shape, panel.bend, i)},${52 + i * 14}`
						)
						.join(' ')}
					stroke-dasharray="3 3"
					class="text-brand-text"
					stroke="currentColor"
					opacity="0.85"
				/>
				{#each [0, 1, 2, 3, 4, 5] as i (i)}
					<circle
						cx={panel.cx + offset(panel.shape, panel.bend, i)}
						cy={52 + i * 14}
						r="2.8"
						fill="currentColor"
						stroke="none"
						opacity="0.85"
					/>
				{/each}

				<!-- Two lines, because the verdict is two or three words in any language worth reading. -->
				<text
					font-size="7.5"
					fill="currentColor"
					stroke="none"
					text-anchor="middle"
					class={key === 'pressureOk' ? 'text-brand-text' : 'text-muted'}
				>
					<tspan x={panel.cx} y="142">{words.slice(0, Math.ceil(words.length / 2)).join(' ')}</tspan>
					<tspan x={panel.cx} y="152">{words.slice(Math.ceil(words.length / 2)).join(' ')}</tspan>
				</text>
			</g>
		{/each}
		<!-- The walk itself: the fault only shows at the far end, so the ladder is worth naming. -->
		<text x="2" y="55" font-size="7.5" fill="currentColor" stroke="none" class="text-muted">10 m</text>
		<text x="2" y="125" font-size="7.5" fill="currentColor" stroke="none" class="text-muted">35 m</text>
		<text
			x="152"
			y="169"
			font-size="8.5"
			fill="currentColor"
			stroke="none"
			text-anchor="middle"
			class="text-muted"
		>
			{$t(`tuning.diagram.${hand === 'left' ? 'forLeft' : 'forRight'}`)}
		</text>
	{:else if name === 'tillerDrift'}
		<!--
			What the aim does during a slow draw, which is the whole reading. The ring is drawn where it
			ends up, with a ghost of where it started: a single ring says nothing about movement.
		-->
		{#each [{ cx: 66, dir: -1, label: $t('tuning.diagram.ringClimbs') }, { cx: 174, dir: 1, label: $t('tuning.diagram.ringFalls') }] as panel (panel.cx)}
			<g>
				<circle cx={panel.cx} cy="66" r="44" opacity="0.25" />
				<circle cx={panel.cx} cy="66" r="28" opacity="0.4" />
				<circle cx={panel.cx} cy="66" r="14" opacity="0.55" fill="currentColor" stroke="none" />

				<!-- Where the aim sat before the draw started. -->
				<circle cx={panel.cx} cy="66" r="10" opacity="0.45" stroke-dasharray="2 3" />

				<!-- And where it has drifted to by the anchor, which is what the tiller is answering for. -->
				<circle
					cx={panel.cx}
					cy={66 + panel.dir * 34}
					r="10"
					stroke-width="2"
					class="text-brand-text"
					stroke="currentColor"
				/>
				<path
					d="M{panel.cx} {66 + panel.dir * 12} L{panel.cx} {66 + panel.dir * 22}"
					class="text-brand-text"
					stroke="currentColor"
					stroke-dasharray="2 3"
				/>
				<path
					d="M{panel.cx - 4} {66 + panel.dir * 18} L{panel.cx} {66 + panel.dir * 24} L{panel.cx + 4} {66 +
						panel.dir * 18}"
					class="text-brand-text"
					stroke="currentColor"
					stroke-width="1.8"
				/>

				<text
					x={panel.cx}
					y="140"
					font-size="9"
					fill="currentColor"
					stroke="none"
					text-anchor="middle"
					class="text-muted"
				>
					{panel.label}
				</text>
			</g>
		{/each}
	{:else if name === 'braceGroups'}
		<!--
			The three cases of the fine brace test as they read on the face: how tight the group is, and
			how high it sits. They move together, which is why one picture carries both.
		-->
		{#each [{ cx: 42, spread: 4, up: 22, label: $t('tuning.diagram.groupTight') }, { cx: 120, spread: 9, up: 8, label: $t('tuning.diagram.groupMiddling') }, { cx: 198, spread: 15, up: -12, label: $t('tuning.diagram.groupLoose') }] as panel (panel.cx)}
			<g>
				<circle cx={panel.cx} cy="70" r="34" opacity="0.25" />
				<circle cx={panel.cx} cy="70" r="22" opacity="0.38" />
				<circle cx={panel.cx} cy="70" r="10" opacity="0.55" />
				<!-- The middle of the face, which is what the height is measured from. -->
				<path d="M{panel.cx - 4} 70 L{panel.cx + 4} 70M{panel.cx} 66 L{panel.cx} 74" opacity="0.6" />

				{#each [[-0.8, -0.6], [0.9, -0.3], [-0.2, 0.9], [0.4, 0.5], [-0.6, 0.2], [0.1, -1]] as [dx, dy], i (i)}
					<circle
						cx={panel.cx + dx * panel.spread}
						cy={70 - panel.up + dy * panel.spread}
						r="2.4"
						fill="currentColor"
						stroke="none"
						opacity="0.9"
					/>
				{/each}

				<!-- H is how high the group sits, G how wide it is: the two figures the test compares. -->
				<g class="text-brand-text" stroke="currentColor">
					<path d="M{panel.cx + 26} 70 L{panel.cx + 26} {70 - panel.up}" />
					<path d="M{panel.cx + 22} 70 L{panel.cx + 30} 70" />
					<path d="M{panel.cx + 22} {70 - panel.up} L{panel.cx + 30} {70 - panel.up}" />
					<path
						d="M{panel.cx - panel.spread - 3} {70 - panel.up - panel.spread - 7} L{panel.cx +
							panel.spread +
							3} {70 - panel.up - panel.spread - 7}"
					/>
				</g>
				<text
					x={panel.cx + 32}
					y={70 - panel.up / 2 + 3}
					font-size="9"
					fill="currentColor"
					stroke="none"
					class="text-brand-text">H</text
				>
				<text
					x={panel.cx}
					y={70 - panel.up - panel.spread - 11}
					font-size="9"
					fill="currentColor"
					stroke="none"
					text-anchor="middle"
					class="text-brand-text">G</text
				>

				<text
					x={panel.cx}
					y="126"
					font-size="8.5"
					fill="currentColor"
					stroke="none"
					text-anchor="middle"
					class="text-muted"
				>
					{panel.label}
				</text>
			</g>
		{/each}
	{/if}
</svg>
