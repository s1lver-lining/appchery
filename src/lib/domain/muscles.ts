/**
 * The muscles a shot is made of, and how hard each one works at every moment of it.
 *
 * A general fitness muscle chart is the wrong shape for archery. It draws the muscles that show
 * under the skin, and the shot is held together by the ones that do not: the rhomboids between the
 * shoulder blades, the cuff wrapped around the back of the shoulder, the flexors that hook three
 * fingers on a string. So the list here is chosen by what draws a bow rather than by what a drawing
 * can show, and the ones no silhouette can carry are marked deep and given a close up of their own.
 */

export type MuscleId =
	| 'rhomboids'
	| 'trapeziusUpper'
	| 'trapeziusMid'
	| 'trapeziusLower'
	| 'levatorScapulae'
	| 'latissimus'
	| 'teresMajor'
	| 'serratusAnterior'
	| 'erectorSpinae'
	| 'deltoidPosterior'
	| 'deltoidLateral'
	| 'deltoidAnterior'
	| 'supraspinatus'
	| 'infraspinatus'
	| 'teresMinor'
	| 'subscapularis'
	| 'pectoralisMajor'
	| 'biceps'
	| 'triceps'
	| 'forearmFlexors'
	| 'forearmExtensors'
	| 'fingerFlexors'
	| 'rectusAbdominis'
	| 'obliques'
	| 'transverseAbdominis'
	| 'gluteusMaximus'
	| 'gluteusMedius'
	| 'tensorFasciaeLatae'
	| 'iliopsoas'
	| 'quadriceps'
	| 'hamstrings'
	| 'calves';

/** Where a muscle is looked for on the figure. Deep muscles are under another one and need a close up. */
export type MuscleView = 'back' | 'front' | 'deep';

/**
 * What a muscle does in the shot. The distinction is coaching, not anatomy: a `postural` muscle
 * holds the archer up whatever the arms are doing, a `mover` makes the draw happen, a `stabiliser`
 * stops the joint moving in ways it should not, and a `fault` is one whose recruitment is the thing
 * a coach is trying to take away.
 */
export type MuscleRole = 'mover' | 'stabiliser' | 'postural' | 'fault';

export type Muscle = {
	id: MuscleId;
	view: MuscleView;
	role: MuscleRole;
	/**
	 * The close up a deep muscle is drawn in. Only the shoulder blade has one: it carries four
	 * muscles that lie over and under each other and a drawing genuinely sorts them out. A muscle
	 * that would be alone in its own panel is picked from the list instead, because a close up of one
	 * shape is a caption with a picture stuck to it.
	 */
	inset?: 'scapula';
	/** Which side of the archer works it, when it is not both. */
	side?: 'draw' | 'bow';
};

/**
 * Ordered the way a coach walks the body: the shoulder blade first, because that is where the shot
 * is won, then out along the arms, then down through the trunk to the ground.
 */
