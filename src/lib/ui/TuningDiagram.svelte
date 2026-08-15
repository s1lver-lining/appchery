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
	let {
		name,
		hand = 'right',
		tone = 'ink'
	}: {
		name: DiagramName;
		hand?: 'right' | 'left';
		/**
		 * Inverted is for a drawing worn as a badge: shrunk to a list icon the ink weight vanishes
		 * against the card, so the badge carries its own dark ground and the lines go pale on it.
		 */
		tone?: 'ink' | 'inverted';
	} = $props();

	/**
	 * A caption broken to fit the panel it sits under. French runs a third longer than English for
	 * the same words, so a label that fits one language and spills out of the drawing in the other
	 * is the normal case rather than the exception: every caption is wrapped, none is measured.
	 */
	function wrap(label: string, perLine: number): string[] {
		const lines: string[] = [];
		for (const word of label.split(' ')) {
			const last = lines[lines.length - 1];
			if (last && (last + ' ' + word).length <= perLine) lines[lines.length - 1] = last + ' ' + word;
			else lines.push(word);
		}
		return lines;
	}

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
	/**
	 * What a badge shows: not the whole drawing shrunk, but the part of it that says what the
	 * procedure is, framed square and without the band of captions underneath. A badge that keeps
	 * the margins keeps nothing else.
	 */
	const BADGE_BOX: Partial<Record<DiagramName, string>> = {
		// The whole bow with its arrow point, and only as much of the scale as still fits.
		// Framed on the middle of the bow itself, y 20 to 120, so it sits centred both ways.
		bowStrength: '30 8 140 124',
		// The face on its own, centred: the labels around it are gone at this size anyway.
		bareShaft: '68 22 100 100',
		drawLength: '40 10 150 126',
		braceMeasure: '80 10 130 130',
		plungerLine: '0 0 300 134',
		sightAlignment: '0 0 240 126'
	};
	const badgeBox = $derived(BADGE_BOX[name] ?? '0 0 240 130');

	const box = $derived(
		name === 'plungerLine'
			? '0 0 300 176'
			: name === 'drawLength'
				? '0 0 260 174'
				: name === 'sightAlignment'
					? '0 0 240 162'
					: name === 'braceMeasure'
						? '0 0 240 160'
						: name === 'tiller'
							? '0 0 240 162'
							: '0 0 240 158'
	);

	const RIGHT = 'M-5 0 L-1.5 3.5 L5 -3.5';
	const WRONG = 'M-4 -4 L4 4 M4 -4 L-4 4';
</script>

