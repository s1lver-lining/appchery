import { BASE, pose, type Movement } from './movement';
import type { Exercise } from './types';

/**
 * The exercises the app ships with, checked against how archery coaching actually prescribes them.
 * The four SPTs are USA Archery's, with their own hold times and rests; the rest are the shoulder
 * and back work every archery strength programme is built out of.
 *
 * Load figures are a coach's reading rather than a measurement: 3 is what the exercise is for, 2 is
 * working, 1 is along for the ride. They are on the same scale as the shot's own loads, which is
 * what lets a routine be checked against what the shot actually asks for.
 */

/** Standing with the arms out in front, which is where most bandwork starts. */
const armsForward = (y: number) =>
	pose('standing', {
		shoulderLeft: [78, 64],
		elbowLeft: [70, y - 22],
		handLeft: [82, y],
		shoulderRight: [122, 64],
		elbowRight: [130, y - 22],
		handRight: [118, y]
	});

const BAND_PULL_APART: Movement = {
	view: 'front',
	prop: 'band',
	frames: [
		{ key: 'start', pose: armsForward(86) },
		{
			key: 'open',
			pose: pose('standing', {
				shoulderLeft: [74, 64],
				elbowLeft: [46, 78],
				handLeft: [18, 86],
				shoulderRight: [126, 64],
				elbowRight: [154, 78],
				handRight: [182, 86]
			}),
			dwell: 1
		}
	]
};

const FACE_PULL: Movement = {
	view: 'front',
	prop: 'anchoredBand',
	anchor: [100, 8],
	frames: [
		{
			key: 'start',
			pose: pose('standing', {
				elbowLeft: [78, 62],
				handLeft: [88, 40],
				elbowRight: [122, 62],
				handRight: [112, 40]
			})
		},
		{
			key: 'end',
			pose: pose('standing', {
				shoulderLeft: [74, 66],
				elbowLeft: [40, 56],
				handLeft: [74, 36],
				shoulderRight: [126, 66],
				elbowRight: [160, 56],
				handRight: [126, 36]
			}),
			dwell: 1
		}
	]
};

const PRONE_YTW: Movement = {
	view: 'prone',
	prop: 'none',
	frames: [
		{
			key: 'start',
			pose: pose('prone', {
				elbowLeft: [42, 186],
				handLeft: [14, 176],
				elbowRight: [46, 244],
				handRight: [18, 254]
			})
		},
		{
			key: 'top',
			pose: pose('prone', {
				shoulderLeft: [70, 198],
				elbowLeft: [44, 178],
				handLeft: [16, 164],
				shoulderRight: [74, 228],
				elbowRight: [48, 252],
				handRight: [20, 266]
			}),
			dwell: 1.2
		}
	]
};

const EXTERNAL_ROTATION: Movement = {
	view: 'front',
	prop: 'band',
	frames: [
		{
			key: 'start',
			pose: pose('standing', {
				elbowLeft: [80, 108],
				handLeft: [98, 96],
				elbowRight: [120, 108],
				handRight: [102, 96]
			})
		},
		{
			key: 'open',
			pose: pose('standing', {
				elbowLeft: [80, 108],
				handLeft: [46, 92],
				elbowRight: [120, 108],
				handRight: [154, 92]
			}),
			dwell: 1
		}
	]
};

const SCAPULAR_SETTING: Movement = {
	view: 'front',
	prop: 'none',
	frames: [
		{ key: 'start', pose: BASE.standing },
		{
			key: 'hold',
			pose: pose('standing', {
				shoulderLeft: [82, 66],
				elbowLeft: [74, 106],
				handLeft: [70, 144],
				shoulderRight: [118, 66],
				elbowRight: [126, 106],
				handRight: [130, 144]
			}),
			dwell: 3
		}
	]
};

/** Anchor under the jaw, bow arm out towards the target: the shot, held rather than shot. */
const HOLDING: Movement = {
	view: 'side',
	prop: 'bow',
	frames: [
		{
			key: 'start',
			pose: pose('side', {
				shoulderLeft: [108, 66],
				elbowLeft: [126, 92],
				handLeft: [138, 122],
				shoulderRight: [96, 64],
				elbowRight: [90, 96],
				handRight: [96, 126]
			})
		},
		{
			key: 'draw',
			pose: pose('side', {
				shoulderLeft: [110, 64],
				elbowLeft: [140, 60],
				handLeft: [170, 58],
				shoulderRight: [94, 64],
				elbowRight: [62, 56],
				handRight: [96, 48]
			}),
			dwell: 4
		}
	]
};

