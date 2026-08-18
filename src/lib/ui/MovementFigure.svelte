<script lang="ts">
	import { t } from '$lib/i18n';
	import {
		BONES,
		HEAD_RADIUS,
		TORSO,
		JOINTS,
		blend,
		type Movement,
		type Pose
	} from '$lib/domain/exercises/movement';

	/**
	 * What the archer actually does, drawn and animated. The muscle map says which muscles an
	 * exercise works; this says what to do with the body to work them, which is the half a written
	 * instruction always leaves to the imagination.
	 *
	 * The figure is a skeleton on purpose. A movement is written as a base posture plus the joints
	 * that leave it, so adding one is a few coordinates rather than a drawing, and every exercise the
	 * app ever gains is drawn by the same code in the same proportions.
	 */
	let {
		movement,
		playing = true,
		class: className = 'w-full max-h-[42vh]'
	}: { movement: Movement; playing?: boolean; class?: string } = $props();

	/** Out and back, because a movement returns the way it came: nobody rewinds through a rep. */
	const seq = $derived(
		movement.frames.length > 1
			? [...movement.frames, ...movement.frames.slice(1, -1).reverse()]
			: movement.frames
	);

	/** Seconds a limb takes to travel between two poses. Slow enough to be followed by eye. */
	const TRAVEL = 0.9;
	/**
	 * A hold is capped rather than played out: a sixty second bow raise is a real instruction and a
	 * sixty second pause is a broken animation. The number the archer works to is on the card.
	 */
	const DWELL_CAP = 1.4;

	const timeline = $derived.by(() => {
		const steps: { from: number; to: number; start: number; span: number }[] = [];
		let clock = 0;
		for (let i = 0; i < seq.length; i++) {
			const dwell = Math.min(seq[i].dwell ?? 0.3, DWELL_CAP);
			steps.push({ from: i, to: i, start: clock, span: dwell });
			clock += dwell;
			if (seq.length > 1) {
				steps.push({ from: i, to: (i + 1) % seq.length, start: clock, span: TRAVEL });
				clock += TRAVEL;
			}
		}
		return { steps, length: Math.max(clock, 0.001) };
	});

	let at = $state(0);

	$effect(() => {
		if (!playing) return;
		let frame = 0;
		let last = performance.now();
		const tick = (now: number) => {
			at = (at + (now - last) / 1000) % timeline.length;
			last = now;
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});

	/** Eased at both ends, so a limb starts and stops the way a limb does rather than jerking. */
	const ease = (r: number) => r * r * (3 - 2 * r);

	const step = $derived(
		timeline.steps.find((entry) => at < entry.start + entry.span) ?? timeline.steps[0]
	);
	const pose = $derived<Pose>(
		step.from === step.to
			? seq[step.from].pose
			: blend(seq[step.from].pose, seq[step.to].pose, ease((at - step.start) / step.span))
	);
	/** Named for the pose it is at, and still named for it on the way to the next: the caption changes
		when the figure arrives rather than when it sets off. */
	const showing = $derived(seq[step.from]);

	/** Half a bow, drawn from the hand that holds it, with the string running through the other one. */
	const LIMB = 58;

	/**
	 * The box is cut to what the movement actually occupies, over every frame rather than the one on
	 * show, so the figure fills the space without the drawing jumping about as it moves.
	 */
	const box = $derived.by(() => {
		const points: [number, number][] = [];
		for (const frame of movement.frames) {
			for (const joint of JOINTS) points.push(frame.pose[joint]);
			points.push([frame.pose.head[0] - HEAD_RADIUS, frame.pose.head[1] - HEAD_RADIUS]);
			points.push([frame.pose.head[0] + HEAD_RADIUS, frame.pose.head[1] + HEAD_RADIUS]);
			if (movement.prop === 'bow') {
				points.push([frame.pose.handLeft[0] + 16, frame.pose.handLeft[1] - LIMB]);
				points.push([frame.pose.handLeft[0] - 16, frame.pose.handLeft[1] + LIMB]);
			}
		}
		if (movement.anchor) points.push(movement.anchor);
		const pad = 12;
		const xs = points.map((point) => point[0]);
		const ys = points.map((point) => point[1]);
		const left = Math.min(...xs) - pad;
		const top = Math.min(...ys) - pad;
		return {
			left,
			top,
			width: Math.max(...xs) + pad - left,
			height: Math.max(...ys) + pad - top,
			floor: Math.max(...ys) + 6
		};
	});

	/** Looking down on somebody lying on the floor, the floor is the page: a line across it says nothing. */
	const standing = $derived(movement.view !== 'prone');

	/** Seen side on, the far arm and leg are behind the body, so they are drawn as being behind it. */
	const far = $derived((joint: string) => movement.view === 'side' && joint.endsWith('Right'));

	const line = (a: [number, number], b: [number, number]) => `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`;

	/**
	 * A band between two hands, sagging by however much of it is not being stretched. The sag is the
	 * whole point of the drawing: a straight line between two hands says nothing about tension.
	 */
	function band(a: [number, number], b: [number, number], rest: number): string {
		const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
		const span = Math.hypot(dx, dy) || 1;
		const slack = Math.max(0, rest - span) * 0.45;
		const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
		// Sagging across the band rather than downwards, so it bows away from the body in any pose.
		return `M${a[0]} ${a[1]} Q${mid[0] - (dy / span) * slack} ${mid[1] + (dx / span) * slack} ${b[0]} ${b[1]}`;
	}

	const bow = $derived.by(() => {
		const grip = pose.handLeft;
		const nock = pose.handRight;
		const tips: [number, number][] = [
			[grip[0] - 6, grip[1] - LIMB],
			[grip[0] - 6, grip[1] + LIMB]
		];
		return {
			riser:
				`M${tips[0][0]} ${tips[0][1]} Q${grip[0] + 14} ${grip[1] - LIMB * 0.5} ${grip[0] + 8} ${grip[1]}` +
				` Q${grip[0] + 14} ${grip[1] + LIMB * 0.5} ${tips[1][0]} ${tips[1][1]}`,
			string: `M${tips[0][0]} ${tips[0][1]} L${nock[0]} ${nock[1]} L${tips[1][0]} ${tips[1][1]}`
		};
	});
</script>

<figure class="min-w-0">
	<svg
		viewBox="{box.left} {box.top} {box.width} {box.height}"
		class={className}
		role="img"
		aria-label={$t(`exercises.frame.${showing.key}`)}
	>
		<!-- The ground, so a pose is read against something rather than floating. -->
		{#if standing}
			<line
				x1={box.left + 6}
				y1={box.floor}
				x2={box.left + box.width - 6}
				y2={box.floor}
				stroke="var(--c-line)"
				stroke-width="2"
				stroke-dasharray="4 5"
			/>
		{/if}

		<!--
			The figure behind whatever it holds, so a bow crosses in front of the hand gripping it. The
			body is drawn in ink and the kit in gold, because the two are near enough the same colour
			otherwise and a band lying across an arm has to be seen to be a band.
		-->
		<g stroke="var(--c-ink)" stroke-linecap="round" fill="none" opacity="0.82">
			<!-- Filled and stroked both: seen side on the triangle is nearly edge on, and the stroke is
				 what keeps a trunk a trunk rather than a line. -->
			<path
				d="{TORSO.map((joint, i) => `${i === 0 ? 'M' : 'L'}${pose[joint][0]} ${pose[joint][1]}`).join('')}Z"
				fill="var(--c-ink)"
				stroke-width="10"
				stroke-linejoin="round"
			/>
			{#each BONES as bone (bone.from + bone.to)}
				<path
					d={line(pose[bone.from], pose[bone.to])}
					stroke-width={bone.width}
					opacity={far(bone.to) ? 0.45 : 1}
				/>
			{/each}
		</g>
		<circle
			cx={pose.head[0]}
			cy={pose.head[1]}
			r={HEAD_RADIUS}
			fill="var(--c-ink)"
			fill-opacity="0.82"
			stroke="none"
		/>

		<g stroke="var(--c-brand)" stroke-width="3.4" fill="none" stroke-linecap="round">
			{#if movement.prop === 'band'}
				<path d={band(pose.handLeft, pose.handRight, 110)} />
			{:else if movement.prop === 'anchoredBand' && movement.anchor}
				<!-- Under tension from the first rep, so it barely sags, and thin so it reads as a band
					 rather than as a pole the archer is holding. -->
				<path d={band(movement.anchor, pose.handLeft, 26)} stroke-width="2.2" />
				<path d={band(movement.anchor, pose.handRight, 26)} stroke-width="2.2" />
				<circle cx={movement.anchor[0]} cy={movement.anchor[1]} r="4" fill="var(--c-brand)" />
			{:else if movement.prop === 'bow'}
				<path d={bow.riser} stroke-width="4" />
				<path d={bow.string} stroke-width="1.6" />
			{:else if movement.prop === 'dumbbells'}
				{#each [pose.handLeft, pose.handRight] as hand (hand)}
					<path d={line([hand[0] - 9, hand[1]], [hand[0] + 9, hand[1]])} stroke-width="7" />
				{/each}
			{/if}
		</g>
	</svg>

	<figcaption class="mt-1 text-center text-xs font-medium text-muted">
		{$t(`exercises.frame.${showing.key}`)}
	</figcaption>
</figure>
