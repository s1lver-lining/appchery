export type BowType = 'recurve' | 'compound' | 'barebow' | 'longbow';

export const BOW_TYPES: BowType[] = ['recurve', 'compound', 'barebow', 'longbow'];

export interface TuningTemplate {
	key: string;
	name: string;
	appliesTo: BowType[];
	steps: string[];
	/** Observation mapped to the adjustment it suggests, shown after the archer records a result. */
	interpretation: { observation: string; suggests: string }[];
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
		]
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
		]
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
		]
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
		]
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
		]
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
		]
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
		]
	}
];

export function templatesForBowType(type: BowType): TuningTemplate[] {
	return TUNING_TEMPLATES.filter((t) => t.appliesTo.includes(type));
}

export function getTemplate(key: string): TuningTemplate | undefined {
	return TUNING_TEMPLATES.find((t) => t.key === key);
}