export const MUSCLES: Muscle[] = [
	{ id: 'rhomboids', view: 'back', role: 'mover', side: 'draw' },
	{ id: 'trapeziusMid', view: 'back', role: 'mover', side: 'draw' },
	{ id: 'trapeziusLower', view: 'back', role: 'stabiliser' },
	{ id: 'trapeziusUpper', view: 'back', role: 'fault' },
	{ id: 'levatorScapulae', view: 'deep', role: 'fault', inset: 'scapula' },
	{ id: 'latissimus', view: 'back', role: 'mover', side: 'draw' },
	{ id: 'teresMajor', view: 'back', role: 'mover', side: 'draw' },
	{ id: 'serratusAnterior', view: 'front', role: 'stabiliser', side: 'bow' },
	{ id: 'erectorSpinae', view: 'back', role: 'postural' },
	{ id: 'deltoidPosterior', view: 'back', role: 'mover', side: 'draw' },
	{ id: 'deltoidLateral', view: 'front', role: 'mover', side: 'bow' },
	{ id: 'deltoidAnterior', view: 'front', role: 'mover', side: 'bow' },
	{ id: 'supraspinatus', view: 'deep', role: 'mover', inset: 'scapula', side: 'bow' },
	{ id: 'infraspinatus', view: 'back', role: 'stabiliser', inset: 'scapula' },
	{ id: 'teresMinor', view: 'deep', role: 'stabiliser', inset: 'scapula' },
	{ id: 'subscapularis', view: 'deep', role: 'stabiliser', inset: 'scapula' },
	{ id: 'pectoralisMajor', view: 'front', role: 'stabiliser', side: 'bow' },
	{ id: 'biceps', view: 'front', role: 'mover', side: 'draw' },
	{ id: 'triceps', view: 'back', role: 'stabiliser', side: 'bow' },
	{ id: 'forearmFlexors', view: 'front', role: 'stabiliser', side: 'draw' },
	{ id: 'forearmExtensors', view: 'back', role: 'stabiliser', side: 'bow' },
	{ id: 'fingerFlexors', view: 'deep', role: 'stabiliser', side: 'draw' },
	{ id: 'rectusAbdominis', view: 'front', role: 'postural' },
	{ id: 'obliques', view: 'front', role: 'postural' },
	{ id: 'transverseAbdominis', view: 'deep', role: 'postural' },
	{ id: 'gluteusMaximus', view: 'back', role: 'postural' },
	{ id: 'gluteusMedius', view: 'back', role: 'postural' },
	{ id: 'tensorFasciaeLatae', view: 'front', role: 'postural' },
	{ id: 'iliopsoas', view: 'front', role: 'postural' },
	{ id: 'quadriceps', view: 'front', role: 'postural' },
	{ id: 'hamstrings', view: 'back', role: 'postural' },
	{ id: 'calves', view: 'back', role: 'postural' }
];

export const MUSCLE_IDS: MuscleId[] = MUSCLES.map((muscle) => muscle.id);

const BY_ID = new Map(MUSCLES.map((muscle) => [muscle.id, muscle]));

export function muscle(id: MuscleId): Muscle | undefined {
	return BY_ID.get(id);
}

/** The muscles drawn on one figure, or the deep ones waiting in a close up. */
export function musclesIn(view: MuscleView): Muscle[] {
	return MUSCLES.filter((entry) => entry.view === view);
}

/**
 * The shot, cut where a coach cuts it. Stance through follow through is one movement, but naming
 * its moments is what lets an exercise say which part of the shot it is for.
 */
export const SHOT_PHASES = [
	'stance',
	'set',
	'setup',
	'draw',
	'anchor',
	'transfer',
	'expansion',
	'release',
	'followThrough'
] as const;

export type ShotPhase = (typeof SHOT_PHASES)[number];

/** How hard a muscle works: 1 quietly, 2 working, 3 as hard as it will work in the whole shot. */
export type Load = 1 | 2 | 3;

/**
 * How hard a set of muscles is worked by one thing, whatever that thing is. A moment of the shot is
 * one, an exercise is another, and a diagram shading either of them is reading the same map.
 */
export type LoadMap = Partial<Record<MuscleId, Load>>;

/**
 * What is working when. Everything unlisted is resting, which is as much of the picture as the
 * listed muscles are: an archer whose upper trapezius lights up during the draw is being told
 * something by its absence from the phases where it should be quiet.
 */
