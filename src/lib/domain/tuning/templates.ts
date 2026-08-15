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
			'Measure from the string to the pivot point of the grip and record it as a height.',
			'Shoot an end or two at that height and plot where every arrow landed.',
			'Twist or untwist the string a few turns, measure again, and add the new height.',
			'Read the curves: the height that groups tightest is the one to keep.'
		],
		interpretation: [
			{ observation: 'The group tightens as the height rises', suggests: 'Keep going up a few turns at a time, until it stops improving' },
			{ observation: 'Loud shot, harsh feel', suggests: 'Raise brace height a few string turns' },
			{ observation: 'Sluggish arrows, dropping low', suggests: 'Lower brace height a few string turns' }
		],
		settings: ['braceHeight']
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
		key: 'weight-ratio',
		name: 'Mass to draw weight',
		appliesTo: ['recurve', 'compound', 'barebow', 'longbow'],
		steps: [
			'Weigh the bow as you shoot it, stabilisers and all.',
			'Draw to full draw on a scale hooked to the nocking point and read the weight.',
			'Work out the mass the bow carries for each pound it draws.'
		],
		interpretation: [
			{ observation: 'Above 70 g/lb', suggests: 'Heavy for its weight: take mass off the stabilisers, or draw more weight' },
			{ observation: 'Below 70 g/lb', suggests: 'Light for its weight: add mass to the stabilisers to steady the aim' }
		],
		settings: ['drawWeight']
	}
];

export function templatesForBowType(type: BowType): TuningTemplate[] {
	return TUNING_TEMPLATES.filter((t) => t.appliesTo.includes(type));
}

export function getTemplate(key: string): TuningTemplate | undefined {
	return TUNING_TEMPLATES.find((t) => t.key === key);
}
