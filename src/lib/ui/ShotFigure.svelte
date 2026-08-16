<script lang="ts">
	import { SHOT_PHASES, musclesInPhase, type ShotPhase } from '$lib/domain/muscles';

	/**
	 * The archer, seen from behind and slightly to the side, moving through the shot. The muscle map
	 * says where a muscle is; this says when it works, which is the half an exercise database needs
	 * and a static chart cannot give.
	 *
	 * The figure is joints and limbs rather than a drawing per phase: each phase is a set of hand and
	 * elbow positions, and everything between two phases is worked out on the way. That is what makes
	 * it move instead of flick, and it means a phase is edited by moving three numbers.
	 */
	let {
		phase = 'anchor',
		playing = false
	}: { phase?: ShotPhase; playing?: boolean } = $props();

	type Pose = { bowHand: [number, number]; elbow: [number, number]; drawHand: [number, number] };

	/** Where the arms are at each named moment. The trunk barely moves, which is rather the point. */
	const POSES: Record<ShotPhase, Pose> = {
		stance: { bowHand: [122, 168], elbow: [82, 132], drawHand: [88, 168] },
		set: { bowHand: [132, 146], elbow: [96, 142], drawHand: [112, 146] },
		setup: { bowHand: [148, 56], elbow: [116, 44], drawHand: [130, 60] },
		draw: { bowHand: [154, 84], elbow: [128, 54], drawHand: [116, 82] },
		// The string hand comes under the jaw, not onto it: drawn on the chin it vanishes behind the head.
		anchor: { bowHand: [156, 86], elbow: [70, 72], drawHand: [98, 86] },
		transfer: { bowHand: [157, 86], elbow: [66, 78], drawHand: [96, 86] },
		expansion: { bowHand: [158, 87], elbow: [61, 83], drawHand: [93, 87] },
		release: { bowHand: [159, 88], elbow: [46, 84], drawHand: [74, 82] },
		followThrough: { bowHand: [160, 90], elbow: [38, 80], drawHand: [60, 74] }
	};

	// Each arm leaves its own shoulder. One shared point in the middle of the chest draws a bar
	// through the archer instead of a pair of shoulders, which is what the body is actually for here.
	const BOW_SHOULDER: [number, number] = [116, 94];
	const DRAW_SHOULDER: [number, number] = [84, 94];

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

	/**
	 * How lit the back is: the share of the shot's hardest work happening now. The glow is a summary,
	 * not an anatomy claim, so it sits over the shoulder blades where the archer feels it.
	 */
	const effort = $derived(
		musclesInPhase(shown).filter((entry) => entry.load === 3).length / 6
	);
</script>

<svg viewBox="0 0 200 300" class="w-full" role="img" aria-label={shown}>
	<!-- Ground, so the stance has something to stand on and the figure has a scale. -->
	<line x1="34" y1="272" x2="166" y2="272" stroke="var(--c-line)" stroke-width="1.5" />

	<!-- Legs, which hold their shape through the whole shot: the shot is made above the hips. -->
	<g stroke="var(--c-muted)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none">
		<path d="M92 168 86 216 82 266" />
		<path d="M108 168 116 216 120 266" />
	</g>
	<g stroke="var(--c-muted)" stroke-width="7" stroke-linecap="round" fill="none">
		<path d="M78 268h14M116 268h14" />
	</g>

	<!-- The trunk: wide across the shoulders, narrow at the waist, so the back has somewhere to be. -->
	<path
		d="M74 88 C72 118 78 142 82 170 L118 170 C122 142 128 118 126 88 C116 82 84 82 74 88z"
		fill="var(--c-surface)"
		stroke="var(--c-line)"
		stroke-width="1.5"
	/>

	<!-- The shoulder blades, brightening as the shot loads the back. Two of them, where they are. -->
	<g class="transition-[opacity] duration-200" opacity={0.15 + 0.85 * Math.min(1, effort)}>
		<ellipse cx="89" cy="106" rx="9" ry="15" fill="var(--c-accent)" fill-opacity="0.85" />
		<ellipse cx="111" cy="106" rx="9" ry="15" fill="var(--c-accent)" fill-opacity="0.85" />
	</g>

	<!-- The bow: a recurve at the bow hand, with the string running back to wherever the fingers are. -->
	<g stroke="var(--c-ink)" fill="none" stroke-linecap="round">
		<path
			d="M{pose.bowHand[0]} {pose.bowHand[1] - 58}
			   Q{pose.bowHand[0] + 11} {pose.bowHand[1]} {pose.bowHand[0]} {pose.bowHand[1] + 58}"
			stroke-width="3"
		/>
		<path
			d="M{pose.bowHand[0]} {pose.bowHand[1] - 58} L{pose.drawHand[0]} {pose.drawHand[1]} L{pose
				.bowHand[0]} {pose.bowHand[1] + 58}"
			stroke-width="1.3"
		/>
	</g>

	<!-- Bow arm: shoulder straight out to the hand, because a bent bow arm is not a shot. -->
	<path
		d="M{BOW_SHOULDER[0]} {BOW_SHOULDER[1]} L{pose.bowHand[0]} {pose.bowHand[1]}"
		stroke="var(--c-muted)"
		stroke-width="11"
		stroke-linecap="round"
		fill="none"
	/>
	<!-- Draw arm, in the brand colour: the elbow is the joint that tells one phase from the next. -->
	<path
		d="M{DRAW_SHOULDER[0]} {DRAW_SHOULDER[1]} L{pose.elbow[0]} {pose.elbow[1]} L{pose
			.drawHand[0]} {pose.drawHand[1]}"
		stroke="var(--c-brand)"
		stroke-width="11"
		stroke-linecap="round"
		stroke-linejoin="round"
		fill="none"
	/>

	<!-- Head last, so an arm coming to the face passes behind it rather than across it. -->
	<path d="M100 70v18" stroke="var(--c-line)" stroke-width="11" stroke-linecap="round" />
	<circle cx="100" cy="58" r="15" fill="var(--c-surface)" stroke="var(--c-line)" stroke-width="1.5" />
</svg>
