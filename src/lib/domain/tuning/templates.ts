export type BowType = 'recurve' | 'compound' | 'barebow' | 'longbow';

export const BOW_TYPES: BowType[] = ['recurve', 'compound', 'barebow', 'longbow'];

export interface TuningTemplate {
	key: string;
	name: string;
	appliesTo: BowType[];
	steps: string[];
	/** Observation mapped to the adjustment it suggests, shown after the archer records a result. */
	interpretation: { observation: string; suggests: string }[];
	/**
	 * The bow settings this procedure can end up moving, by schema key. A test that offers the whole
	 * bow invites an unrelated field to be changed by accident, and the revision it writes then
	 * blames this test for it. Empty means the procedure moves nothing the bow's record holds.
	 */
	settings: string[];
}

/**
 * Built-in tuning procedures. Kept deliberately small: user contributed activities turn this into a
 * small CMS and deserve their own design pass, see doc/architecture.md.
 */
export const TUNING_TEMPLATES: TuningTemplate[] = [
	{
		key: 'brace-height',
		name: 'Brace height',
		appliesTo: ['recurve', 'barebow', 'longbow'],
		steps: [
			'Measure from the string to the pivot point of the grip.',
			'Shoot a group and note its consistency and the noise of the shot.',
			'Twist or untwist the string a few turns to change the height, then repeat.'
		],
		interpretation: [
			{ observation: 'Loud shot, harsh feel', suggests: 'Raise brace height a few string turns' },
			{ observation: 'Sluggish arrows, dropping low', suggests: 'Lower brace height a few string turns' }
		],
		settings: ['braceHeight']
	},
	{
		key: 'nocking-point',
		name: 'Nocking point height',
		appliesTo: ['recurve', 'barebow', 'longbow', 'compound'],
		steps: [
			'Shoot a bare shaft alongside two fletched arrows at short distance.',
			'Compare the vertical position of the bare shaft to the fletched group.'
		],
		interpretation: [
			{ observation: 'Bare shaft hits high', suggests: 'Move the nocking point up' },
			{ observation: 'Bare shaft hits low', suggests: 'Move the nocking point down' }
		],
		settings: ['nockingPoint']
	},
	{
		key: 'bare-shaft',
		name: 'Bare shaft tuning',
		appliesTo: ['recurve', 'barebow', 'longbow'],
		steps: [
			'Shoot three fletched arrows and one bare shaft at the same aiming point.',
			'Record where the bare shaft lands relative to the fletched group.',
			'Adjust one variable at a time, then reshoot.'
		],
		interpretation: [
			{ observation: 'Bare shaft left of the group (right handed)', suggests: 'Arrow reacting stiff: soften the plunger or increase point weight' },
			{ observation: 'Bare shaft right of the group (right handed)', suggests: 'Arrow reacting weak: stiffen the plunger or reduce point weight' }
		],
		settings: ['nockingPoint', 'centreShot', 'plunger', 'arrowSpine', 'pointWeight']
	},
	{
		key: 'paper-tune',
		name: 'Paper tuning',
		appliesTo: ['recurve', 'compound', 'barebow'],
		steps: [
			'Set a paper frame roughly two metres in front of the target.',
			'Shoot through the paper from about two metres and record the tear.',
			'Adjust one variable, then shoot another tear.'
		],
		interpretation: [
			{ observation: 'Tail high tear', suggests: 'Lower the nocking point' },
			{ observation: 'Tail low tear', suggests: 'Raise the nocking point' },
			{ observation: 'Tail left tear (right handed)', suggests: 'Arrow reacting stiff' },
			{ observation: 'Tail right tear (right handed)', suggests: 'Arrow reacting weak' }
		],
		settings: ['nockingPoint', 'centreShot', 'plunger']
	},
	{
		key: 'walk-back',
		name: 'Walk-back tuning',
		appliesTo: ['recurve', 'compound', 'barebow'],
		steps: [
			'Aim at a single mark using the sight setting for the closest distance.',
			'Shoot one arrow each from progressively longer distances without changing the sight.',
			'Read the vertical line the arrows form.'
		],
		interpretation: [
			{ observation: 'Line drifts left as distance grows (right handed)', suggests: 'Move the plunger or rest out' },
			{ observation: 'Line drifts right as distance grows (right handed)', suggests: 'Move the plunger or rest in' }
		],
		settings: ['centreShot', 'plunger']
	},
	{
		key: 'crawl-calibration',
		name: 'Crawl calibration',
		appliesTo: ['barebow'],
		steps: [
			'Shoot a group at each distance you compete at.',
			'Record the string crawl that centres the group vertically.',
			'Repeat until the marks are repeatable across sessions.'
		],
		interpretation: [
			{ observation: 'Group high at this distance', suggests: 'Increase the crawl' },
			{ observation: 'Group low at this distance', suggests: 'Reduce the crawl' }
		],
		settings: ['crawlTable', 'anchor']
	},
	{
		key: 'limb-alignment',
		name: 'Limb alignment',
		appliesTo: ['recurve', 'barebow', 'longbow'],
		steps: [
			'Brace the bow and sight down the string from behind, bow upright.',
			'Clip an alignment gauge to each limb: a limb tapers, so its edges read as centred long before its middle is.',
			'The string should split both gauges and pass through the middle of the grip: the bow lies in one plane, and the string is that plane.',
			'Move the limb pockets a small step at a time, rechecking both limbs after each.'
		],
		interpretation: [
			{ observation: 'String left of the limb centre', suggests: 'Move that limb right, a small turn at a time' },
			{ observation: 'Cannot be brought in', suggests: 'Suspect a twisted limb rather than a pocket setting' }
		],
		settings: []
	},
	{
		key: 'rest-position',
		name: 'Rest position',
		appliesTo: ['recurve', 'barebow', 'longbow', 'compound'],
		steps: [
			'Sit the arrow over the pivot point of the grip.',
			'Set the arm height so the shaft meets the centre of the pressure button.',
			'Shoot a group and check nothing marks the rest.'
		],
		interpretation: [
			{ observation: 'Shaft above the button centre', suggests: 'Lower the rest arm' },
			{ observation: 'Marks on the rest arm', suggests: 'Reduce the overhang or rotate the nock' }
		],
		settings: ['nockingPoint', 'centreShot']
	},
	{
		key: 'centre-shot',
		name: 'Centre shot',
		appliesTo: ['recurve', 'barebow', 'compound'],
		steps: [
			'Sight down the string with an arrow nocked and the bow upright.',
			'Set the shaft slightly inside the string line, a millimetre or two for a right handed bow.',
			'Shoot a bare shaft or a paper tear to confirm.'
		],
		interpretation: [
			{ observation: 'Bare shaft left of the group, right handed', suggests: 'Reading stiff: soften the button or wind it out' },
			{ observation: 'Bare shaft right of the group, right handed', suggests: 'Reading weak: stiffen the button or wind it in' }
		],
		settings: ['centreShot', 'plunger']
	},
	{
		key: 'tiller',
		name: 'Tiller',
		appliesTo: ['recurve', 'barebow', 'longbow'],
		steps: [
			'Measure string to limb at both pockets, square to the limb.',
			'Subtract the lower from the upper and record the difference.',
			'Adjust with the limb bolts, then reshoot a bare shaft group.'
		],
		interpretation: [
			{ observation: 'Bare shaft consistently high', suggests: 'Increase tiller slightly, or lower the nocking point first' },
			{ observation: 'Bare shaft consistently low', suggests: 'Reduce tiller slightly, or raise the nocking point first' }
		],
		settings: ['tillerUpper', 'tillerLower', 'nockingPoint']
	},
	{
		key: 'draw-stop',
		name: 'Draw stops',
		appliesTo: ['compound'],
		steps: [
			'Draw to the wall and feel both stops make contact.',
			'Have someone watch which stop lands first.',
			'Correct with cable twists rather than with the stops themselves.'
		],
		interpretation: [
			{ observation: 'One stop touches first', suggests: 'Sync the cams: this is a timing fault' },
			{ observation: 'Mushy wall', suggests: 'The stops are not sharing the load: recheck timing and draw length' }
		],
		settings: ['drawStop', 'drawLength']
	},
	{
		key: 'peep-alignment',
		name: 'Peep alignment',
		appliesTo: ['compound'],
		steps: [
			'Draw with the eyes closed, then open them at anchor.',
			'Note where the peep sits and whether it comes round square.',
			'Correct height by moving it, rotation by string twists.'
		],
		interpretation: [
			{ observation: 'Peep low at anchor', suggests: 'Raise it a few millimetres and shoot again before serving' },
			{ observation: 'Peep turns away', suggests: 'Adjust string twists, then recheck draw length and timing' }
		],
		settings: ['peepHeight']
	},
	{
		key: 'clearance',
		name: 'Clearance check',
		appliesTo: ['recurve', 'barebow', 'longbow', 'compound'],
		steps: [
			'Dust the vanes and the rest with powder or foot spray.',
			'Shoot a few arrows and look for contact marks.',
			'Rotate the nock a little at a time until nothing touches.'
		],
		interpretation: [
			{ observation: 'Marks along one vane', suggests: 'Rotate the nock a few degrees and shoot again' },
			{ observation: 'Marks on the riser or cable guard', suggests: 'Check rest travel and nocking point before nock rotation' }
		],
		settings: ['plunger']
	},
	{
		key: 'cam-timing',
		name: 'Cam timing',
		appliesTo: ['compound'],
		steps: [
			'Draw the bow on a press or with a draw board and watch both cams reach the stops.',
			'Note which cam arrives first.',
			'Add or remove twists in the appropriate buss cable, then recheck.'
		],
		interpretation: [
			{ observation: 'Top cam hits the stop first', suggests: 'Add twists to the cable controlling the top cam' },
			{ observation: 'Bottom cam hits the stop first', suggests: 'Add twists to the cable controlling the bottom cam' }
		],
		settings: ['camTiming', 'drawStop']
	}
];

export function templatesForBowType(type: BowType): TuningTemplate[] {
	return TUNING_TEMPLATES.filter((t) => t.appliesTo.includes(type));
}

export function getTemplate(key: string): TuningTemplate | undefined {
	return TUNING_TEMPLATES.find((t) => t.key === key);
}
