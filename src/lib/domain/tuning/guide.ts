import type { Locale } from '$lib/i18n';

/**
 * The order a bow is set up in, as a reading list rather than as a form.
 *
 * Setting up a bow is a sequence: every step assumes the ones above it are already right, which is
 * why the page is numbered and why a step says what it depends on rather than standing alone. The
 * recurve order follows the way the job is actually done, from the geometry of the bare bow through
 * fitting the arrows to it and only then to fine tuning. The compound order is the same idea for a
 * bow whose geometry is set by its cams.
 *
 * The text is written here rather than in the dictionaries because a step is a small document, with
 * a list of actions and a table of what a result suggests, and neither fits a flat key.
 */

export type GuideBow = 'recurve' | 'compound';

/** The pictures worth drawing. A step with no geometry to show carries none. */
export type DiagramName =
	| 'limbAlignment'
	| 'centreShot'
	| 'tiller'
	| 'nockingPoint'
	| 'bareShaft'
	| 'paperTear'
	| 'drawLength'
	| 'bowStrength'
	| 'braceMeasure'
	| 'sightAlignment'
	| 'plungerLine'
	| 'tillerDrift'
	| 'braceGroups';

/**
 * The diagrams whose reading swaps with the bow hand: a line of arrows leaning one way says the
 * spring is soft for a right hander and stiff for a left hander, so one drawing cannot serve both.
 */
export const HANDED_DIAGRAMS: DiagramName[] = ['centreShot', 'sightAlignment', 'plungerLine'];

/**
 * The kind of work a step is, which is what the list groups by: things measured once, the bare bow
 * put together, the settings roughed in before anything is shot, and the arrows matched to it.
 */
export type GuideCategory = 'measure' | 'setup' | 'presetting' | 'arrows' | 'fine';

export interface GuideStep {
	key: string;
	bow: GuideBow;
	/** The heading this step reads under. Compound steps run as one list, so they carry none. */
	category?: GuideCategory;
	diagram?: DiagramName;
	/** The tuning activity this step is done as, when it is something shot rather than measured. */
	templateKey?: string;
	/**
	 * A working block the step carries under its results: a table to read a starting figure off, or
	 * a calculator. Only a step that has a number to hand the archer carries one.
	 */
	block?: GuideBlock;
	/** Settings this step writes, so the step can point at the fields it is about. */
	settings?: string[];
}

/**
 * Blocks a step can carry: the reference table for brace height, the mass to weight sum, and the
 * shape the two brace height curves make when the test is going right.
 */
export type GuideBlock = 'braceHeightTable' | 'weightRatio' | 'braceCurveExample';

/**
 * Where to start a brace height from, by bow length, for a 25 inch riser: the figures the makers
 * quote for a bow put together the usual way. It is a starting point, not a setting: the fine pass
 * is shot, not read.
 */
export const BRACE_HEIGHT_TABLE: { bowLength: number; size: string; minCm: number; maxCm: number }[] =
	[
		{ bowLength: 66, size: 'SM', minCm: 21, maxCm: 22 },
		{ bowLength: 68, size: 'MD', minCm: 22, maxCm: 23 },
		{ bowLength: 70, size: 'LG', minCm: 23, maxCm: 24 }
	];

export interface StepText {
	title: string;
	/** One line on why the step exists, which is what makes an order feel like a reason. */
	why: string;
	steps: string[];
	results: { observation: string; suggests: string }[];
	/**
	 * The same step read on a left handed bow, where every sideways reading is the mirror of the
	 * one above. Only the lines that name a side are repeated: a step whose wording never says left
	 * or right carries none, and a reader on either bow gets the same words.
	 *
	 * Written out rather than swapped by machine, because "move the rest right" and "a stiffer
	 * shaft" sit in the same sentence and only one of them turns over.
	 */
	left?: { steps?: string[]; results?: { observation: string; suggests: string }[] };
}

/** Steps whose reading turns over with the bow hand, so the page offers the reader the choice. */
export const HANDED_STEPS = [
	'centre-shot',
	'arrow-spine',
	'bare-shaft',
	'plunger-fine',
	'compound-rest',
	'paper-tune',
	'walk-back'
];

export const GUIDE_STEPS: GuideStep[] = [
	{
		key: 'draw-length',
		bow: 'recurve',
		category: 'measure',
		diagram: 'drawLength',
		settings: ['drawLength', 'arrowLength']
	},
	{
		key: 'bow-strength',
		bow: 'recurve',
		category: 'measure',
		diagram: 'bowStrength',
		templateKey: 'weight-ratio',
		block: 'weightRatio'
	},
	{
		key: 'limb-alignment',
		bow: 'recurve',
		category: 'setup',
		diagram: 'limbAlignment'
	},
	{ key: 'limb-twist', bow: 'recurve', category: 'setup' },
	{ key: 'rest-position', bow: 'recurve', category: 'setup' },
	{
		key: 'centre-shot',
		bow: 'recurve',
		category: 'setup',
		diagram: 'centreShot'
	},
	{ key: 'sight-alignment', bow: 'recurve', category: 'setup', diagram: 'sightAlignment' },
	{
		key: 'pre-brace-height',
		bow: 'recurve',
		category: 'presetting',
		diagram: 'braceMeasure',
		block: 'braceHeightTable',
		settings: ['braceHeight']
	},
	{
		key: 'pre-tiller',
		bow: 'recurve',
		category: 'presetting',
		diagram: 'tiller',
		settings: ['tillerUpper', 'tillerLower']
	},
	{
		key: 'nocking-point',
		bow: 'recurve',
		category: 'presetting',
		diagram: 'nockingPoint'
	},
	{ key: 'arrow-spine', bow: 'recurve', category: 'arrows', settings: ['arrowSpine', 'pointWeight'] },
	{ key: 'bare-shaft', bow: 'recurve', category: 'arrows', diagram: 'bareShaft', templateKey: 'bare-shaft' },
	{
		key: 'plunger-fine',
		bow: 'recurve',
		category: 'fine',
		diagram: 'plungerLine',
		templateKey: 'walk-back',
		settings: ['plunger']
	},
	{
		key: 'tiller-fine',
		bow: 'recurve',
		category: 'fine',
		diagram: 'tillerDrift',
		settings: ['tillerUpper', 'tillerLower']
	},
	{
		key: 'brace-fine',
		bow: 'recurve',
		category: 'fine',
		diagram: 'braceGroups',
		templateKey: 'brace-height',
		block: 'braceCurveExample',
		settings: ['braceHeight']
	},

	{ key: 'spec-check', bow: 'compound', settings: ['axleToAxle', 'braceHeight'] },
	{ key: 'cam-sync', bow: 'compound' },
	{ key: 'draw-stop', bow: 'compound', settings: ['drawLength'] },
	{ key: 'compound-rest', bow: 'compound', diagram: 'centreShot' },
	{ key: 'd-loop', bow: 'compound', diagram: 'nockingPoint' },
	{ key: 'peep', bow: 'compound', settings: ['peepHeight'] },
	{ key: 'clearance', bow: 'compound' },
	{ key: 'paper-tune', bow: 'compound', diagram: 'paperTear', templateKey: 'paper-tune' },
	{ key: 'walk-back', bow: 'compound', templateKey: 'walk-back' },
	{ key: 'compound-bare-shaft', bow: 'compound', diagram: 'bareShaft', templateKey: 'bare-shaft' },
	{ key: 'third-axis', bow: 'compound' }
];