const REVERSALS: Movement = {
	view: 'side',
	prop: 'bow',
	frames: [
		{
			key: 'start',
			pose: pose('side', {
				shoulderLeft: [108, 66],
				elbowLeft: [134, 74],
				handLeft: [164, 66],
				shoulderRight: [96, 64],
				elbowRight: [112, 52],
				handRight: [142, 52]
			})
		},
		{
			key: 'draw',
			pose: pose('side', {
				shoulderLeft: [110, 64],
				elbowLeft: [140, 60],
				handLeft: [170, 58],
				shoulderRight: [94, 64],
				elbowRight: [62, 56],
				handRight: [96, 48]
			}),
			dwell: 2
		},
		{ key: 'letdown', pose: pose('side', { shoulderLeft: [108, 66], elbowLeft: [134, 74], handLeft: [164, 66], shoulderRight: [96, 64], elbowRight: [112, 52], handRight: [142, 52] }) }
	]
};

const BOW_RAISE: Movement = {
	view: 'side',
	prop: 'bow',
	frames: [
		{
			key: 'start',
			pose: pose('side', {
				elbowLeft: [110, 106],
				handLeft: [114, 146],
				elbowRight: [94, 106],
				handRight: [92, 146]
			})
		},
		{
			key: 'up',
			pose: pose('side', {
				shoulderLeft: [108, 64],
				elbowLeft: [136, 66],
				handLeft: [166, 62],
				shoulderRight: [96, 64],
				elbowRight: [116, 50],
				handRight: [146, 50]
			}),
			dwell: 4
		}
	]
};

const PLANK: Movement = {
	view: 'prone',
	prop: 'none',
	frames: [
		{
			key: 'start',
			pose: pose('prone', {
				head: [30, 188],
				neck: [50, 194],
				chest: [76, 198],
				hip: [120, 202],
				shoulderLeft: [72, 190],
				elbowLeft: [60, 216],
				handLeft: [36, 214],
				shoulderRight: [76, 210],
				elbowRight: [64, 234],
				handRight: [40, 232],
				kneeLeft: [158, 206],
				footLeft: [190, 224],
				kneeRight: [160, 216],
				footRight: [192, 234]
			}),
			dwell: 4
		}
	]
};

const RUNNING: Movement = {
	view: 'side',
	prop: 'none',
	frames: [
		{
			key: 'stride',
			pose: pose('side', {
				head: [100, 30],
				chest: [106, 88],
				shoulderLeft: [110, 64],
				elbowLeft: [130, 90],
				handLeft: [122, 62],
				shoulderRight: [96, 64],
				elbowRight: [74, 92],
				handRight: [84, 120],
				kneeLeft: [130, 176],
				footLeft: [154, 206],
				kneeRight: [80, 200],
				footRight: [54, 232]
			})
		},
		{
			key: 'stride',
			pose: pose('side', {
				head: [100, 30],
				chest: [106, 88],
				shoulderLeft: [110, 64],
				elbowLeft: [86, 92],
				handLeft: [96, 120],
				shoulderRight: [96, 64],
				elbowRight: [118, 90],
				handRight: [110, 62],
				kneeLeft: [76, 198],
				footLeft: [50, 228],
				kneeRight: [126, 178],
				footRight: [150, 208]
			})
		}
	]
};