export const PHASE_LOAD: Record<ShotPhase, Partial<Record<MuscleId, Load>>> = {
	stance: {
		quadriceps: 2,
		hamstrings: 2,
		gluteusMaximus: 2,
		gluteusMedius: 2,
		tensorFasciaeLatae: 2,
		iliopsoas: 2,
		calves: 2,
		erectorSpinae: 2,
		transverseAbdominis: 2,
		obliques: 1,
		rectusAbdominis: 1
	},
	set: {
		quadriceps: 2,
		hamstrings: 2,
		gluteusMaximus: 2,
		gluteusMedius: 2,
		tensorFasciaeLatae: 1,
		iliopsoas: 1,
		calves: 2,
		erectorSpinae: 2,
		transverseAbdominis: 2,
		fingerFlexors: 2,
		forearmFlexors: 2,
		deltoidAnterior: 1
	},
	setup: {
		deltoidAnterior: 3,
		deltoidLateral: 3,
		supraspinatus: 3,
		// Lifting a bow overhead turns the shoulder blade and holds the head of the arm bone down
		// while it goes: that is the cuff's work, and the teres major's, long before the draw.
		infraspinatus: 2,
		teresMajor: 2,
		serratusAnterior: 3,
		trapeziusUpper: 2,
		levatorScapulae: 1,
		triceps: 2,
		forearmFlexors: 2,
		fingerFlexors: 2,
		erectorSpinae: 2,
		transverseAbdominis: 2,
		quadriceps: 2,
		gluteusMaximus: 2,
		gluteusMedius: 2,
		tensorFasciaeLatae: 1,
		iliopsoas: 1,
		calves: 1
	},
	draw: {
		rhomboids: 3,
		trapeziusMid: 3,
		deltoidPosterior: 3,
		latissimus: 2,
		teresMajor: 2,
		infraspinatus: 2,
		teresMinor: 2,
		trapeziusLower: 2,
		biceps: 2,
		forearmFlexors: 3,
		fingerFlexors: 3,
		deltoidLateral: 2,
		serratusAnterior: 2,
		subscapularis: 2,
		pectoralisMajor: 1,
		triceps: 2,
		erectorSpinae: 2,
		obliques: 2,
		transverseAbdominis: 2,
		quadriceps: 2,
		gluteusMaximus: 2,
		gluteusMedius: 2,
		tensorFasciaeLatae: 1,
		iliopsoas: 1,
		calves: 1
	},
	anchor: {
		rhomboids: 3,
		trapeziusMid: 3,
		trapeziusLower: 3,
		deltoidPosterior: 2,
		latissimus: 2,
		infraspinatus: 2,
		teresMinor: 2,
		subscapularis: 2,
		serratusAnterior: 2,
		biceps: 2,
		forearmFlexors: 3,
		fingerFlexors: 3,
		deltoidLateral: 2,
		pectoralisMajor: 1,
		triceps: 2,
		erectorSpinae: 2,
		transverseAbdominis: 2,
		quadriceps: 2,
		gluteusMaximus: 2,
		gluteusMedius: 2,
		tensorFasciaeLatae: 1,
		iliopsoas: 1
	},
	// The load moves off the arm and onto the back. The biceps letting go is the point of the phase.
	transfer: {
		trapeziusLower: 3,
		trapeziusMid: 3,
		rhomboids: 3,
		latissimus: 2,
		teresMajor: 2,
		infraspinatus: 2,
		subscapularis: 2,
		serratusAnterior: 2,
		biceps: 1,
		forearmFlexors: 2,
		fingerFlexors: 3,
		deltoidPosterior: 2,
		deltoidLateral: 2,
		triceps: 2,
		erectorSpinae: 2,
		transverseAbdominis: 2,
		quadriceps: 2,
		gluteusMaximus: 2,
		gluteusMedius: 2,
		tensorFasciaeLatae: 1,
		iliopsoas: 1
	},
	expansion: {
		rhomboids: 3,
		trapeziusMid: 3,
		trapeziusLower: 3,
		deltoidPosterior: 3,
		latissimus: 2,
		teresMajor: 2,
		infraspinatus: 2,
		teresMinor: 2,
		subscapularis: 2,
		serratusAnterior: 3,
		fingerFlexors: 3,
		forearmFlexors: 2,
		deltoidLateral: 2,
		deltoidAnterior: 2,
		pectoralisMajor: 1,
		triceps: 2,
		erectorSpinae: 2,
		obliques: 2,
		transverseAbdominis: 2,
		quadriceps: 2,
		gluteusMaximus: 2,
		gluteusMedius: 2,
		tensorFasciaeLatae: 1,
		iliopsoas: 1
	},
	// The fingers stop working and everything else keeps going: that is what makes it a release
	// rather than a letdown. The extensors are what the hand relaxes into, not what it pulls with.
	release: {
		rhomboids: 3,
		trapeziusMid: 3,
		deltoidPosterior: 3,
		trapeziusLower: 3,
		latissimus: 2,
		infraspinatus: 2,
		teresMinor: 2,
		serratusAnterior: 2,
		forearmExtensors: 2,
		triceps: 2,
		deltoidLateral: 2,
		erectorSpinae: 2,
		transverseAbdominis: 2,
		quadriceps: 2,
		gluteusMaximus: 2,
		gluteusMedius: 2,
		tensorFasciaeLatae: 1,
		iliopsoas: 1
	},
	followThrough: {
		rhomboids: 2,
		trapeziusMid: 2,
		trapeziusLower: 2,
		deltoidPosterior: 2,
		latissimus: 1,
		serratusAnterior: 2,
		deltoidLateral: 2,
		triceps: 2,
		erectorSpinae: 2,
		transverseAbdominis: 2,
		quadriceps: 2,
		gluteusMaximus: 2,
		gluteusMedius: 2,
		tensorFasciaeLatae: 1,
		iliopsoas: 1,
		calves: 1
	}
};

