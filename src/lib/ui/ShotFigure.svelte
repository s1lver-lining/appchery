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
		phase = null,
		playing = false,
		bones = false
	}: { phase?: ShotPhase | null; playing?: boolean; bones?: boolean } = $props();

	type Pose = { bowHand: [number, number]; elbow: [number, number]; drawHand: [number, number] };

	/**
	 * Where the arms are at each named moment, in the map's coordinates: the head is around y 30, the
	 * shoulders y 86, the hips y 210. The anchor puts the string hand under the jaw and against the
	 * face, because that is where an anchor is: a hand floating behind the head is nobody's shot.
	 */
	const POSES: Record<ShotPhase, Pose> = {
		stance: { bowHand: [138, 232], elbow: [56, 150], drawHand: [76, 220] },
		set: { bowHand: [162, 148], elbow: [96, 148], drawHand: [146, 136] },
		setup: { bowHand: [200, 42], elbow: [130, 26], drawHand: [176, 30] },
		draw: { bowHand: [206, 62], elbow: [140, 26], drawHand: [150, 52] },
		anchor: { bowHand: [208, 66], elbow: [34, 70], drawHand: [98, 54] },
		transfer: { bowHand: [209, 66], elbow: [29, 74], drawHand: [96, 54] },
		expansion: { bowHand: [210, 67], elbow: [23, 78], drawHand: [93, 55] },
		release: { bowHand: [211, 67], elbow: [12, 80], drawHand: [74, 52] },
		followThrough: { bowHand: [212, 67], elbow: [2, 76], drawHand: [56, 42] }
	};

	// Each arm leaves its own shoulder. One shared point in the middle of the chest draws a bar
	// through the archer instead of a pair of shoulders, which is what the body is actually for here.
	const BOW_SHOULDER: [number, number] = [149, 94];
	const DRAW_SHOULDER: [number, number] = [51, 94];
	/** Half a bow, so it reads as a bow rather than as a line beside the archer. */
	const LIMB = 78;
	/** The share of that half taken by the rigid middle. The rest is the working limb. */
	const RISER = 0.3;
	/** Brace height: how far the string sits from the grip with the bow strung and nothing pulled. */
	const BRACE = 18;
	/** How far above the grip the arrow rest sits on the riser. An arrow does not lie on a fist. */
	const REST = 12;

	/**
	 * A recurve, drawn the way one is built rather than as a single arc. The riser is rigid: a
	 * machined bar that does not bend however hard the bow is pulled, and the only part the hand ever
	 * touches. The limbs bolt onto its ends and are the only part that moves.
	 *
	 * Which way round they go is the whole thing. A limb leaves the riser bellying out towards the
	 * target, sweeps back past the riser's line towards the archer, and then at the very tip turns
	 * forward again. That last reversal is the recurve, and it is what the string lies against. Run
	 * the curve the other way and you have drawn a bow with its limbs bolted on backwards.
	 *
	 * `bend` runs from nothing at brace to one at full draw, and swings the tips back and in.
	 */
	function limbTip(hand: number[], bend: number, sign: number): number[] {
		return [
			hand[0] - BRACE + 4 - 11 * bend,
			hand[1] + sign * LIMB * (RISER + (1 - RISER) * (1 - 0.09 * bend))
		];
	}

	/** The three curves a limb is made of, as the numbers a quadratic needs. */
	function limbCurve(hand: number[], bend: number, sign: number) {
		const [x, y] = hand;
		const root = [x, y + sign * LIMB * RISER];
		const span = LIMB * (1 - RISER);
		// Out towards the target, then back past the riser, then the hook at the tip turns forward.
		const belly = [x + 9 - 7 * bend, root[1] + sign * span * 0.34];
		const sweep = [x - 7 - 9 * bend, root[1] + sign * span * 0.7];
		const hook = [x - BRACE - 5 - 13 * bend, root[1] + sign * span * 0.93];
		return { root, belly, sweep, hook, tip: limbTip(hand, bend, sign) };
	}

	function limbPath(hand: number[], bend: number, sign: number): string {
		const { root, belly, sweep, hook, tip } = limbCurve(hand, bend, sign);
		return (
			`M${root[0]} ${root[1]}` +
			`Q${belly[0]} ${belly[1]} ${sweep[0]} ${sweep[1]}` +
			`Q${hook[0]} ${hook[1]} ${tip[0]} ${tip[1]}`
		);
	}

	/**
	 * Where the string actually leaves the limb. It is tied at the tip, but the tip turns forward
	 * again past the deepest part of the hook, so the last stretch of string lies along the back of
	 * the limb rather than in the air. Run it to the tip instead and it saws straight through the
	 * bow. So the string is anchored to whatever point of the limb stands furthest back, which is
	 * the point it would rest against, and the tip curls away beyond it as it should.
	 */
	function stringPoint(hand: number[], bend: number, sign: number): number[] {
		const { sweep, hook, tip } = limbCurve(hand, bend, sign);
		let best = sweep;
		for (let step = 0; step <= 16; step++) {
			const t = step / 16;
			const u = 1 - t;
			const point = [
				u * u * sweep[0] + 2 * u * t * hook[0] + t * t * tip[0],
				u * u * sweep[1] + 2 * u * t * hook[1] + t * t * tip[1]
			];
			if (point[0] < best[0]) best = point;
		}
		return best;
	}

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

	/** With no phase chosen the archer stands in the stance and nothing on them is lit. */
	const target = $derived(phase ? SHOT_PHASES.indexOf(phase) : 0);
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
	const load = $derived(
		phase ? Object.fromEntries(musclesInPhase(shown).map((e) => [e.id, e.load])) : {}
	);

	/**
	 * How far apart the shoulder blades sit at this moment, as a share of their resting gap. Drawing
	 * the bones is only worth it if they move: scapular retraction is the whole shot and it is the one
	 * thing a muscle figure cannot show, because a muscle drawn on a silhouette never goes anywhere.
	 */
	const RETRACTION: Record<ShotPhase, { bow: number; draw: number }> = {
		stance: { bow: 1, draw: 1 },
		// The bow shoulder does its work early: the blade sets down and round as the bow goes up, and
		// from then on it holds. An archer whose bow blade is still moving at anchor is collapsing.
		set: { bow: 0.82, draw: 0.98 },
		setup: { bow: 0.7, draw: 0.95 },
		draw: { bow: 0.62, draw: 0.72 },
		// The string blade is the one that travels, and it travels the whole way: through the draw,
		// on through the transfer, and it is still going during the expansion. That is the shot.
		anchor: { bow: 0.6, draw: 0.52 },
		transfer: { bow: 0.6, draw: 0.44 },
		expansion: { bow: 0.6, draw: 0.34 },
		release: { bow: 0.62, draw: 0.3 },
		followThrough: { bow: 0.7, draw: 0.42 }
	};

	/**
	 * Whether the fingers are on the string. Before the set they are not, and from the release they
	 * are not again, so the string runs straight from limb to limb: a string bent round a hand that
	 * has let go is the one thing in this drawing that could never happen.
	 */
	const SET = SHOT_PHASES.indexOf('set');
	const hook = $derived(at >= SET && at <= SHOT_PHASES.indexOf('expansion') ? 1 : 0);

	/**
	 * Where the string is. The hand goes to the string, not the other way round: the string sits on
	 * the bow's own line until the fingers reach it and hook on, and it is only from then that it
	 * follows the hand. Anything else has the string leaping across to meet an archer.
	 */
	const braced = $derived([stringPoint(pose.bowHand, 0, -1)[0], pose.bowHand[1] - REST]);
	const nock = $derived.by(() => {
		// Loosed, the string runs itself forward and stops dead at brace, with the arrow still on it.
		if (loosed) {
			if (travel >= PUSH) return braced;
			return [LOOSE_FROM[0] + LOOSE_AIM[0] * travel, LOOSE_FROM[1] + LOOSE_AIM[1] * travel];
		}
		return [lerp(braced[0], pose.drawHand[0], hook), lerp(braced[1], pose.drawHand[1], hook)];
	});

	/** How far the bow is pulled: nothing at brace, all of it when the string is back at the face. */
	const bend = $derived(
		Math.max(0, Math.min(1, (braced[0] - nock[0]) / (braced[0] - (pose.bowHand[0] - 112))))
	);
	const tips = $derived([
		stringPoint(pose.bowHand, bend, -1),
		stringPoint(pose.bowHand, bend, 1)
	]);

	/**
	 * The loose, as one constant speed.
	 *
	 * A string does not ease the arrow away and then hurry: it comes forward hard from the moment the
	 * fingers open, drives the arrow the length of the draw, and reaches brace still travelling. The
	 * arrow leaves at exactly that instant, not before, or the bow is still bent when the arrow has
	 * gone, and carries on at the speed it already had. So there is one number here, a distance
	 * travelled along the shooting line, and the same rate applies either side of the separation.
	 */
	const ARROW = 126;
	const SPEED = 300;

	// Measured from the expansion, the last moment the string is on the fingers. Taking it from the
	// pose rather than reading it off the frame the loose happens to start on keeps it repeatable.
	const LOOSE_FROM = POSES.expansion.drawHand;
	const LOOSE_REST = [POSES.expansion.bowHand[0], POSES.expansion.bowHand[1] - REST];
	const LOOSE_AIM = (() => {
		const [dx, dy] = [LOOSE_REST[0] - LOOSE_FROM[0], LOOSE_REST[1] - LOOSE_FROM[1]];
		const length = Math.hypot(dx, dy) || 1;
		return [dx / length, dy / length];
	})();
	/** How far the string carries the arrow before it runs out of bow and lets go. */
	const PUSH =
		(stringPoint(POSES.expansion.bowHand, 0, -1)[0] - LOOSE_FROM[0]) / (LOOSE_AIM[0] || 1);

	const EXPANSION = SHOT_PHASES.indexOf('expansion');
	const loosed = $derived(at > EXPANSION);
	/** What the fingers are doing: curled round the string, or open because it has gone. */
	const held = $derived(loosed ? 0 : hook);
	let travel = $state(0);
	$effect(() => {
		if (!loosed) {
			travel = 0;
			return;
		}
		let frame = 0;
		let last = performance.now();
		const step = (now: number) => {
			travel = Math.min(PUSH + 90, travel + (SPEED * Math.max(0, now - last)) / 1000);
			last = now;
			if (travel < PUSH + 90) frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	});

	/** The nock end of the arrow: on the string while the string is pushing, then out on its own. */
	const arrowBack = $derived(
		loosed
			? [LOOSE_FROM[0] + LOOSE_AIM[0] * travel, LOOSE_FROM[1] + LOOSE_AIM[1] * travel]
			: nock
	);

	/**
	 * The arrow lies on a rest above the grip, not across the fist, which is what makes it level at
	 * full draw instead of sloping down into the bow hand.
	 */
	const rest = $derived([pose.bowHand[0], pose.bowHand[1] - REST]);
	const aim = $derived.by(() => {
		if (loosed) return LOOSE_AIM;
		const [dx, dy] = [rest[0] - nock[0], rest[1] - nock[1]];
		const length = Math.hypot(dx, dy) || 1;
		return [dx / length, dy / length];
	});

	/** Gone, once it is well clear of the bow. */
	const spent = $derived(Math.max(0, Math.min(1, (travel - PUSH) / 80)));

	const gaps = $derived.by(() => {
		const from = RETRACTION[wrap(Math.floor(at))];
		const to = RETRACTION[wrap(Math.floor(at) + 1)];
		const k = at - Math.floor(at);
		return { bow: lerp(from.bow, to.bow, k), draw: lerp(from.draw, to.draw, k) };
	});

	/** One shoulder blade: a rounded triangle, point down, with the spine of the blade across it. */
	const BLADE = smooth([
		[4, 0], [24, -5], [36, 4], [30, 24], [18, 42], [8, 32], [2, 14]
	]);

	/**
	 * Where a blade's origin sits. The blades converge on the spine but never meet it or each other:
	 * a pair that crosses over at full draw is drawing a retraction no shoulder can make.
	 */
	const bladeX = $derived({
		draw: 52 + 10 * (1 - gaps.draw),
		bow: 52 + 10 * (1 - gaps.bow)
	});

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

	/** The arrowhead, as a filled triangle sitting on the point of the shaft. */
	const head = $derived.by(() => {
		const point = [arrowBack[0] + ARROW * aim[0], arrowBack[1] + ARROW * aim[1]];
		const side = [-aim[1], aim[0]];
		const base = [point[0] - aim[0] * 9, point[1] - aim[1] * 9];
		return [
			point,
			[base[0] + side[0] * 3, base[1] + side[1] * 3],
			[base[0] - side[0] * 3, base[1] - side[1] * 3]
		];
	});

	/** Two vanes at the nock end, tall where the string is and tapering forward along the shaft. */
	const fletch = $derived.by(() => {
		const side = [-aim[1], aim[0]];
		const root = [arrowBack[0] + aim[0] * 3, arrowBack[1] + aim[1] * 3];
		const front = [arrowBack[0] + aim[0] * 17, arrowBack[1] + aim[1] * 17];
		return [1, -1].map((way) => [
			root,
			[root[0] + side[0] * 5.5 * way, root[1] + side[1] * 5.5 * way],
			front
		]);
	});

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

<svg viewBox="-34 -40 274 448" class="w-full" role="img" aria-label={shown}>
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
				transform="translate({bladeX.draw} 96)"
				fill="var(--c-accent)"
				fill-opacity="0.5"
				stroke="var(--c-muted)"
				stroke-width="1.3"
			/>
			<path
				d={BLADE}
				transform="translate({200 - bladeX.bow} 96) scale(-1 1)"
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

	<!-- The bow. A rigid riser with a working limb bolted to each end, which is what a recurve is. -->
	<g stroke="var(--c-ink)" fill="none" stroke-linecap="round">
		<!-- The riser: straight, and it stays straight. -->
		<path
			d="M{pose.bowHand[0]} {pose.bowHand[1] - LIMB * RISER} L{pose.bowHand[0]} {pose.bowHand[1] +
				LIMB * RISER}"
			stroke-width="5"
		/>
		<path d={limbPath(pose.bowHand, bend, -1)} stroke-width="3" />
		<path d={limbPath(pose.bowHand, bend, 1)} stroke-width="3" />
		<path
			d="M{tips[0][0]} {tips[0][1]} L{nock[0]} {nock[1]} L{tips[1][0]} {tips[1][1]}"
			stroke-width="1.3"
		/>
	</g>

	<!--
		The arrow: on the string through the draw, gone through the bow at the release. It is a whole
		arrow, long enough that its point is past the riser at full draw, because an arrow that stops
		short of the bow is not one an archer could shoot.
	-->
	<g opacity={1 - spent * 0.9}>
		<path
			d="M{arrowBack[0]} {arrowBack[1]} L{arrowBack[0] + ARROW * aim[0]} {arrowBack[1] +
				ARROW * aim[1]}"
			stroke="var(--c-ink)"
			stroke-width="1.6"
			stroke-linecap="round"
			fill="none"
		/>
		<!-- A solid head, and a solid fletch: at this size an outlined vane is three stray lines. -->
		<polygon
			points={head.map((point) => point.join(',')).join(' ')}
			fill="var(--c-ink)"
			stroke="none"
		/>
		{#each fletch as vane (vane)}
			<polygon points={vane.map((point) => point.join(',')).join(' ')} fill="var(--c-ink)" stroke="none" />
		{/each}
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
	<circle cx={BOW_SHOULDER[0]} cy={BOW_SHOULDER[1]} r="11" fill="var(--c-sunk)" stroke="none" />
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
		r="11"
		fill="var(--c-brand)"
		fill-opacity="0.35"
		stroke="none"
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
	<!--
		The string hand: a palm, and three fingers hooked round the string. They are drawn curled only
		while the fingers are actually on it, so the release shows them opening and the string leaving
		rather than a hand that was never holding anything.
	-->
	<g fill="none" stroke="var(--c-brand)" stroke-linecap="round">
		<circle cx={pose.drawHand[0]} cy={pose.drawHand[1]} r="5" fill="var(--c-brand)" stroke="none" />
		{#each [-4.5, 0, 4.5] as finger (finger)}
			<path
				d="M{pose.drawHand[0] - 3} {pose.drawHand[1] + finger}
				   q{7 + 2 * held} 0 {8 + 2 * held} {-finger * 0.5 - 1.5 * held}"
				stroke-width="1.8"
			/>
		{/each}
		<!-- The thumb, tucked down and away from the string where a recurve archer keeps it. -->
		<path d="M{pose.drawHand[0] - 2} {pose.drawHand[1] + 5} q-3 4 -7 4" stroke-width="1.6" />
	</g>
	<!--
		The bow hand: the pad at the base of the thumb takes the weight of the bow and the fingers stay
		off it, which is why they are drawn open. A gripped bow is a torqued bow.
	-->
	<!--
		The fingers wrap the far side of the riser and come back towards the archer, so from behind
		they are seen on the near side of the grip, not reaching away past the bow.
	-->
	<g fill="none" stroke="var(--c-line)" stroke-linecap="round" stroke-width="1.4">
		<circle cx={pose.bowHand[0]} cy={pose.bowHand[1]} r="5.5" fill="var(--c-sunk)" />
		<!-- The thumb, up and away from the fingers, where the web of it carries the bow. -->
		<path d="M{pose.bowHand[0] + 1} {pose.bowHand[1] - 5} q-6 -2 -9 1" />
		{#each [-2, 1.5, 5] as finger (finger)}
			<path d="M{pose.bowHand[0] - 1} {pose.bowHand[1] + finger} q-5 0.5 -7 0" stroke-width="1.5" />
		{/each}
	</g>
</svg>