const EN: Record<string, StepText> = {
	'draw-length': {
		title: 'Draw length',
		why: 'Arrow length and spine both hang off this figure, so it is measured once, properly, before any shaft is cut.',
		steps: [
			'Draw and anchor as you shoot, with a long measuring arrow.',
			'Read the distance from the string groove to the pivot point of the grip, then add 1.75 inches for the standard draw length.',
			'Measure three times on different days: it moves with form.',
			'Keep the shafts long enough to clear the rest at full draw, plus a margin.'
		],
		results: [
			{ observation: 'The figure moves more than half an inch', suggests: 'Form is not settled yet: measure again before cutting' },
			{ observation: 'The point reaches the rest at full draw', suggests: 'The shafts are too short: replace them, this is a safety matter' }
		]
	},
	'bow-strength': {
		title: 'Bow weight',
		why: 'The draw weight decides how fast the arrow leaves and how far it carries. It has to match what you can hold and how you shoot.',
		steps: [
			'Nock an arrow and hook a scale onto your nocking point.',
			'Draw to your full draw length, come down, and read the weight off the scale.',
			'Weigh the bow as you shoot it, stabilisers and all, then work out its mass against that draw weight. Around 70 g/lb is the mark to aim for.'
		],
		results: [
			{ observation: 'The ratio is above 70 g/lb', suggests: 'The bow is heavy for its weight: take mass off the stabilisers, or draw more weight' },
			{ observation: 'The ratio is below 70 g/lb', suggests: 'The bow is light for its weight: add mass to the stabilisers to steady the aim' }
		]
	},
	'limb-alignment': {
		title: 'Limb alignment',
		why: 'Limbs that sit off the bow plane push the arrow sideways on every shot, and no setting further down this list can make up for it.',
		steps: [
			'Fit at least one alignment gauge to each limb, and two where you can: one near the tip and one near the pocket.',
			'The string should pass through the middle of both gauges, and through the middle of the riser. The middle of the riser is where the tiller bolts sit.',
			'Adjust the limbs: follow the maker instructions for moving a limb sideways in its pocket.',
			'Check both limbs again after every change, since moving one limb moves where the string sits on the other.'
		],
		results: [
			{ observation: 'The string sits left of the limb centre', suggests: 'Move that limb right, a little at a time' },
			{ observation: 'The string is centred on one limb only', suggests: 'Align the worse limb first, then recheck both' },
			{ observation: 'No adjustment brings it back to centre', suggests: 'The limb is probably twisted: go to the next step' }
		]
	},
	'limb-twist': {
		title: 'Limb twist',
		why: 'A twisted limb cannot be aligned; it has to be replaced. Shooting one risks an accident and damage to the bow.',
		steps: [
			'Hold the bow with the string horizontal, above the riser.',
			'Wedge two arrows between the string and the tip of each limb, and balance two more where each limb meets the riser. The arrows should sit square to both the string and the limb.',
			'Check that the points and nocks line up. If one does not, that limb is twisted.'
		],
		results: [
			{ observation: 'The limb is twisted', suggests: 'Have the limb changed rather than compensating for it with alignment' },
			{ observation: 'Limbs untwisted but alignment still wrong', suggests: 'The fault is in the pockets: go back to alignment' }
		]
	},
	'rest-position': {
		title: 'Rest position',
		why: 'The rest sets the height of the arrow at the bow, and puts it in the right place against the button.',
		steps: [
			'Sit the rest in its place: the threaded hole on the target side if it takes its own screw, or the button hole behind it if it clamps around the button.',
			'Set the height so the centre of the shaft faces the button.',
			'On some rests the sideways position adjusts as well. Where it does, the arm should stick out past the shaft by about a millimetre.'
		],
		results: [
			{ observation: 'The centre of the arrow is not on the button', suggests: 'Adjust the rest height' },
			{ observation: 'The arrow falls off the rest too easily', suggests: 'Move the rest arm further out' }
		]
	},
	'centre-shot': {
		title: 'Arrow alignment (pressure button)',
		why: 'The button does a static job and a dynamic one. Statically it sets the sideways position of the arrow so it lies in the bow plane; the dynamic setting comes later.',
		steps: [
			'Stand the bow upright and nock an arrow on the rest. A straight stabiliser helps you find the bow plane.',
			'Stand behind the bow and look along the string, in the bow plane. The string should cut the stabiliser in two.',
			'The point sits in the bow plane. It can also sit slightly outside it (left on a right handed bow), depending on taste.',
			'Set the position with the button barrel until the arrow lines up.'
		],
		results: [
			{ observation: 'The point sits too far outside', suggests: 'Wind the button in slightly to bring the point in' },
			{ observation: 'The point sits too far inside', suggests: 'Wind the button out slightly to bring the point out' }
		],
		left: {
			steps: [
				'Stand the bow upright and nock an arrow on the rest. A straight stabiliser helps you find the bow plane.',
				'Stand behind the bow and look along the string, in the bow plane. The string should cut the stabiliser in two.',
				'The point sits in the bow plane. It can also sit slightly outside it (right on a left handed bow), depending on taste.',
				'Set the position with the button barrel until the arrow lines up.'
			]
		}
	},
	'sight-alignment': {
		title: 'Sight alignment',
		why: 'A sight that is not parallel to the bow plane moves your windage as the distance changes, which reads as a tuning fault.',
		steps: [
			'Set the sight so the ring sits on the string line with the bow braced.',
			'Slide the block up and down while watching the ring against the string.',
			'The ring should stay on the string line over the whole travel.',
			'Adjust the extension bar against the sight bar until the ring stays on the string line.'
		],
		results: [
			{ observation: 'The ring drifts sideways as the block comes down', suggests: 'The bar is not parallel to the bow plane: realign it' },
			{ observation: 'A constant offset, but the travel stays parallel', suggests: 'The setting looks right; use the sight ring as your reference for more precision' }
		]
	},
	'pre-brace-height': {
		title: 'Brace height: first pass',
		why: 'Brace height sets how long the string pushes the arrow. It drives the efficiency of the bow, and both the noise and the height of the group follow from it.',
		steps: [
			'Measure from the string to the pivot point of the grip with a bow square.',
			'Start from the limb maker figure, or from a table like the one below.',
			'Twist the string to raise the brace height and untwist to lower it, a few turns at a time, until it falls inside the maker range.',
			'Brace height gets its fine setting after everything else. See the "Brace height" step for the fine pass.'
		],
		results: [
			{ observation: 'A loud, harsh shot', suggests: 'Raise the brace height by a few string turns' },
			{ observation: 'Dead arrows, group dropping', suggests: 'Lower the brace height by a few string turns' },
			{ observation: 'The string slaps the bow arm', suggests: 'Raise the brace height, then check how your bow arm rotates' }
		]
	},
	'pre-tiller': {
		title: 'Tiller: first pass',
		why: 'The tiller balances the work of the two limbs, since the string is not held at its centre. It keeps the arrow leaving level.',
		steps: [
			'Measure from the string to where each limb meets the riser, square to the limb. The difference between the top figure and the bottom one is the tiller.',
			'Start from about +0.6 cm for a recurve with a sight, and about 0 for barebow.',
			'Change it at the limb bolts, keeping the draw weight in mind: tightening adds weight. Take care not to back the limb bolts out too far (see the maker manual).',
			'The tiller gets its fine setting after the other steps. See the "Tiller" step for the fine pass.'
		],
		results: [
			{ observation: 'The tiller is too large', suggests: 'Tighten the top limb bolt' },
			{ observation: 'The tiller is too small', suggests: 'Tighten the bottom limb bolt' }
		]
	},
	'nocking-point': {
		title: 'Nocking point',
		why: 'The nocking point fixes the vertical angle the arrow leaves at. A nocking point set wrong shows up as a vertical spread nobody can shoot out.',
		steps: [
			'Sit a bow square on the rest and clip it to the string.',
			'Put the lower nock set about 0.5 cm above the square to start with. Bow squares usually carry marks for the nocking point.',
			'Nock an arrow and add the second nock set a millimetre above the nock.',
			'Confirm it with a bare shaft at short range (see Prove the setup with bare shafts).'
		],
		results: [
			{ observation: 'Bare shaft high against the group', suggests: 'Raise the nocking point' },
			{ observation: 'Bare shaft low against the group', suggests: 'Lower the nocking point' },
			{ observation: 'The bare shaft porpoises', suggests: 'The point is a long way out: correct it in bigger steps' }
		]
	},
	'arrow-spine': {
		title: 'Choose the shaft: spine and point weight',
		why: 'Everything above sets the bow up; now the arrows have to be matched to it.',
		steps: [
			'Take the draw weight you actually feel on your fingers at your draw length, not the number marked on the limbs.',
			'Read a spine chart with that weight and the shaft length your draw length calls for.',
			'Shoot a bare shaft to confirm the spine you picked (see Prove the setup with bare shafts).',
			'Use point weight to move the dynamic spine: a heavier point makes the shaft act weaker, the same way a higher spine number does.'
		],
		results: [
			{ observation: 'The bare shaft goes right, right handed', suggests: 'A stiffer shaft (a lower spine number), or a lighter point, or a shorter shaft' },
			{ observation: 'The bare shaft goes left, right handed', suggests: 'A weaker shaft (a higher spine number), or a heavier point, or a longer shaft' },
			{ observation: 'Front of centre balance under 10 %', suggests: 'Add point weight: the arrow will hold poorly in wind' }
		],
		left: {
			results: [
				{ observation: 'The bare shaft goes left, left handed', suggests: 'A stiffer shaft (a lower spine number), or a lighter point, or a shorter shaft' },
				{ observation: 'The bare shaft goes right, left handed', suggests: 'A weaker shaft (a higher spine number), or a heavier point, or a longer shaft' },
				{ observation: 'Front of centre balance under 10 %', suggests: 'Add point weight: the arrow will hold poorly in wind' }
			]
		}
	},
	'bare-shaft': {
		title: 'Prove the setup with bare shafts',
		why: 'The last step, and the only one that tests bow and arrow together: an arrow without fletchings shows where the shot really goes.',
		steps: [
			'Shoot three fletched arrows and one bare shaft at the same mark, at 10 to 15 metres.',
			'Note where the bare shaft sits relative to the fletched group.',
			'Fix vertical first at the nocking point, then horizontal with the arrow spine, then with the button.',
			'Change one thing at a time, then shoot another set.'
		],
		results: [
			{ observation: 'Bare shaft high or low', suggests: 'Correct the nocking point before any sideways correction' },
			{ observation: 'The bare shaft goes right, right handed', suggests: 'A stiffer shaft (a lower spine number), or a stiffer button spring' },
			{ observation: 'The bare shaft goes left, right handed', suggests: 'A weaker shaft (a higher spine number), or a softer button spring' }
		],
		left: {
			results: [
				{ observation: 'Bare shaft high or low', suggests: 'Correct the nocking point before any sideways correction' },
				{ observation: 'The bare shaft goes left, left handed', suggests: 'A stiffer shaft (a lower spine number), or a stiffer button spring' },
				{ observation: 'The bare shaft goes right, left handed', suggests: 'A weaker shaft (a higher spine number), or a softer button spring' }
			]
		}
	},

	'plunger-fine': {
		title: 'Plunger pressure',
		why: 'This is the dynamic half of the button: the spring has to absorb the sideways bend the string puts into the arrow, and until it does, your windage moves with the distance.',
		steps: [
			'Make a paper strip about 8 cm wide with an aiming mark near the top: an old 80 cm face folded down, with a 40 cm centre stuck on 15 cm below the top.',
			'Warm up until you group at 15 and at 30 metres, then set the sight for 15 metres and leave it there.',
			'Aim at the same mark at every distance, and shoot one arrow each from 10, 15, 20, 25, 30 and 35 metres.',
			'Read the line the six arrows make down the strip. Change the spring one step, then shoot the test again.'
		],
		results: [
			{ observation: 'A straight vertical line, all six arrows within the strip', suggests: 'The spring pressure is right: leave it alone' },
			{ observation: 'A straight line offset right at the long distances, right handed', suggests: 'The spring is too soft: stiffen it and shoot the test again' },
			{ observation: 'A straight line offset left at the long distances, right handed', suggests: 'The spring is too stiff: soften it and shoot the test again' },
			{ observation: 'The line bellies out to the right, right handed', suggests: 'The button is wound too far out: go back to the centre shot step' },
			{ observation: 'The line bellies out to the left, right handed', suggests: 'The button is wound too far in: go back to the centre shot step' }
		],
		left: {
			results: [
				{ observation: 'A straight vertical line, all six arrows within the strip', suggests: 'The spring pressure is right: leave it alone' },
				{ observation: 'A straight line offset left at the long distances, left handed', suggests: 'The spring is too soft: stiffen it and shoot the test again' },
				{ observation: 'A straight line offset right at the long distances, left handed', suggests: 'The spring is too stiff: soften it and shoot the test again' },
				{ observation: 'The line bellies out to the left, left handed', suggests: 'The button is wound too far out: go back to the centre shot step' },
				{ observation: 'The line bellies out to the right, left handed', suggests: 'The button is wound too far in: go back to the centre shot step' }
			]
		}
	},
	'tiller-fine': {
		title: 'Tiller: fine pass',
		why: 'The rough tiller barely moves the group; this pass moves how the bow behaves under your hand. Set right, the two limbs come back together, the bow hand stays loose and the aim sits still.',
		steps: [
			'Stand at about 18 metres in front of a 40 cm face and aim at the gold.',
			'Draw very slowly, by the most direct path, and watch the sight ring — or the point of the arrow, shooting barebow.',
			'Note whether it climbs or falls as the string comes back.',
			'Correct at the top limb bolt only, a quarter turn at a time, and draw again after each.'
		],
		results: [
			{ observation: 'The ring climbs during the draw', suggests: 'Reduce the tiller: tighten the top limb bolt a quarter turn' },
			{ observation: 'The ring falls during the draw', suggests: 'Increase the tiller: back the top limb bolt off a quarter turn' },
			{ observation: 'The aim sits still from the first movement to the anchor', suggests: 'The tiller suits you: stop here' },
			{ observation: 'The nocking point reads differently afterwards', suggests: 'Expected: a real tiller change moves it. Recheck it before anything else' }
		]
	},
	'brace-fine': {
		title: 'Brace height: fine pass',
		why: 'The last setting on the bow, and the one that pays: at the right brace height the group closes up and climbs at the same time, which is the bow giving the arrow its best push.',
		steps: [
			'Shoot at 50 or 70 metres, on a calm day with good light: this test cannot be read through wind.',
			'Shoot ends of six and note both how tight the group is and how high it sits on the face.',
			'Twist or untwist the string in steps of 0.3 cm, then in steps of 0.1 cm as the group starts to come good. One twist is about 0.5 mm (not linear).',
			'Keep going until the group stops climbing, and take the height just before it drops away.'
		],
		results: [
			{ observation: 'Tight group, sitting as high as it has been', suggests: 'This is the brace height to keep' },
			{ observation: 'A middling group, neither tight nor high', suggests: 'Carry on in the same direction, and turn back if the next end is worse' },
			{ observation: 'A loose group, low on the face', suggests: 'A long way off: go back the other way in bigger steps' },
			{ observation: 'A harsh, loud shot', suggests: 'The brace is low for this bow: the sound alone tells you before the group does' }
		]
	},
	'spec-check': {
		title: 'Check the bow against its spec',
		why: 'A compound is a machine built to numbers: if axle to axle and brace height are off the sheet, something has moved and tuning will not hold.',
		steps: [
			'Measure axle to axle and brace height with the bow at rest.',
			'Compare against the numbers the maker publishes for that model and draw length.',
			'A difference usually means cable or string stretch, or a limb bolt that has moved.'
		],
		results: [
			{ observation: 'Axle to axle long, brace short', suggests: 'Strings and cables have stretched: twist them back to spec' },
			{ observation: 'Both far off with new strings', suggests: 'Check limb bolt turns are equal, then have the bow pressed' }
		]
	},
	'cam-sync': {
		title: 'Cam timing and synchronisation',
		why: 'Cams that arrive at the wall at different moments tip the nock as it leaves, and no rest position can hide it.',
		steps: [
			'Draw the bow on a press or a hooter shooter, or have someone watch while you draw.',
			'Watch both cams reach their stops: they should hit together.',
			'Twist the cable that lags to bring it forward, half a twist at a time.',
			'Recheck draw length and peep rotation afterwards, since both move with cable twists.'
		],
		results: [
			{ observation: 'Top cam hits the stop first', suggests: 'Add twists to the cable that controls the top cam' },
			{ observation: 'Nock travel tips at the shot', suggests: 'Sync the cams before adjusting the rest or the loop' }
		]
	},
	'draw-stop': {
		title: 'Draw length and stops',
		why: 'A compound only shoots the same twice if it stops in the same place twice, which is what the wall is for.',
		steps: [
			'Set the module or post for your draw length.',
			'Draw to the wall and check both stops make contact solidly.',
			'Check the valley feels the same each time: a mushy wall means the stops are not sharing the load.'
		],
		results: [
			{ observation: 'One stop touches first', suggests: 'Sync the cams: this is a timing fault, not a stop fault' },
			{ observation: 'Draw length feels short after twisting cables', suggests: 'Recheck the module setting, then remeasure' }
		]
	},
	'compound-rest': {
		title: 'Rest position and centre shot',
		why: 'On a compound the arrow leaves almost straight, so the rest is where the arrow is aimed rather than where it flexes from.',
		steps: [
			'Set the rest so the arrow sits square to the string, and level with the berger hole centre.',
			'Set the centre shot with a laser or by eye down the string: the shaft slightly outside centre, around 13 mm from the riser on most bows.',
			'Check the launcher blade holds the shaft without contacting the vanes.'
		],
		results: [
			{ observation: 'Paper tear left, right handed', suggests: 'Move the rest right in small steps' },
			{ observation: 'Paper tear right, right handed', suggests: 'Move the rest left in small steps' }
		],
		left: {
			results: [
				{ observation: 'Paper tear right, left handed', suggests: 'Move the rest left in small steps' },
				{ observation: 'Paper tear left, left handed', suggests: 'Move the rest right in small steps' }
			]
		}
	},
	'd-loop': {
		title: 'D-loop and nock point',
		why: 'The loop sets nock height and how the release pulls the string, which together set the vertical angle of the shot.',
		steps: [
			'Tie the loop so the arrow sits square to the string, or a hair nock high.',
			'Keep the loop short enough that it does not change your draw length noticeably.',
			'Serve it tight: a loop that creeps changes the tune from one week to the next.'
		],
		results: [
			{ observation: 'Tail high tear', suggests: 'Lower the nock point, or raise the rest slightly' },
			{ observation: 'Tail low tear', suggests: 'Raise the nock point, or lower the rest slightly' }
		]
	},
	peep: {
		title: 'Peep height and rotation',
		why: 'A peep that does not come round square makes you aim with your neck, and that shows as vertical error on the target.',
		steps: [
			'Set the height so the peep lands in front of your eye at anchor, with your head upright.',
			'Draw with your eyes closed and open them: the peep should be round and centred without hunting for it.',
			'Fix rotation with string twists, or by serving the peep in place.'
		],
		results: [
			{ observation: 'Peep sits low at anchor', suggests: 'Raise it a few millimetres and reshoot before serving' },
			{ observation: 'Peep turns away at full draw', suggests: 'Adjust string twists, then recheck draw length and cam timing' }
		]
	},
	clearance: {
		title: 'Clearance',
		why: 'A vane brushing a cable or a launcher blade throws an arrow that every other test says is tuned.',
		steps: [
			'Dust the vanes and the rest with foot spray or powder.',
			'Shoot a few arrows and look for contact marks on the vanes, the blade and the cable guard.',
			'Rotate the nock a little at a time until nothing touches.'
		],
		results: [
			{ observation: 'Marks along one vane', suggests: 'Rotate the nock a few degrees and shoot again' },
			{ observation: 'Marks on the cable guard', suggests: 'Check cable clearance and rest travel before nock rotation' }
		]
	},
	'paper-tune': {
		title: 'Paper tuning',
		why: 'Paper shows the attitude of the arrow the instant it leaves, which is the fastest way to see what the rest and the loop are doing.',
		steps: [
			'Stand about two metres from a sheet of paper, with a boss well behind it.',
			'Shoot through the paper with a fletched arrow and read the tear.',
			'Fix vertical first, then horizontal, moving the rest or the loop a millimetre at a time.',
			'Move back to four or five metres and check the tear holds.'
		],
		results: [
			{ observation: 'Tail high tear', suggests: 'Lower the nock point or raise the rest' },
			{ observation: 'Tail low tear', suggests: 'Raise the nock point or lower the rest' },
			{ observation: 'Tail left, right handed', suggests: 'Move the rest right, or check clearance and spine' }
		],
		left: {
			results: [
				{ observation: 'Tail high tear', suggests: 'Lower the nock point or raise the rest' },
				{ observation: 'Tail low tear', suggests: 'Raise the nock point or lower the rest' },
				{ observation: 'Tail right, left handed', suggests: 'Move the rest left, or check clearance and spine' }
			]
		}
	},
	'walk-back': {
		title: 'Walk-back tuning',
		why: 'It proves the centre shot across distance rather than at one range, which is where a small windage error becomes a large one.',
		steps: [
			'Set a vertical line on the boss with a mark at the top.',
			'Aim at the top mark from close range and shoot, then repeat from progressively longer distances without moving the sight.',
			'The group centres should fall on the line, not drift sideways as you walk back.'
		],
		results: [
			{ observation: 'Arrows drift left as you walk back, right handed', suggests: 'Move the rest right in very small steps' },
			{ observation: 'Arrows drift right as you walk back, right handed', suggests: 'Move the rest left in very small steps' }
		],
		left: {
			results: [
				{ observation: 'Arrows drift right as you walk back, left handed', suggests: 'Move the rest left in very small steps' },
				{ observation: 'Arrows drift left as you walk back, left handed', suggests: 'Move the rest right in very small steps' }
			]
		}
	},
	'compound-bare-shaft': {
		title: 'Bare shaft check',
		why: 'The last confirmation: with a compound tuned by paper and walk-back, a bare shaft should agree with the fletched group.',
		steps: [
			'Shoot three fletched arrows and one bare shaft at 15 to 20 metres.',
			'Compare the group centres rather than single arrows.',
			'Accept small differences: a compound with good clearance rarely needs more than this.'
		],
		results: [
			{ observation: 'Bare shaft well left or right', suggests: 'Recheck clearance first, then spine, then rest position' },
			{ observation: 'Bare shaft groups with the fletched', suggests: 'The bow is tuned: record the settings as a revision' }
		]
	},
	'third-axis': {
		title: 'Sight levels and third axis',
		why: 'A level that lies makes you cant the bow on sloping ground, and the arrow lands left or right for a reason nothing on the bow explains.',
		steps: [
			'Level the bow in a vice against a plumb line and set the first and second axes.',
			'Tilt the bow up and down as if shooting uphill: the bubble should stay centred.',
			'Adjust the third axis screw until it does.'
		],
		results: [
			{ observation: 'Bubble runs when aiming uphill', suggests: 'Third axis needs adjusting: it will cost you on field courses' },
			{ observation: 'Groups drift sideways at long range only', suggests: 'Check the level and your cant before touching windage' }
		]
	}
};