/** How hard `id` works in `phase`, zero when it is resting. */
export function loadAt(phase: ShotPhase, id: MuscleId): 0 | Load {
	return PHASE_LOAD[phase][id] ?? 0;
}

/** Everything working in `phase`, hardest first, so the eye is sent to the muscles that matter. */
export function musclesInPhase(phase: ShotPhase): { id: MuscleId; load: Load }[] {
	return MUSCLE_IDS.map((id) => ({ id, load: loadAt(phase, id) }))
		.filter((entry): entry is { id: MuscleId; load: Load } => entry.load > 0)
		.sort((a, b) => b.load - a.load || MUSCLE_IDS.indexOf(a.id) - MUSCLE_IDS.indexOf(b.id));
}

/** The hardest a muscle is ever worked by the shot, which is what an exercise for it has to match. */
export function peakLoad(id: MuscleId): 0 | Load {
	return SHOT_PHASES.reduce<0 | Load>(
		(peak, phase) => (loadAt(phase, id) > peak ? loadAt(phase, id) : peak),
		0
	);
}

/** Where in the shot a muscle is worked hardest, for an exercise that wants to name its moment. */
export function peakPhases(id: MuscleId): ShotPhase[] {
	const peak = peakLoad(id);
	return peak === 0 ? [] : SHOT_PHASES.filter((phase) => loadAt(phase, id) === peak);
}

/**
 * Adding or removing one muscle from a selection, kept in the canonical order rather than in the
 * order they were tapped, so two archers who picked the same muscles have written the same exercise.
 */
export function toggleMuscle(selected: MuscleId[], id: MuscleId): MuscleId[] {
	const next = selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id];
	return MUSCLE_IDS.filter((entry) => next.includes(entry));
}

/**
 * The share of the shot a selection actually covers, weighted by how hard each muscle works: an
 * exercise hitting the rhomboids covers more of the draw than one hitting the calves, and a
 * training plan is only as good as the load it puts back where the shot takes it from.
 */
export function shotCoverage(selected: MuscleId[]): number {
	const total = MUSCLE_IDS.reduce((sum, id) => sum + peakLoad(id), 0);
	if (total === 0) return 0;
	const covered = selected.reduce((sum, id) => sum + peakLoad(id), 0);
	return Math.min(1, covered / total);
}
