<script lang="ts">
	import { SHOT_PHASES, loadAt, musclesInPhase, type ShotPhase } from '$lib/domain/muscles';
	import { BACK, TRUNK, mirror, smooth } from './muscleMap';

	/**
	 * The archer, seen from behind, moving through the shot. The muscle map says where a muscle is;
	 * this says when it works, which is the half an exercise database needs and a static chart cannot
	 * give.
	 *
	 * It is the same body as the map, drawn from the same outline and in the same coordinates, so the
	 * two figures read as one archer rather than two diagrams. Only the arms are posed: each phase is
	 * a set of hand and elbow positions and everything between two phases is worked out on the way,
	 * which is what makes it move instead of flick.
	 */
	let {
		phase = 'anchor',
		playing = false,
		bones = false
	}: { phase?: ShotPhase; playing?: boolean; bones?: boolean } = $props();

	type Pose = { bowHand: [number, number]; elbow: [number, number]; drawHand: [number, number] };

	/**
	 * Where the arms are at each named moment, in the map's coordinates: the head is around y 30, the
	 * shoulders y 86, the hips y 210. The anchor puts the string hand under the jaw and against the
	 * face, because that is where an anchor is — a hand floating behind the head is nobody's shot.
	 */
	const POSES: Record<ShotPhase, Pose> = {
		stance: { bowHand: [138, 232], elbow: [56, 150], drawHand: [76, 220] },
		set: { bowHand: [162, 148], elbow: [80, 152], drawHand: [124, 150] },
		setup: { bowHand: [176, 30], elbow: [122, 20], drawHand: [140, 36] },
		draw: { bowHand: [186, 66], elbow: [132, 30], drawHand: [126, 56] },
		anchor: { bowHand: [188, 74], elbow: [34, 70], drawHand: [98, 54] },
		transfer: { bowHand: [189, 74], elbow: [29, 74], drawHand: [96, 54] },
		expansion: { bowHand: [190, 75], elbow: [23, 78], drawHand: [93, 55] },
		release: { bowHand: [191, 76], elbow: [12, 80], drawHand: [74, 52] },
		followThrough: { bowHand: [192, 78], elbow: [2, 76], drawHand: [56, 42] }
	};

	// Each arm leaves its own shoulder. One shared point in the middle of the chest draws a bar
	// through the archer instead of a pair of shoulders, which is what the body is actually for here.
	const BOW_SHOULDER: [number, number] = [149, 94];
	const DRAW_SHOULDER: [number, number] = [51, 94];
	/** Half a limb, so a bow reads as a bow rather than as a line beside the archer. */
	const LIMB = 88;

	/**
	 * The back's own muscles, the same shapes the map draws, shaded by what this moment asks of them.
	 * Only the trunk: the arms here are posed rather than hanging, so an arm muscle drawn in its
	 * resting place would sit in mid air beside the archer.
	 */
	const ARM_MUSCLES = new Set(['deltoidPosterior', 'triceps', 'forearmExtensors']);
	const MUSCLES_SHOWN = BACK.filter((region) => !ARM_MUSCLES.has(region.id)).flatMap((region) => [
		{ id: region.id, d: smooth(region.points) },
		{ id: region.id, d: smooth(mirror(region.points)) }
	]);

	const target = $derived(SHOT_PHASES.indexOf(phase));
	/**
	 * Where the figure is between the phases right now, in phase indexes. It starts in the stance
	 * whatever phase was asked for, so the first thing the page does is walk the archer into it.
	 */
	let at = $state(0);

	// One loop drives both the step from one phase to the next and the run through the whole shot, so
	// there is never a hand in two places at once.
	$effect(() => {
		let frame = 0;
		let last = performance.now();
		const step = (now: number) => {
			// Never negative: the first frame's stamp can land just behind the one taken on the way in,
			// and a backwards step would walk the figure off the front of the shot.
			const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
			last = now;
			if (playing) {
				// Around a second and a half a phase, and back to the stance once the arrow is away.
				at = (at + dt * 0.7) % SHOT_PHASES.length;
			} else {
				const gap = target - at;
				at = Math.abs(gap) < 0.01 ? target : at + gap * Math.min(1, dt * 9);
			}
			frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	});

	const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
	/** The shot is a ring: past the follow through is the stance again, and before the stance is too. */
	const wrap = (index: number) =>
		SHOT_PHASES[((index % SHOT_PHASES.length) + SHOT_PHASES.length) % SHOT_PHASES.length];

	const pose = $derived.by<Pose>(() => {
		const from = POSES[wrap(Math.floor(at))];
		const to = POSES[wrap(Math.floor(at) + 1)];
		const k = at - Math.floor(at);
		const mix = (key: keyof Pose): [number, number] => [
			lerp(from[key][0], to[key][0], k),
			lerp(from[key][1], to[key][1], k)
		];
		return { bowHand: mix('bowHand'), elbow: mix('elbow'), drawHand: mix('drawHand') };
	});

	/** The phase the figure is actually in, which while playing is not the one that was asked for. */
	const shown = $derived(wrap(Math.round(at)));

	/** What each muscle of the trunk is doing at the moment the figure is actually in. */
	const load = $derived(Object.fromEntries(musclesInPhase(shown).map((e) => [e.id, e.load])));

	/**
	 * How far apart the shoulder blades sit at this moment, as a share of their resting gap. Drawing
	 * the bones is only worth it if they move: scapular retraction is the whole shot and it is the one
	 * thing a muscle figure cannot show, because a muscle drawn on a silhouette never goes anywhere.
	 */
	const RETRACTION: Record<ShotPhase, number> = {
		stance: 1,
		set: 1,
		setup: 1.05,
		draw: 0.72,
		anchor: 0.52,
		transfer: 0.44,
		expansion: 0.36,
		release: 0.34,
		followThrough: 0.5
	};

	/**
	 * Whether the fingers are on the string. Before the set they are not, and from the release they
	 * are not again, so the string runs straight from limb to limb: a string bent round a hand that
	 * has let go is the one thing in this drawing that could never happen.
	 */
	const hookAt = (entry: ShotPhase) => (loadAt(entry, 'fingerFlexors') > 0 ? 1 : 0);
	const hook = $derived.by(() => {
		const from = hookAt(wrap(Math.floor(at)));
		const to = hookAt(wrap(Math.floor(at) + 1));
		return lerp(from, to, at - Math.floor(at));
	});

	/** Where the string is pulled to: the draw hand while it is hooked, the bow's own line when not. */
	const nock = $derived([
		lerp(pose.bowHand[0], pose.drawHand[0], hook),
		lerp(pose.bowHand[1], pose.drawHand[1], hook)
	]);

	const gap = $derived.by(() => {
		const from = RETRACTION[wrap(Math.floor(at))];
		const to = RETRACTION[wrap(Math.floor(at) + 1)];
		return lerp(from, to, at - Math.floor(at));
	});

	/** One shoulder blade: a rounded triangle, point down, with the spine of the blade across it. */
	const BLADE = smooth([
		[4, 0], [24, -5], [36, 4], [30, 24], [18, 42], [8, 32], [2, 14]
	]);

	/**
	 * Where a blade's origin sits. The blades converge on the spine but never meet it or each other:
	 * a pair that crosses over at full draw is drawing a retraction no shoulder can make.
	 */
	const bladeX = $derived(52 + 10 * (1 - gap));

	/** Halfway along the bow arm, which is where its elbow is: that arm is meant to be straight. */
	const bowElbow = $derived([
		BOW_SHOULDER[0] + (pose.bowHand[0] - BOW_SHOULDER[0]) * 0.5,
		BOW_SHOULDER[1] + (pose.bowHand[1] - BOW_SHOULDER[1]) * 0.5
	]);

	/** The unit normal to a→b, which is the direction a limb has width in. */
	function normal(a: number[], b: number[]): number[] {
		const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
		const length = Math.hypot(dx, dy) || 1;
		return [-dy / length, dx / length];
	}

	/** A limb with some meat on it: thick at the shoulder, thinner by the time it reaches the hand. */
	function limb(from: number[], to: number[], wide: number, thin: number): string {
		const n = normal(from, to);
		return smooth([
			[from[0] + n[0] * wide, from[1] + n[1] * wide],
			[to[0] + n[0] * thin, to[1] + n[1] * thin],
			[to[0] - n[0] * thin, to[1] - n[1] * thin],
			[from[0] - n[0] * wide, from[1] - n[1] * wide]
		]);
	}

	/**
	 * A bent limb as one shape rather than two. Drawn as an upper arm and a forearm butted together it
	 * shows a seam at the elbow and a corner where an elbow should be round; walking one outline down
	 * the outside and back up the inside gives the joint its bend. The width at the elbow follows the
	 * bisector of the two bones, which is what keeps the shape from pinching as the arm closes.
	 */
	function bentLimb(a: number[], b: number[], c: number[], widths: number[]): string {
		const first = normal(a, b);
		const second = normal(b, c);
		const middle = [first[0] + second[0], first[1] + second[1]];
		const scale = Math.hypot(middle[0], middle[1]) || 1;
		const mid = [middle[0] / scale, middle[1] / scale];
		const off = (point: number[], n: number[], w: number, sign: number) => [
			point[0] + n[0] * w * sign,
			point[1] + n[1] * w * sign
		];
		return smooth([
			off(a, first, widths[0], 1),
			off(b, mid, widths[1], 1),
			off(c, second, widths[2], 1),
			off(c, second, widths[2], -1),
			off(b, mid, widths[1], -1),
			off(a, first, widths[0], -1)
		]);
	}
</script>

<svg viewBox="-30 -6 262 404" class="w-full" role="img" aria-label={shown}>
	<!-- Ground, so the stance has something to stand on and the figure has a scale. -->
	<line x1="46" y1="390" x2="154" y2="390" stroke="var(--c-line)" stroke-width="1.6" />

	<!-- The same body the muscle map draws, minus the arms: this figure poses its own. -->
	<path d={TRUNK} fill="var(--c-surface)" stroke="var(--c-line)" stroke-width="1.4" />

	{#if bones}
		<!--
			The frame the shot is built on: a ribcage the blades slide across, the spine they slide
			towards, and the pelvis the whole thing stacks on. The blades move; nothing else does.
		-->
		<g fill="none" stroke="var(--c-muted)" stroke-width="1.3" stroke-linecap="round">
			<!-- Ribs, drawn as pairs curving down and forward off the spine. -->
			{#each [0, 1, 2, 3, 4, 5] as rib (rib)}
				{@const y = 100 + rib * 12}
				{@const w = [26, 32, 37, 38, 35, 28][rib]}
				<path d="M100 {y}q{w} 2 {w * 0.86} {14}" />
				<path d="M100 {y}q{-w} 2 {-w * 0.86} {14}" />
			{/each}
			<!-- Spine: the stack of vertebrae from the neck to the pelvis. -->
			{#each [80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190] as y (y)}
				<rect x="95" y={y} width="10" height="7" rx="2.5" fill="var(--c-surface)" />
			{/each}
			<!-- The pelvis the whole stack stands on: wide at the crest, narrowing to the seat. -->
			<path
				d="M68 200q32-9 64 0q1 16-6 25q-9 3-13 14q-4 8-13 8t-13-8q-4-11-13-14q-7-9-6-25z"
				fill="var(--c-surface)"
				stroke-width="1.4"
			/>
		</g>

		<!-- The shoulder blades, which is the point of drawing bones at all: they slide as the shot draws. -->
		<g class="transition-none">
			<path
				d={BLADE}
				transform="translate({bladeX} 96)"
				fill="var(--c-accent)"
				fill-opacity="0.5"
				stroke="var(--c-muted)"
				stroke-width="1.3"
			/>
			<path
				d={BLADE}
				transform="translate({200 - bladeX} 96) scale(-1 1)"
				fill="var(--c-accent)"
				fill-opacity="0.5"
				stroke="var(--c-muted)"
				stroke-width="1.3"
			/>
		</g>
	{:else}
	<!-- The back at work, lighting up muscle by muscle as the shot moves through it. -->
	{#each MUSCLES_SHOWN as shape, index (index)}
		<path
			d={shape.d}
			fill="var(--c-accent)"
			fill-opacity={[0, 0.3, 0.6, 1][load[shape.id] ?? 0] * 0.9}
			stroke="var(--c-line)"
			stroke-width="0.6"
			stroke-opacity={load[shape.id] ? 1 : 0}
			class="transition-[fill-opacity] duration-300"
		/>
	{/each}
	{/if}

	<!-- The bow: a recurve at the bow hand, with the string running back to wherever the fingers are. -->
	<g stroke="var(--c-ink)" fill="none" stroke-linecap="round">
		<path
			d="M{pose.bowHand[0]} {pose.bowHand[1] - LIMB}
			   Q{pose.bowHand[0] + 13} {pose.bowHand[1]} {pose.bowHand[0]} {pose.bowHand[1] + LIMB}"
			stroke-width="3.2"
		/>
		<path
			d="M{pose.bowHand[0]} {pose.bowHand[1] - LIMB} L{nock[0]} {nock[1]} L{pose
				.bowHand[0]} {pose.bowHand[1] + LIMB}"
			stroke-width="1.3"
		/>
	</g>

	<!--
		Bow arm: shoulder straight out to the hand, because a bent bow arm is not a shot. Drawn in two
		lengths so the elbow is somewhere rather than nowhere, with the forearm the thinner of them.
	-->
	<path
		d={bentLimb(BOW_SHOULDER, bowElbow, pose.bowHand, [10, 7, 5])}
		fill="var(--c-sunk)"
		stroke="var(--c-line)"
		stroke-width="1.2"
	/>
	<circle cx={bowElbow[0]} cy={bowElbow[1]} r="3" fill="none" stroke="var(--c-line)" stroke-width="1" />
	<!-- The deltoid cap, so the arm grows out of a shoulder instead of being pinned to a rib. -->
	<circle
		cx={BOW_SHOULDER[0]}
		cy={BOW_SHOULDER[1]}
		r="10"
		fill="var(--c-sunk)"
		stroke="var(--c-line)"
		stroke-width="1.2"
	/>
	<!--
		Draw arm, in the brand colour, and see-through: from behind it passes in front of the upper
		back, and a solid arm would hide the trapezius exactly when the shot is asking most of it.
	-->
	<path
		d={bentLimb(DRAW_SHOULDER, pose.elbow, pose.drawHand, [10, 7, 4.5])}
		fill="var(--c-brand)"
		fill-opacity="0.35"
		stroke="var(--c-brand)"
		stroke-opacity="0.8"
		stroke-width="1.2"
	/>
	<circle
		cx={DRAW_SHOULDER[0]}
		cy={DRAW_SHOULDER[1]}
		r="10"
		fill="var(--c-brand)"
		fill-opacity="0.35"
		stroke="var(--c-brand)"
		stroke-opacity="0.8"
		stroke-width="1.2"
	/>
	<!-- The drawing elbow, marked: it is the joint that tells one phase of the shot from the next. -->
	<circle
		cx={pose.elbow[0]}
		cy={pose.elbow[1]}
		r="3.4"
		fill="var(--c-brand)"
		stroke="var(--c-brand)"
		stroke-width="1"
	/>
	<g stroke="var(--c-brand)" stroke-width="1.6" stroke-linecap="round" fill="none" opacity={hook}>
		{#each [-4, 0, 4] as finger (finger)}
			<path
				d="M{pose.drawHand[0] - 6} {pose.drawHand[1] + finger} h7"
			/>
		{/each}
	</g>
	<circle cx={pose.drawHand[0]} cy={pose.drawHand[1]} r="4" fill="var(--c-brand)" />
	<!-- The bow hand on the grip, so the bow is held rather than balanced on the end of an arm. -->
	<circle
		cx={pose.bowHand[0]}
		cy={pose.bowHand[1]}
		r="5"
		fill="var(--c-sunk)"
		stroke="var(--c-line)"
		stroke-width="1.2"
	/>
</svg>