export const EXERCISES: Exercise[] = [
	{
		key: 'bandPullApart',
		activity: 'strength',
		kit: 'band',
		measure: 'reps',
		level: 'beginner',
		defaults: { sets: 3, reps: 15, restSeconds: 60 },
		load: {
			rhomboids: 3,
			trapeziusMid: 3,
			deltoidPosterior: 3,
			trapeziusLower: 2,
			infraspinatus: 2,
			teresMinor: 1
		},
		phases: ['draw', 'transfer', 'expansion'],
		movement: BAND_PULL_APART,
		steps: 4
	},
	{
		key: 'facePull',
		activity: 'strength',
		kit: 'band',
		measure: 'reps',
		level: 'beginner',
		defaults: { sets: 3, reps: 12, restSeconds: 60 },
		load: {
			deltoidPosterior: 3,
			infraspinatus: 3,
			trapeziusMid: 3,
			rhomboids: 2,
			trapeziusLower: 2,
			teresMinor: 2,
			supraspinatus: 1
		},
		phases: ['draw', 'anchor', 'transfer'],
		movement: FACE_PULL,
		steps: 4
	},
	{
		key: 'proneYtw',
		activity: 'strength',
		kit: 'none',
		measure: 'reps',
		level: 'beginner',
		defaults: { sets: 3, reps: 8, restSeconds: 60 },
		load: {
			trapeziusLower: 3,
			trapeziusMid: 3,
			rhomboids: 3,
			deltoidPosterior: 2,
			infraspinatus: 2,
			erectorSpinae: 2,
			serratusAnterior: 1
		},
		phases: ['setup', 'transfer'],
		movement: PRONE_YTW,
		steps: 5
	},
	{
		key: 'externalRotation',
		activity: 'strength',
		kit: 'band',
		measure: 'reps',
		level: 'beginner',
		defaults: { sets: 3, reps: 15, restSeconds: 45 },
		load: { infraspinatus: 3, teresMinor: 3, deltoidPosterior: 2, supraspinatus: 1 },
		phases: ['setup', 'draw', 'anchor'],
		movement: EXTERNAL_ROTATION,
		steps: 4,
		caution: true
	},
	{
		key: 'scapularSetting',
		activity: 'strength',
		kit: 'none',
		measure: 'hold',
		level: 'beginner',
		defaults: { sets: 3, reps: 8, holdSeconds: 5, restSeconds: 30 },
		load: { rhomboids: 3, trapeziusMid: 3, trapeziusLower: 2, serratusAnterior: 1 },
		phases: ['transfer', 'expansion'],
		movement: SCAPULAR_SETTING,
		steps: 4
	},
	{
		key: 'holdingSpt',
		activity: 'strength',
		kit: 'bow',
		measure: 'hold',
		level: 'intermediate',
		defaults: { sets: 3, reps: 10, holdSeconds: 30, restSeconds: 60 },
		load: {
			rhomboids: 3,
			trapeziusMid: 3,
			trapeziusLower: 3,
			deltoidPosterior: 3,
			fingerFlexors: 3,
			forearmFlexors: 3,
			latissimus: 2,
			teresMajor: 2,
			infraspinatus: 2,
			subscapularis: 2,
			serratusAnterior: 2,
			deltoidLateral: 2,
			deltoidAnterior: 2,
			biceps: 2,
			triceps: 2,
			erectorSpinae: 2,
			transverseAbdominis: 2
		},
		phases: ['anchor', 'transfer', 'expansion'],
		movement: HOLDING,
		steps: 5,
		caution: true
	},
	{
		key: 'reversals',
		activity: 'strength',
		kit: 'bow',
		measure: 'reps',
		level: 'intermediate',
		defaults: { sets: 6, reps: 8, holdSeconds: 2, restSeconds: 120 },
		load: {
			rhomboids: 3,
			trapeziusMid: 3,
			deltoidPosterior: 3,
			trapeziusLower: 2,
			latissimus: 2,
			teresMajor: 2,
			infraspinatus: 2,
			subscapularis: 2,
			serratusAnterior: 2,
			deltoidAnterior: 2,
			deltoidLateral: 2,
			supraspinatus: 2,
			biceps: 2,
			forearmFlexors: 3,
			fingerFlexors: 3,
			erectorSpinae: 2
		},
		phases: ['setup', 'draw', 'anchor', 'transfer'],
		movement: REVERSALS,
		steps: 5,
		caution: true
	},
	{
		key: 'bowRaise',
		activity: 'strength',
		kit: 'bow',
		measure: 'hold',
		level: 'beginner',
		defaults: { sets: 3, holdSeconds: 60, restSeconds: 90 },
		load: {
			deltoidAnterior: 3,
			deltoidLateral: 3,
			supraspinatus: 3,
			serratusAnterior: 3,
			triceps: 2,
			forearmFlexors: 2,
			transverseAbdominis: 1
		},
		phases: ['setup'],
		movement: BOW_RAISE,
		steps: 4
	},
	{
		key: 'plank',
		activity: 'strength',
		kit: 'none',
		measure: 'hold',
		level: 'beginner',
		defaults: { sets: 3, holdSeconds: 45, restSeconds: 45 },
		load: {
			transverseAbdominis: 3,
			rectusAbdominis: 3,
			obliques: 2,
			erectorSpinae: 2,
			serratusAnterior: 2,
			gluteusMaximus: 2,
			quadriceps: 1
		},
		phases: ['stance', 'expansion'],
		movement: PLANK,
		steps: 4
	},
	{
		key: 'running',
		activity: 'running',
		kit: 'outdoors',
		measure: 'distance',
		level: 'beginner',
		defaults: { sets: 1, distanceM: 3000 },
		load: {
			quadriceps: 3,
			calves: 3,
			hamstrings: 2,
			gluteusMaximus: 2,
			gluteusMedius: 2,
			iliopsoas: 2,
			tensorFasciaeLatae: 1,
			erectorSpinae: 1,
			transverseAbdominis: 1
		},
		phases: ['stance'],
		movement: RUNNING,
		steps: 3
	}
];
