/**
 * A body movement, as the few numbers a drawing of it needs.
 *
 * The muscle map says which muscles an exercise works and the shot figure says when a muscle works
 * during the shot. Neither says what the archer actually does, and a paragraph of instructions is a
 * poor answer: an exercise is a shape the body passes through, so it is drawn as one.
 *
 * The model is deliberately a skeleton rather than a body. A movement is written as a base posture
 * plus the handful of joints that leave it, which is what makes adding one a few lines rather than a
 * drawing: everything else, the limbs, the proportions and the animation between frames, follows.
 */

/**
 * The joints a stick figure needs and no more. Left and right are the archer's own, so on a figure
 * seen from the front the left hand is drawn on the reader's left, as if looking in a mirror at the
 * archer's back. On a side view they are the near and the far limb of the same body.
 */
export const JOINTS = [
	'head',
	'neck',
	'chest',
	'hip',
	'shoulderLeft',
	'elbowLeft',
	'handLeft',
	'shoulderRight',
	'elbowRight',
	'handRight',
	'kneeLeft',
	'footLeft',
	'kneeRight',
	'footRight'
] as const;

export type Joint = (typeof JOINTS)[number];
export type Point = [number, number];
export type Pose = Record<Joint, Point>;

// Poses are written in a 200 by 260 box, with the floor around y 246. Nothing is drawn at that size:
// the diagram crops to what the movement occupies, so a figure lying down gets a wide box of its own.

/**
 * The trunk, drawn as one filled shape from the two shoulders down to the hip rather than as sticks
 * out to each shoulder. Drawn as sticks, a shoulder is a third segment in line with the upper arm
 * and the forearm, and an arm appears to have three parts. A shoulder has to be a corner of the
 * body for the two segments hanging off it to read as an arm.
 */
export const TORSO: Joint[] = ['shoulderLeft', 'shoulderRight', 'hip'];

/**
 * What the rest of the figure is built out of: a bone is two joints and how thick the line between
 * them is. The neck is what the trunk carries the head on, and everything else is a limb.
 */
export const BONES: { from: Joint; to: Joint; width: number }[] = [
	{ from: 'neck', to: 'chest', width: 9 },
	{ from: 'shoulderLeft', to: 'elbowLeft', width: 6 },
	{ from: 'elbowLeft', to: 'handLeft', width: 5 },
	{ from: 'shoulderRight', to: 'elbowRight', width: 6 },
	{ from: 'elbowRight', to: 'handRight', width: 5 },
	{ from: 'hip', to: 'kneeLeft', width: 9 },
	{ from: 'kneeLeft', to: 'footLeft', width: 7 },
	{ from: 'hip', to: 'kneeRight', width: 9 },
	{ from: 'kneeRight', to: 'footRight', width: 7 }
];

export const HEAD_RADIUS = 15;

/** Which way the archer is turned. It changes nothing in the model: it names what a pose means. */
export type MovementView = 'front' | 'back' | 'side' | 'prone';

/** The postures a movement starts from, so a frame only has to say how it differs from one. */
export const BASE: Record<'standing' | 'side' | 'prone', Pose> = {
	standing: {
		head: [100, 32],
		neck: [100, 54],
		chest: [100, 90],
		hip: [100, 142],
		shoulderLeft: [76, 64],
		elbowLeft: [68, 104],
		handLeft: [64, 142],
		shoulderRight: [124, 64],
		elbowRight: [132, 104],
		handRight: [136, 142],
		kneeLeft: [88, 194],
		footLeft: [86, 246],
		kneeRight: [112, 194],
		footRight: [114, 246]
	},
	// Facing right, which is where a target would be. The left limbs are the near side of the body and
	// the right limbs the far one, which is why a side view fades them: an arm behind a chest looks it.
	side: {
		head: [96, 32],
		neck: [101, 54],
		chest: [104, 90],
		hip: [100, 142],
		shoulderLeft: [106, 64],
		elbowLeft: [108, 104],
		handLeft: [110, 142],
		shoulderRight: [98, 64],
		elbowRight: [96, 104],
		handRight: [94, 142],
		kneeLeft: [102, 194],
		footLeft: [108, 246],
		kneeRight: [98, 194],
		footRight: [92, 246]
	},
	// Face down on the floor, head to the left, looked down on from above.
	prone: {
		head: [46, 120],
		neck: [62, 120],
		chest: [76, 120],
		hip: [124, 120],
		shoulderLeft: [72, 106],
		elbowLeft: [52, 96],
		handLeft: [30, 88],
		shoulderRight: [72, 134],
		elbowRight: [52, 144],
		handRight: [30, 152],
		kneeLeft: [162, 112],
		footLeft: [192, 108],
		kneeRight: [162, 128],
		footRight: [192, 132]
	}
};

/** A posture with some joints moved. Everything unnamed stays where the base put it. */
export function pose(base: keyof typeof BASE, moved: Partial<Pose> = {}): Pose {
	return { ...BASE[base], ...moved };
}

/**
 * What the frame is a picture of. A closed list rather than free text, because every movement in the
 * app has to name its moments in the same words and every word has to be translated.
 */
export const FRAME_KEYS = [
	'start',
	'open',
	'hold',
	'top',
	'bottom',
	'up',
	'down',
	'draw',
	'letdown',
	'stride',
	'end'
] as const;

export type FrameKey = (typeof FRAME_KEYS)[number];

/** What the hands are holding, drawn between them or at them. */
export type Prop = 'band' | 'bow' | 'dumbbells' | 'anchoredBand' | 'none';

export interface Frame {
	key: FrameKey;
	pose: Pose;
	/** Seconds the figure rests on this frame, for the moment of a movement that is the exercise. */
	dwell?: number;
}

export interface Movement {
	view: MovementView;
	prop: Prop;
	/**
	 * The poses passed through, in order. The animation runs them out and back rather than looping
	 * round, because a movement returns the way it came: nobody rewinds through a rep.
	 */
	frames: Frame[];
	/**
	 * Where an anchored band is tied, in the figure's box. Null for anything the archer holds at
	 * both ends.
	 */
	anchor?: Point;
}

/** Halfway between two poses, which is all an animation between frames needs. */
export function blend(from: Pose, to: Pose, ratio: number): Pose {
	const at = Math.min(1, Math.max(0, ratio));
	const out = {} as Pose;
	for (const joint of JOINTS) {
		out[joint] = [
			from[joint][0] + (to[joint][0] - from[joint][0]) * at,
			from[joint][1] + (to[joint][1] - from[joint][1]) * at
		];
	}
	return out;
}