const FR: Record<string, StepText> = {
	'draw-length': {
		title: 'Allonge',
		why: 'La longueur des tubes et le spine découlent de cette valeur : on la mesure donc une fois, correctement, avant de couper quoi que ce soit.',
		steps: [
			'Armez et ancrez comme vous tirez, avec une flèche de mesure longue.',
			'Relevez la distance de la gorge de corde au point de pivot, puis ajoutez 1,75 pouce pour l’allonge normalisée.',
			'Refaites la mesure trois fois, à des jours différents : elle bouge avec la technique.',
			'Gardez des tubes assez longs pour dépasser le repose-flèche à pleine allonge, avec une marge.'
		],
		results: [
			{ observation: 'La mesure varie de plus d\'un demi pouce', suggests: 'La technique n\'est pas encore stable : remesurez avant de couper' },
			{ observation: 'La pointe arrive au repose-flèche à pleine allonge', suggests: 'Les tubes sont trop courts : changez-les pour des questions de sécurité' }
		]
	},
	'bow-strength': {
		title: 'Force de l\'arc',
		why: 'La force de l\'arc détermine la vitesse et la portée de la flèche. Elle doit être adaptée à votre capacité et à votre technique.',
		steps: [
			'Encochez une flèche sur l\'arc et utilisez un peson acroché à votre point d\'encochage',
			'Tirez l\'arc à votre allonge complète puis revenez et notez la force indiquée par le peson.',
			'Après avoir mesuré le poids de l\'arc avec le peson, vous pouvez calculer le rapport poids/force de l\'arc. Idéalement il est à 70g/lb'
		],
		results: [
			{ observation: 'Le rapport poids/force est trop élevé', suggests: 'Diminuez le poids ou augmentez la force si possible' },
			{ observation: 'Le rapport poids/force est trop bas', suggests: 'Augmentez le poids de l\'arc' }
		]
	},
	'limb-alignment': {
		title: 'Alignement des branches',
		why: "Des branches alignées hors du plan d'arc poussent la flèche de côté à chaque tir. Aucun réglage plus bas dans cette liste ne peut le rattraper.",
		steps: [
			"Posez au moins une cale d'alignement sur chaque branche. Si possible en mettre deux: en haut et en bas de la branche.",
			'La corde doit passer par le centre des deux cales, et par le centre de la poignée. Le centre de la poignée est la position des vis de Tiller.',
			"Ajustez les branches : Suivez les instruction du fabricant pour déplacer horizontalement les branches dans leurs logements.",
			"Revérifiez les deux branches après chaque modification : déplacer une branche change la position de la corde sur l'autre."
		],
		results: [
			{ observation: 'La corde passe à gauche du milieu de la branche', suggests: 'Décalez cette branche vers la droite, petit à petit' },
			{ observation: "La corde n'est centrée que sur une seule branche", suggests: 'Alignez la moins bonne en premier, puis revérifiez les deux' },
			{ observation: 'Aucun réglage ne parvient à la recentrer', suggests: 'La branche est sans doute vrillée : passez à l\'étape suivante' }
		]
	},
	'limb-twist': {
		title: 'Vrillage des branches',
		why: 'Une branche vrillée ne peut pas être alignée. Elle doit être remplacée. Tirer avec une branche vrillée peut provoquer des accidents et endommager l\'arc.',
		steps: [
			"Maintenez l'arc avec la corder à l'horizontale au dessus de la poignée",
			"Ajouter 2 flèches coincées entre la corde et l'extrémité de chaque branche et 2 flèches en équilibre à la jointure de la poignée et de chaque branche. Les flèches doivent être perpendiculaires à la corde et à la branche.",
			"Vérifier que les pointes et enchoches des flèches sont bien alignées. Si l'une ne l'est pas, la branche est vrillée."
		],
		results: [
			{ observation: 'La branche est vrillée', suggests: "Faites changer la branche plutôt que de compenser avec l'alignement" },
			{ observation: 'Branches non vrillées mais alignement toujours faux', suggests: 'Le défaut vient des logements : reprenez l\'alignement' }
		]
	},
	'rest-position': {
		title: 'Position du repose-flèche',
		why: "Le repose flèche permet de règler la hauteur de la flèche au niveau de l'arc. Il permet de le positionner correctement sur le berger.",
		steps: [
			"Posez le repose-flèche à son emplacement : Le trou fileté côté cible si il s'atache avec sa propre vis, ou le trou fileté du berger à l'arière si il s'attache autour du berger.",
			'Réglez la hauteur pour que le centre du tube soit en face du berger.',
			"Sur certains repose-flèches, la position laterale du repose-flèche peut être réglée. Dans ce cas l'aiguille doit legèrement dépaser du tube (~1mm)."
		],
		results: [
			{ observation: "Le centre de la flèche n'est pas sur le berger", suggests: 'Ajuster la hauteur du repose-flèche' },
			{ observation: 'La flèche tombe trop façilement du repose-flèche', suggests: "Déplacer la position laterale du repose-flèche vers l'exterieur" }
		]
	},
	'centre-shot': {
		title: 'Alignement de la flèche (bouton Berger)',
		why: "Le berger a une fonction statique et dynamique. En statique il permet d'ajuster la position laterale de la flèche pour qu'elle soit dans le plan de l'arc. Le reglage dynamique sera fait plus tard.",
		steps: [
			"Fixez l'arc à la verticale et encochez une flèche sur le repose-flèche. Un stabilisation doite peut être ajoutée pour trouver le plan de l'arc.",
			"Placez vous derrière l'arc et regardez le long de la corde dans le plan de l'arc. La stabilisation doit être coupée en deux par la corde.",
			"La pointe se place dans le plan de l'arc. Elle peut aussi être légèrement vers l'extérieur (gauche pour un arc droitier) selon les préférences.",
			'Réglez la position avec le barillet du berger jusqu\'à ce que la flèche soit correctement alignée.'
		],
		results: [
			{ observation: 'La pointe de la flèche est trop vers l\'extérieur', suggests: 'Rentrer légèrement le berger pour rentrer la pointe' },
			{ observation: 'La pointe de la flèche est trop vers l\'intérieur', suggests: 'Sortir légèrement le berger pour sortir la pointe' }
		],
		left: {
			steps: [
				"Fixez l'arc à la verticale et encochez une flèche sur le repose-flèche. Un stabilisation doite peut être ajoutée pour trouver le plan de l'arc.",
				"Placez vous derrière l'arc et regardez le long de la corde dans le plan de l'arc. La stabilisation doit être coupée en deux par la corde.",
				"La pointe se place dans le plan de l'arc. Elle peut aussi être légèrement vers l'extérieur (droite pour un arc gaucher) selon les préférences.",
				'Réglez la position avec le barillet du berger jusqu\'à ce que la flèche soit correctement alignée.'
			]
		}
	},
	'sight-alignment': {
		title: 'Alignement du viseur',
		why: "Un viseur non parallèle au plan d'arc fait varier le lateral avec la distance. Cela peut être vu comme un défaut de réglage.",
		steps: [
			"Placez le viseur pour que l'œilleton se pose sur la ligne de corde, arc bandé.",
			"Faites coulisser le bloc de haut en bas en regardant l'œilleton contre la corde.",
			"L'œilleton doit rester sur la ligne de corde sur toute la hauteur.",
			"Regler la position de la reglette du viseur par rapport à la tige du viseur pour que l'œilleton reste sur la ligne de corde."
		],
		results: [
			{ observation: "L’œilleton part sur le côté quand le bloc descend", suggests: "La reglette n'est pas parallèle au plan d'arc : réalignez-la" },
			{ observation: 'Décalage constant, mais la course reste parallèle', suggests: "Le reglage semble bon, utiliser l'œilleton du viseur comme repère pour plus de précision" }
		]
	},
	'pre-brace-height': {
		title: 'Pré-réglage du Band',
		why: "Le band fixe la durée pendant laquelle la corde pousse la flèche. Il influe sur l'efficacité de l'arc. bruit et la hauteur du groupement en dépendent.",
		steps: [
			"Mesurez la distance de la corde au point de pivot de la poignée avec une équerre.",
			"Partez de la valeur du fabricant de branches, ou d'un tableau comme çi dessous.",
			'Vrillez la corde pour monter le band, dévrillez pour le baisser, quelques tours à la fois, jusqu\'à ce que le band soit dans la plage de réglage du fabricant.',
			'Le band devra être reglé finement après tous les autres réglages. Voir l\'étape "Réglage du band" pour le réglage fin.'
		],
		results: [
			{ observation: 'Tir bruyant et sec', suggests: 'Montez le band de quelques tours de corde' },
			{ observation: 'Flèches sans vie, groupement qui tombe', suggests: 'Baissez le band de quelques tours de corde' },
			{ observation: 'La corde claque le bras d’arc', suggests: 'Montez le band, puis vérifiez la rotation de votre bras d’arc' }
		]
	},
	"pre-tiller": {
		title: 'Pré-réglage du Tiller',
		why: "Le tiller équilibre le travail des deux branches pour l'équilibrer car la corde n'est pas tenue au centre. Il permet de garder la flèche qui part à l'horizontale.",
		steps: [
			"Mesurez de la corde à la jonction de chaque branche avec la poignée, perpendiculairement à la branche. La difference entre celle du haut et celle du bas est le tiller.",
			'Partez d\'environ +0,6 cm pour un classique avec viseur, et d\'environ 0 pour un arc nu.',
			'Modifiez-le aux vis de branches, en gardant la puissance en tête : serrer augmente la force. Attention à ne pas trop désserer les vis de branches (voir le manuel du fabricant).',
			'Le tiller sera réglé finement après les autres réglages. Voir l\'étape "Réglage du Tiller" pour le réglage fin.',
		],
		results: [
			{ observation: 'Le tiller est trop élevé', suggests: 'Serrer la vis de branche du haut' },
			{ observation: 'Le tiller est trop bas', suggests: 'Serrer la vis de branche du bas' }
		]
	},
	"nocking-point": {
		title: 'Détalonage (point d\'encochage)',
		why: "Le point d'encochage fixe l'angle vertical de sortie. Un point d'encochage mal réglé se traduit par un écart vertical que personne ne peut corriger.",
		steps: [
			"Posez une équerre d'arc sur le repose-flèche et clipsez-la sur la corde.",
			'Placez le nock-set inférieur à environ 0,5 cm au-dessus de l\'équerre pour commencer. Il y a souvant des repères sur l\'equerre pour les points d\'encochage.',
			'Enchocher une flèche et ajoutez le second nock-set à 1mm au-dessus de l\'encoche.',
			'Validez à la flèche non empennée à courte distance. (voir Validation aux flèches non-empennées)'
		],
		results: [
			{ observation: 'Flèche non empennée haute par rapport au groupement', suggests: 'Montez le point d\'encochage' },
			{ observation: 'Flèche non empennée basse par rapport au groupement', suggests: 'Descendez le point d\'encochage' },
			{ observation: 'La flèche non empennée marsouine', suggests: 'Le point est loin du compte : corrigez par pas plus francs' }
		]
	},
	'arrow-spine': {
		title: 'Choisir la flèche : spine et poids de pointe',
		why: "Tout ce qui précède règle l'arc ; Il faut maintenant trouver les flèches adaptées.",
		steps: [
			'Prenez la puissance réellement ressentie aux doigts à votre allonge, pas celle marquée sur les branches.',
			'Lisez un tableau de spine avec cette puissance, et la longueur du tube prévue en fonction de votre alonge.',
			'Faites un test de flèche non-empennée pour valider le spine choisi. (voir Validation aux flèches non-empennées)',
			'Vous pouvez jouer sur le poids de pointe pour déplacer le spine dynamique : plus lourd assouplit (spin augmente).'
		],
		results: [
			{ observation: 'La flèche non empennée part à droite pour un droitier', suggests: 'Flèche plus raide (diminuer le spin), ou pointe plus légère, tube plus court' },
			{ observation: 'La flèche non empennée part à gauche pour un droitier', suggests: 'Flèche plus souple (augmenter le spin), ou pointe plus lourde, tube plus long' },
			{ observation: 'FOC inférieur à 10 %', suggests: 'Alourdissez la pointe : la flèche se tiendra mal dans le vent' }
		],
		left: {
			results: [
				{ observation: 'La flèche non empennée part à gauche pour un gaucher', suggests: 'Flèche plus raide (diminuer le spin), ou pointe plus légère, tube plus court' },
				{ observation: 'La flèche non empennée part à droite pour un gaucher', suggests: 'Flèche plus souple (augmenter le spin), ou pointe plus lourde, tube plus long' },
				{ observation: 'FOC inférieur à 10 %', suggests: 'Alourdissez la pointe : la flèche se tiendra mal dans le vent' }
			]
		}
	},
	'bare-shaft': {
		title: "Validation aux flèches non-empennées",
		why: "La dernière étape, et la seule qui éprouve l'arc et la flèche ensemble : une flèche sans plumes (non-empennée) montre la direction réelle du tir.",
		steps: [
			'Tirez trois flèches empennées et une non empennée sur le même point, à 10 ou 15 mètres.',
			'Notez la position du tube nu par rapport au groupement empenné.',
			'Corrigez d\'abord le vertical au point d\'encochage, puis le latéral au spin de flèche, puis le berger.',
			'Ne changez qu\'une chose à la fois, puis tirez une nouvelle série.'
		],
		results: [
			{ observation: 'Flèche non empennée haute ou basse', suggests: 'Corrigez le détalonage avant toute correction latérale' },
			{ observation: 'La flèche non empennée part à droite pour un droitier', suggests: 'Flèche plus raide (diminuer le spin), ou durcir le ressort du berger button' },
			{ observation: 'La flèche non empennée part à gauche pour un droitier', suggests: 'Flèche plus souple (augmenter le spin), ou assouplir le ressort du berger button' },
		],
		left: {
			results: [
				{ observation: 'Flèche non empennée haute ou basse', suggests: 'Corrigez le détalonage avant toute correction latérale' },
				{ observation: 'La flèche non empennée part à gauche pour un gaucher', suggests: 'Flèche plus raide (diminuer le spin), ou durcir le ressort du berger button' },
				{ observation: 'La flèche non empennée part à droite pour un gaucher', suggests: 'Flèche plus souple (augmenter le spin), ou assouplir le ressort du berger button' },
			]
		}
	},

	'plunger-fine': {
		title: 'Réglage dynamique du berger',
		why: "C'est la fonction dynamique du bouton : le ressort doit compenser la déformation horizontale de la flèche (fishtailing). Tant qu'il ne le fait pas, le latéral change avec la distance.",
		steps: [
			"Fabriquez une bande de papier d'environ 8 cm de large avec une zone de visée en haut : un vieux blason de 80 cm plié, avec un centre de 40 cm collé à 15 cm du haut.",
			'Échauffez-vous jusqu\'à grouper à 15 m et à 30 m, puis réglez le viseur pour 15 m et ne le touchez plus.',
			'Visez toujours le même point, et tirez une flèche à 10, 15, 20, 25, 30 et 35 m.',
			'Lisez la ligne formée par les six impacts. Modifiez le ressort d\'un cran, puis refaites le test.'
		],
		results: [
			{ observation: 'Une droite verticale, les six flèches dans la largeur de la bande', suggests: 'La pression du berger est correcte : ne touchez plus à rien' },
			{ observation: 'Une droite décalée à droite aux longues distances, pour un droitier', suggests: 'Pression trop faible : durcissez le ressort et refaites le test' },
			{ observation: 'Une droite décalée à gauche aux longues distances, pour un droitier', suggests: 'Pression trop forte : assouplissez le ressort et refaites le test' },
			{ observation: 'La ligne forme un ventre à droite, pour un droitier', suggests: 'Le berger est trop sorti : reprenez l\'alignement de la flèche' },
			{ observation: 'La ligne forme un ventre à gauche, pour un droitier', suggests: 'Le berger est trop rentré : reprenez l\'alignement de la flèche' }
		],
		left: {
			results: [
				{ observation: 'Une droite verticale, les six flèches dans la largeur de la bande', suggests: 'La pression du berger est correcte : ne touchez plus à rien' },
				{ observation: 'Une droite décalée à gauche aux longues distances, pour un gaucher', suggests: 'Pression trop faible : durcissez le ressort et refaites le test' },
				{ observation: 'Une droite décalée à droite aux longues distances, pour un gaucher', suggests: 'Pression trop forte : assouplissez le ressort et refaites le test' },
				{ observation: 'La ligne forme un ventre à gauche, pour un gaucher', suggests: 'Le berger est trop sorti : reprenez l\'alignement de la flèche' },
				{ observation: 'La ligne forme un ventre à droite, pour un gaucher', suggests: 'Le berger est trop rentré : reprenez l\'alignement de la flèche' }
			]
		}
	},
	'tiller-fine': {
		title: 'Réglage fin du Tiller',
		why: "Le pré-réglage joue peu sur le groupement, mais beaucoup sur la tenue de l'arc. Un tiller adapté à votre tonicité donne une main d'arc relâchée et une visée très stable.",
		steps: [
			'À environ 18 m, face à un blason de 40 cm, visez le jaune.',
			"Tractez très lentement, par le chemin le plus direct, et observez l'œilleton du viseur — ou la pointe de la flèche en arc nu.",
			'Notez si la visée monte ou descend pendant la traction.',
			'Corrigez à la vis de la branche du haut uniquement, un quart de tour à la fois, puis retractez.'
		],
		results: [
			{ observation: "L'œilleton monte pendant la traction", suggests: 'Diminuez le tiller : vissez la branche du haut d\'un quart de tour' },
			{ observation: "L'œilleton descend pendant la traction", suggests: 'Augmentez le tiller : dévissez la branche du haut d\'un quart de tour' },
			{ observation: 'La visée reste stable du début de la traction aux contacts visage', suggests: 'Le tiller vous convient : arrêtez le test' },
			{ observation: "Le détalonnage a changé après le réglage", suggests: 'C\'est normal : une modification franche du tiller le déplace. Revérifiez-le avant toute autre chose' }
		]
	},
	'brace-fine': {
		title: 'Réglage fin du band',
		why: "Le dernier réglage de l'arc, et celui qui paie : au bon band, le groupement se resserre et monte en même temps, signe que l'arc pousse la flèche au mieux.",
		steps: [
			'Tirez à 50 ou 70 m, par temps calme et bien éclairé : ce test ne se lit pas dans le vent.',
			'Tirez des volées de six et notez à la fois le groupement (G) et la hauteur en cible (H).',
			'Vrillez ou dévrillez la corde par sauts de 0,3 cm, puis de 0,1 cm quand le groupement s\'améliore. Un tour de vrille vaut environ 0,5 mm (ce n\'est pas linéaire).',
			'Continuez jusqu\'à ce que la hauteur cesse de monter, et gardez le band juste avant qu\'elle redescende.'
		],
		results: [
			{ observation: 'Volée très groupée et le plus haut possible en cible', suggests: 'C\'est le band à conserver' },
			{ observation: 'Situation intermédiaire : ni groupée ni haute', suggests: 'Poursuivez dans le même sens, et repartez en arrière si la volée suivante est moins bonne' },
			{ observation: 'Volée dispersée et basse en cible', suggests: 'Situation extrême : revenez en arrière par sauts plus francs' },
			{ observation: 'Le départ est sec et bruyant', suggests: 'Le band est faible pour cet arc : le son le dit avant le groupement' }
		]
	},
	'spec-check': {
		title: 'Vérifier l’arc face à sa fiche',
		why: "Un poulies est une mécanique construite sur des cotes : si l'entraxe et le band s'en écartent, quelque chose a bougé et le réglage ne tiendra pas.",
		steps: [
			'Mesurez l’entraxe et le band, arc au repos.',
			'Comparez aux valeurs publiées par le fabricant pour ce modèle et cette allonge.',
			'Un écart vient le plus souvent de câbles ou de corde qui se sont allongés, ou d’une vis de branche qui a bougé.'
		],
		results: [
			{ observation: 'Entraxe long et band court', suggests: 'Corde et câbles ont fatigué : revrillez-les à la cote' },
			{ observation: 'Tout est faux avec une corde neuve', suggests: 'Vérifiez l’égalité des vis de branches, puis faites presser l’arc' }
		]
	},
	'cam-sync': {
		title: 'Synchronisation des cames',
		why: "Des cames qui n'arrivent pas au mur ensemble font basculer l'encoche à la sortie, et aucun repose-flèche ne rattrape cela.",
		steps: [
			'Armez sur presse ou sur banc, ou faites-vous regarder pendant l’armement.',
			'Regardez les deux cames atteindre leurs butées : elles doivent arriver ensemble.',
			'Vrillez le câble en retard pour l’avancer, un demi-tour à la fois.',
			'Revérifiez ensuite allonge et rotation du viseur de corde : les deux bougent avec les vrillages.'
		],
		results: [
			{ observation: 'La came du haut arrive la première', suggests: 'Ajoutez des tours au câble qui commande la came du haut' },
			{ observation: 'L’encoche bascule au départ', suggests: 'Synchronisez avant de toucher au repose-flèche ou au D-loop' }
		]
	},
	'draw-stop': {
		title: 'Allonge et butées',
		why: "Un poulies ne tire deux fois pareil que s'il s'arrête deux fois au même endroit : c'est le rôle du mur.",
		steps: [
			'Réglez le module ou la butée à votre allonge.',
			'Armez jusqu’au mur et vérifiez que les deux butées portent franchement.',
			'La vallée doit être identique à chaque armement : un mur mou signale des butées qui ne partagent pas la charge.'
		],
		results: [
			{ observation: 'Une butée touche en premier', suggests: 'Synchronisez les cames : le défaut vient du calage, pas des butées' },
			{ observation: 'Allonge trop courte après vrillage des câbles', suggests: 'Revoyez le réglage du module, puis remesurez' }
		]
	},
	'compound-rest': {
		title: 'Repose-flèche et alignement',
		why: "Sur un poulies la flèche part presque droite : le repose-flèche est donc une direction de visée plus qu'un point de flexion.",
		steps: [
			'Placez le repose-flèche pour que la flèche soit d’équerre à la corde, au centre du trou de berger.',
			'Réglez l’alignement au laser ou à l’œil : tube légèrement à l’extérieur du centre, environ 13 mm de la poignée sur la plupart des arcs.',
			'Vérifiez que la lame tient le tube sans toucher les plumes.'
		],
		results: [
			{ observation: 'Déchirure papier à gauche, droitier', suggests: 'Décalez le repose-flèche vers la droite, petit à petit' },
			{ observation: 'Déchirure papier à droite, droitier', suggests: 'Décalez le repose-flèche vers la gauche, petit à petit' }
		],
		left: {
			results: [
				{ observation: 'Déchirure papier à droite, gaucher', suggests: 'Décalez le repose-flèche vers la gauche, petit à petit' },
				{ observation: 'Déchirure papier à gauche, gaucher', suggests: 'Décalez le repose-flèche vers la droite, petit à petit' }
			]
		}
	},
	'd-loop': {
		title: 'D-loop et encochage',
		why: "Le D-loop fixe la hauteur d'encochage et la façon dont le décocheur tire la corde : ensemble, elles donnent l'angle vertical du tir.",
		steps: [
			'Nouez le D-loop pour que la flèche soit d’équerre à la corde, ou un cheveu au-dessus.',
			'Gardez-le assez court pour ne pas changer sensiblement votre allonge.',
			'Serrez-le fermement : un D-loop qui glisse change le réglage d’une semaine à l’autre.'
		],
		results: [
			{ observation: 'Déchirure queue haute', suggests: 'Baissez le point d’encochage, ou remontez légèrement le repose-flèche' },
			{ observation: 'Déchirure queue basse', suggests: 'Montez le point d’encochage, ou baissez légèrement le repose-flèche' }
		]
	},
	peep: {
		title: 'Viseur de corde : hauteur et rotation',
		why: "Un viseur de corde qui ne revient pas droit vous fait viser avec la nuque, et cela se lit en dispersion verticale sur la cible.",
		steps: [
			'Réglez la hauteur pour que le viseur tombe devant l’œil à l’ancrage, tête droite.',
			'Armez les yeux fermés puis ouvrez-les : le viseur doit être rond et centré sans le chercher.',
			'Corrigez la rotation par vrillage de corde, ou en le tranche-filant en place.'
		],
		results: [
			{ observation: 'Viseur trop bas à l’ancrage', suggests: 'Montez-le de quelques millimètres et tirez encore avant de le tranche-filer' },
			{ observation: 'Le viseur n’est pas droit à pleine allonge', suggests: 'Ajustez les vrillages, puis revérifiez allonge et synchronisation' }
		]
	},
	clearance: {
		title: 'Dégagement',
		why: "Une plume qui frôle un câble ou une lame gâche une flèche que tous les autres tests déclarent réglée.",
		steps: [
			'Poudrez les plumes et le repose-flèche.',
			'Tirez quelques flèches et cherchez les traces sur les plumes, la lame et le garde-câble.',
			'Tournez l’encoche par petits angles jusqu’à ce que plus rien ne touche.'
		],
		results: [
			{ observation: 'Traces le long d’une plume', suggests: 'Tournez l’encoche de quelques degrés et tirez encore' },
			{ observation: 'Traces sur le garde-câble', suggests: 'Vérifiez le dégagement des câbles et la course du repose-flèche' }
		]
	},
	'paper-tune': {
		title: 'Réglage au papier',
		why: "Le papier montre l'attitude de la flèche à l'instant où elle part : c'est le moyen le plus rapide de voir ce que font le repose-flèche et le D-loop.",
		steps: [
			'Placez-vous à environ deux mètres d’une feuille, avec une cible bien derrière.',
			'Tirez à travers le papier avec une flèche empennée et lisez la déchirure.',
			'Corrigez le vertical d’abord, puis le latéral, au millimètre.',
			'Reculez à quatre ou cinq mètres et vérifiez que la déchirure tient.'
		],
		results: [
			{ observation: 'Déchirure queue haute', suggests: 'Baissez le point d’encochage ou montez le repose-flèche' },
			{ observation: 'Déchirure queue basse', suggests: 'Montez le point d’encochage ou baissez le repose-flèche' },
			{ observation: 'Déchirure à gauche, droitier', suggests: 'Décalez le repose-flèche à droite, ou vérifiez dégagement et spine' }
		],
		left: {
			results: [
				{ observation: 'Déchirure queue haute', suggests: 'Baissez le point d’encochage ou montez le repose-flèche' },
				{ observation: 'Déchirure queue basse', suggests: 'Montez le point d’encochage ou baissez le repose-flèche' },
				{ observation: 'Déchirure à droite, gaucher', suggests: 'Décalez le repose-flèche à gauche, ou vérifiez dégagement et spine' }
			]
		}
	},
	'walk-back': {
		title: 'Réglage en reculant',
		why: "Il valide l'alignement sur plusieurs distances plutôt qu'à une seule, là où une petite erreur de dérive en devient une grande.",
		steps: [
			'Tracez une verticale sur la cible avec un repère en haut.',
			'Visez le repère de près et tirez, puis recommencez de plus en plus loin sans toucher au viseur.',
			'Les centres de groupement doivent rester sur la ligne, sans dériver.'
		],
		results: [
			{ observation: 'Dérive à gauche en reculant, droitier', suggests: 'Décalez le repose-flèche vers la droite, très légèrement' },
			{ observation: 'Dérive à droite en reculant, droitier', suggests: 'Décalez le repose-flèche vers la gauche, très légèrement' }
		],
		left: {
			results: [
				{ observation: 'Dérive à droite en reculant, gaucher', suggests: 'Décalez le repose-flèche vers la gauche, très légèrement' },
				{ observation: 'Dérive à gauche en reculant, gaucher', suggests: 'Décalez le repose-flèche vers la droite, très légèrement' }
			]
		}
	},
	'compound-bare-shaft': {
		title: 'Contrôle à la flèche non empennée',
		why: "La confirmation finale : sur un poulies réglé au papier et en reculant, le tube nu doit rejoindre le groupement empenné.",
		steps: [
			'Tirez trois flèches empennées et une non empennée à 15 ou 20 mètres.',
			'Comparez les centres de groupement plutôt que des flèches isolées.',
			'Acceptez de petits écarts : un poulies au dégagement propre ne demande guère plus.'
		],
		results: [
			{ observation: 'Flèche non empennée franchement à gauche ou à droite', suggests: 'Vérifiez le dégagement, puis le spine, puis le repose-flèche' },
			{ observation: 'Flèche non empennée dans le groupement', suggests: 'L’arc est réglé : enregistrez les valeurs comme révision' }
		]
	},
	'third-axis': {
		title: 'Niveaux du viseur et troisième axe',
		why: "Un niveau qui ment vous fait incliner l'arc en terrain pentu, et la flèche part à gauche ou à droite sans que rien sur l'arc ne l'explique.",
		steps: [
			'Mettez l’arc d’aplomb en étau contre un fil à plomb et réglez les premier et deuxième axes.',
			'Inclinez l’arc vers le haut et vers le bas comme pour un tir en pente : la bulle doit rester centrée.',
			'Ajustez la vis de troisième axe jusqu’à ce que ce soit le cas.'
		],
		results: [
			{ observation: 'La bulle part sur le côté quand vous visez vers le haut', suggests: 'Le troisième axe est à reprendre : il coûte cher en parcours' },
			{ observation: 'Dérive latérale seulement aux longues distances', suggests: 'Vérifiez le niveau et votre inclinaison avant de toucher à la dérive' }
		]
	}
};

const TEXT: Record<Locale, Record<string, StepText>> = { en: EN, fr: FR };

export function stepsFor(bow: GuideBow): GuideStep[] {
	return GUIDE_STEPS.filter((step) => step.bow === bow);
}

/**
 * The steps of a bow cut into the headings they read under, with the numbering carried across the
 * whole list: the number is the order the job is done in, and a heading does not restart it.
 */
export function groupsFor(bow: GuideBow): { category?: GuideCategory; steps: GuideStep[] }[] {
	const groups: { category?: GuideCategory; steps: GuideStep[] }[] = [];
	for (const step of stepsFor(bow)) {
		const last = groups.at(-1);
		if (last && last.category === step.category) last.steps.push(step);
		else groups.push({ category: step.category, steps: [step] });
	}
	return groups;
}

/** English is the fallback: a step with no translation yet is better read than missing. */
export function stepText(key: string, locale: Locale, hand: 'right' | 'left' = 'right'): StepText {
	const text = TEXT[locale]?.[key] ?? EN[key];
	if (hand === 'right' || !text?.left) return text;
	return { ...text, steps: text.left.steps ?? text.steps, results: text.left.results ?? text.results };
}