<svg
	class="h-full w-full {tone === 'inverted' ? 'badge text-bg' : 'text-ink'}"
	preserveAspectRatio={tone === 'inverted' ? 'xMidYMid slice' : 'xMidYMid meet'}
	viewBox={tone === 'inverted' ? badgeBox : box}
	fill="none"
	stroke="currentColor"
	stroke-width={tone === 'inverted' ? 2.4 : 1.4}
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

		<text
			x="120"
			y="18"
			font-size="9"
			fill="currentColor"
			stroke="none"
			text-anchor="middle"
			class="text-muted"
		>
			{$t('tuning.diagram.limbGauge')}
		</text>
		<path class="leader" d="M104 22 L80 40" opacity="0.4" />

		<!-- One caption per panel, centred under the bow it belongs to rather than out at the edges. -->
		<text
			x="62"
			y="146"
			font-size="9"
			fill="currentColor"
			stroke="none"
			text-anchor="middle"
			class="text-muted"
		>
			{$t('tuning.diagram.limbAligned')}
		</text>
		<text
			x="178"
			y="146"
			font-size="9"
			fill="currentColor"
			stroke="none"
			text-anchor="middle"
			class="text-muted"
		>
			{$t('tuning.diagram.limbOffPlane')}
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
		<!--
			The riser seen end on: the window wall the shaft sits against, the sight window cut out of
			it, and the button through that wall — barrel on the shaft, adjuster head on the far side,
			which is the half the archer actually turns.
		-->
		<path
			d="M{cx + dir * 26} 20 L{cx + dir * 26} 128 L{cx + dir * 46} 128 L{cx + dir * 46} 62
				L{cx + dir * 38} 62 L{cx + dir * 38} 28 L{cx + dir * 46} 28 L{cx + dir * 46} 20 Z"
			opacity="0.3"
			fill="currentColor"
			stroke="none"
		/>
		<path d="M{cx + dir * 26} 20 L{cx + dir * 26} 128" opacity="0.55" />

		<!-- The button: barrel from the window face to the shaft, and its head out the other side. -->
		<rect
			x={dir === 1 ? cx + r : cx - r - (26 - r)}
			y="70"
			width={26 - r}
			height="12"
			rx="2"
			fill="currentColor"
			stroke="none"
			opacity="0.85"
		/>
		<rect
			x={dir === 1 ? cx + 46 : cx - 60}
			y="67"
			width="14"
			height="18"
			rx="2.5"
			fill="currentColor"
			stroke="none"
			opacity="0.55"
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
		<path class="leader" d="M{cx - dir * 30} 30 L{cx - dir * 3} 42" opacity="0.4" />

		<text
			x={cx + dir * 30}
			y="116"
			font-size="9"
			fill="currentColor"
			stroke="none"
			class="text-muted"
			text-anchor="middle"
		>
			{$t('tuning.diagram.button')}
		</text>
		<path class="leader" d="M{cx + dir * 30} 108 L{cx + dir * 21} 88" opacity="0.4" />

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
		<path d="M60 14 C 90 26, 106 38, 112.5 52" opacity="0.75" />
		<path d="M60 136 C 90 124, 106 112, 112.5 98" opacity="0.75" />
		<!-- The riser, with the throat of the grip cut into the side the archer holds. -->
		<path
			d="M109 52 H116 A3 3 0 0 1 119 55 V95 A3 3 0 0 1 116 98 H109 A3 3 0 0 1 106 95 V91
				C110 89 113.5 85 113.5 80 C113.5 75 106 75 106 70 V55 A3 3 0 0 1 109 52 Z"
			opacity="0.4"
			fill="currentColor"
			stroke="none"
		/>

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
			y="152"
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
		<text
			x="120"
			y="146"
			font-size="9"
			fill="currentColor"
			stroke="none"
			text-anchor="middle"
			class="text-muted"
		>
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
			The arrow is cut off just clear of the bow: what it is doing past the riser is not the point.
		-->
		<!--
			The riser with the throat of the grip cut into it. The deepest point of that throat is the
			pivot point, which is where the measurement starts, and the button sits directly above it:
			drawn as two dots on one vertical, because that is the whole reason either can be measured
			from. It is also why the shop method (nock groove to button) gives the same figure.
		-->
		<path
			d="M83 46 H89 A3 3 0 0 1 92 49 V66 C92 71 84.4 71 84.4 76 C84.4 82 88 86 92 88
				A3 3 0 0 1 89 91 H83 A3 3 0 0 1 80 88 V49 A3 3 0 0 1 83 46 Z"
			fill="currentColor"
			stroke="none"
			opacity="0.4"
		/>
		<path d="M86 46 C90 34 104 24 128 18" stroke-width="2" opacity="0.75" />
		<path d="M86 90 C90 102 104 112 128 118" stroke-width="2" opacity="0.75" />
		<path d="M84.4 68 L84.4 76" stroke-dasharray="2 2" class="text-brand-text" stroke="currentColor" />

		<!-- The string, drawn back: two straight runs from the tips to the fingers. -->
		<path d="M128 18 L174 68 L128 118" class="text-brand-text" stroke="currentColor" />
		<!-- The arrow lying across it, point towards the target. -->
		<path d="M78 68 L174 68" opacity="0.8" />
		<path d="M66 68 L78 64 L78 72 Z" fill="currentColor" stroke="none" opacity="0.8" />
		<g class="text-brand-text" fill="currentColor" stroke="none">
			<circle cx="84.4" cy="76" r="2.4" />
			<circle cx="84.4" cy="68" r="2.4" />
			<circle cx="174" cy="68" r="2.4" />
		</g>

		<g class="text-brand-text" stroke="currentColor">
			<path d="M84.4 140 L174 140" />
			<path d="M84.4 135 L84.4 145M174 135 L174 145" />
			<path d="M84.4 162 L192 162" stroke-dasharray="4 3" />
			<path d="M84.4 157 L84.4 167M192 157 L192 167" />
		</g>
		<text x="130" y="130" font-size="8" fill="currentColor" stroke="none" text-anchor="middle" class="text-muted">
			{$t('tuning.diagram.nockToPivot')}
		</text>
		<text x="139" y="156" font-size="8" fill="currentColor" stroke="none" text-anchor="middle" class="text-brand-text">
			{$t('tuning.diagram.amoLength')}
		</text>
		<text x="130" y="12" font-size="9" fill="currentColor" stroke="none" text-anchor="middle" class="text-muted">
			{$t('tuning.diagram.amoFormula')}
		</text>
	{:else if name === 'bowStrength'}
		<!--
			The same bow at full draw, pulled by a scale hooked where the fingers would be: the weight
			that counts is the one at the archer's own draw length, not the number on the limb.
		-->
		<rect x="60" y="50" width="9" height="40" rx="3" fill="currentColor" stroke="none" opacity="0.55" />
		<path d="M64 50 C68 36 82 26 106 20" stroke-width="2" opacity="0.75" />
		<path d="M64 90 C68 104 82 114 106 120" stroke-width="2" opacity="0.75" />
		<path d="M106 20 L150 70 L106 120" class="text-brand-text" stroke="currentColor" />
		<!-- The line stops at the head's base, so nothing shows through it, and the head clears the riser. -->
		<path d="M58 70 L150 70" opacity="0.55" />
		<path d="M46 70 L58 66 L58 74 Z" fill="currentColor" stroke="none" opacity="0.55" />

		<!-- The nocking point, the hook on it, and the scale pulled straight back from there. -->
		<circle cx="150" cy="70" r="3.6" fill="currentColor" stroke="none" opacity="0.9" />
		<path d="M150 70 L158 70" stroke-width="2" />
		<path d="M158 64 A6 6 0 1 1 158 76" stroke-width="1.8" />
		<rect x="164" y="54" width="28" height="32" rx="4" stroke-width="1.8" />
		<text x="178" y="76" font-size="14" fill="currentColor" stroke="none" text-anchor="middle" class="text-brand-text">#</text>

		<text x="120" y="140" font-size="8.5" fill="currentColor" stroke="none" text-anchor="middle" class="text-muted">
			{$t('tuning.diagram.atNockingPoint')}
		</text>
		<path class="leader" d="M150 128 L150 80" opacity="0.35" />
		<text x="120" y="152" font-size="8.5" fill="currentColor" stroke="none" text-anchor="middle" class="text-muted">
			{$t('tuning.diagram.atYourDraw')}
		</text>
	{:else if name === 'braceMeasure'}
		<!--
			Where the brace height is read: the bow braced and seen from the side, the square sat on the
			throat of the grip and the reading taken where its arm crosses the string. The square is
			drawn as the L it is, tilted a few degrees so it reads as lying across the bow rather than
			as a bar painted on top of it.
		-->
		<!-- The two limbs, leaving the middle of the riser rather than its corners. -->
		<path d="M94.5 52 C96 40 110 32 138 16" stroke-width="2" opacity="0.75" />
		<path d="M94.5 98 C96 110 110 118 138 134" stroke-width="2" opacity="0.75" />

		<!--
			The riser, with the throat of the grip cut into the side the archer holds. Its deepest point
			is where the measurement starts, and the button sits on the same vertical just above it.
		-->
		<path
			d="M91 52 H98 A3 3 0 0 1 101 55 V70 C101 75 93 75 93 80 C93 85 97 89 101 91
				V95 A3 3 0 0 1 98 98 H91 A3 3 0 0 1 88 95 V55 A3 3 0 0 1 91 52 Z"
			fill="currentColor"
			stroke="none"
			opacity="0.4"
		/>

		<!--
			The square: the short arm stood on the pivot point, the graduated arm lying across to the
			string, where the figure is read off. Tilted about that pivot, which is what gives it depth.
		-->
		<g transform="rotate(-7 93 80)">
			<rect x="99" y="63" width="8" height="34" rx="1.5" opacity="0.35" fill="currentColor" stroke="none" />
			<rect x="107" y="76" width="31" height="9" rx="1.5" opacity="0.5" fill="currentColor" stroke="none" />
			{#each [0, 1, 2] as tick (tick)}
				<path d="M{113 + tick * 8} 76 L{113 + tick * 8} 80.5" opacity="0.6" stroke-width="1" />
			{/each}
		</g>

		<!-- The string last: it is the reference the whole figure is read against. -->
		<path d="M138 16 L138 134" stroke-width="2.2" class="text-brand-text" stroke="currentColor" />

		<!-- Pivot point and button, on one vertical, drawn over the square that rests on them. -->
		<g class="text-brand-text" stroke="currentColor">
			<path d="M93 62 L93 80" stroke-dasharray="2 2" />
			<g fill="currentColor" stroke="none">
				<circle cx="93" cy="80" r="2.2" />
				<circle cx="93" cy="62" r="2.2" />
			</g>
			<path d="M93 118 L138 118" stroke-dasharray="4 3" />
			<path d="M93 113 L93 123M138 113 L138 123" />
		</g>

		<text
			x="88"
			y="122"
			font-size="9"
			fill="currentColor"
			stroke="none"
			text-anchor="end"
			class="text-brand-text"
		>
			{$t('tuning.diagram.braceLabel')}
		</text>
		<text x="120" y="150" font-size="8.5" fill="currentColor" stroke="none" text-anchor="middle" class="text-muted">
			{$t('tuning.diagram.gripThroat')}
		</text>
	{:else if name === 'sightAlignment'}
		<!--
			The sight seen down the string, with the block at the top of the bar and at the bottom. Each
			position is an arm of the same length reaching from the bar out to the ring, so the bar is
			drawn where those two arms put it: parallel to the string when both rings sit on it, and
			leaning when one of them does not. The lean is the fault, and the ring is only how it shows.
		-->
		{@const dir = hand === 'left' ? -1 : 1}
		{@const ARM = 17}
		{@const OFF = 9}
		{#each [{ cx: 42, top: 0, bottom: 0, label: $t('tuning.diagram.sightAligned'), ok: true }, { cx: 120, top: OFF, bottom: 0, label: $t('tuning.diagram.sightTop'), ok: false }, { cx: 198, top: 0, bottom: -OFF, label: $t('tuning.diagram.sightBottom'), ok: false }] as panel (panel.cx)}
			{@const lines = wrap(panel.label, 16)}
			<!-- Where the bar has to hang to carry both arms, extended past them to its own ends. -->
			{@const barTop = panel.cx + dir * (panel.top - ARM)}
			{@const barBottom = panel.cx + dir * (panel.bottom - ARM)}
			{@const barAt = (y: number) => barTop + ((barBottom - barTop) * (y - 36)) / 62}
			<g>
				<path
					d="M{barAt(26) - 4} 26 L{barAt(26) + 4} 26 L{barAt(110) + 4} 110 L{barAt(110) - 4} 110 Z"
					opacity="0.28"
					fill="currentColor"
					stroke="none"
				/>
				<!-- The string, straight and vertical: the reference the whole test is read against. -->
				<path d="M{panel.cx} 12 L{panel.cx} 122" stroke-width="2" class="text-brand-text" stroke="currentColor" />

				{#each [{ y: 36, at: panel.top }, { y: 98, at: panel.bottom }] as ring (ring.y)}
					{@const ringX = panel.cx + dir * ring.at}
					<g class={ring.at === 0 ? 'text-brand-text' : 'text-danger'} stroke="currentColor">
						<!-- The arm, the same length on every sight here: only the bar end of it moves. -->
						<path d="M{ringX - dir * ARM} {ring.y} L{ringX - dir * 7} {ring.y}" stroke-width="1.6" />
						<circle cx={ringX} cy={ring.y} r="7" stroke-width="1.8" />
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
				<text font-size="7.5" fill="currentColor" stroke="none" text-anchor="middle" class="text-muted">
					{#each lines as line, i (i)}
						<tspan x={panel.cx} y={144 + i * 9}>{line}</tspan>
					{/each}
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
			{@const lines = wrap($t(`tuning.diagram.${key}`), 12)}
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
					{#each lines as line, i (i)}
						<tspan x={panel.cx} y={140 + i * 9}>{line}</tspan>
					{/each}
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
				<g class="text-brand-text" stroke="currentColor">
					<circle cx={panel.cx} cy={66 + panel.dir * 34} r="10" stroke-width="2" />
					<!-- The pin in the middle of it: a bare ring reads as another face, not as a sight. -->
					<circle cx={panel.cx} cy={66 + panel.dir * 34} r="2" fill="currentColor" stroke="none" />
				</g>
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

<style>
	/*
	 * Worn as a badge the drawing is a centimetre across, and the faded layers that give it depth at
	 * full size read as smudge there. Everything goes to full strength: a badge is a silhouette.
	 */
	svg.badge * {
		opacity: 1;
	}

	/* And no words: at this size a caption is a grey smear, and the card beside it already says it. */
	svg.badge text,
	svg.badge .leader {
		display: none;
	}
</style>
