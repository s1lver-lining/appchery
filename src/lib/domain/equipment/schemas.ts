import type { BowType } from '../tuning/templates';

/**
 * Setting fields per bow type. Adding a bow type means adding a schema here, never touching a form,
 * because the schema drives rendering, validation, and the revision diff alike.
 */
export type FieldKind = 'lengthMm' | 'number' | 'text' | 'select';

export interface SettingField {
	key: string;
	label: string;
	kind: FieldKind;
	/** Shown beside the input. Length fields store mm and display inches, see doc/architecture.md. */
	unit?: string;
	step?: number;
	options?: string[];
	group: string;
}

const ARROW_FIELDS: SettingField[] = [
	{ key: 'arrowSpine', label: 'Arrow spine', kind: 'number', group: 'Arrows' },
	{ key: 'arrowLength', label: 'Arrow length', kind: 'lengthMm', unit: 'in', group: 'Arrows' },
	{ key: 'pointWeight', label: 'Point weight', kind: 'number', unit: 'gr', group: 'Arrows' },
	{ key: 'fletching', label: 'Fletching', kind: 'text', group: 'Arrows' },
	{ key: 'nock', label: 'Nock', kind: 'text', group: 'Arrows' }
];

const STRING_FIELDS: SettingField[] = [
	{ key: 'stringMaterial', label: 'String material', kind: 'text', group: 'String' },
	{ key: 'stringStrands', label: 'Strands', kind: 'number', group: 'String' },
	{ key: 'nockingPoint', label: 'Nocking point height', kind: 'lengthMm', unit: 'in', group: 'String' }
];

const RECURVE: SettingField[] = [
	{ key: 'braceHeight', label: 'Brace height', kind: 'lengthMm', unit: 'in', group: 'Bow' },
	{ key: 'drawWeight', label: 'Draw weight on fingers', kind: 'number', unit: 'lb', group: 'Bow' },
	{ key: 'limbSize', label: 'Limb size', kind: 'select', options: ['Short', 'Medium', 'Long'], group: 'Bow' },
	{ key: 'tillerUpper', label: 'Tiller upper', kind: 'lengthMm', unit: 'in', group: 'Bow' },
	{ key: 'tillerLower', label: 'Tiller lower', kind: 'lengthMm', unit: 'in', group: 'Bow' },
	{ key: 'plungerTension', label: 'Plunger tension', kind: 'text', group: 'Rest' },
	{ key: 'plungerPosition', label: 'Plunger position', kind: 'text', group: 'Rest' },
	{ key: 'clickerPosition', label: 'Clicker position', kind: 'text', group: 'Rest' },
	{ key: 'sightWindage', label: 'Sight windage', kind: 'text', group: 'Sight' },
	{ key: 'sightExtension', label: 'Sight extension', kind: 'text', group: 'Sight' }
];

const COMPOUND: SettingField[] = [
	{ key: 'drawLength', label: 'Draw length', kind: 'lengthMm', unit: 'in', group: 'Bow' },
	{ key: 'peakWeight', label: 'Peak weight', kind: 'number', unit: 'lb', group: 'Bow' },
	{ key: 'letOff', label: 'Let-off', kind: 'number', unit: '%', group: 'Bow' },
	{ key: 'axleToAxle', label: 'Axle to axle', kind: 'lengthMm', unit: 'in', group: 'Bow' },
	{ key: 'braceHeight', label: 'Brace height', kind: 'lengthMm', unit: 'in', group: 'Bow' },
	{ key: 'camTiming', label: 'Cam timing', kind: 'text', group: 'Cams' },
	{ key: 'drawStop', label: 'Draw stop', kind: 'text', group: 'Cams' },
	{ key: 'peepHeight', label: 'Peep height', kind: 'lengthMm', unit: 'in', group: 'String' },
	{ key: 'dLoopLength', label: 'D-loop length', kind: 'lengthMm', unit: 'in', group: 'String' },
	{ key: 'restPosition', label: 'Rest position', kind: 'text', group: 'Rest' },
	{ key: 'sightHousing', label: 'Sight housing', kind: 'text', group: 'Sight' }
];

const BAREBOW: SettingField[] = [
	{ key: 'braceHeight', label: 'Brace height', kind: 'lengthMm', unit: 'in', group: 'Bow' },
	{ key: 'drawWeight', label: 'Draw weight on fingers', kind: 'number', unit: 'lb', group: 'Bow' },
	{ key: 'tillerUpper', label: 'Tiller upper', kind: 'lengthMm', unit: 'in', group: 'Bow' },
	{ key: 'tillerLower', label: 'Tiller lower', kind: 'lengthMm', unit: 'in', group: 'Bow' },
	{ key: 'weightSystem', label: 'Weight system', kind: 'text', group: 'Bow' },
	{ key: 'plungerTension', label: 'Plunger tension', kind: 'text', group: 'Rest' },
	{ key: 'crawlTable', label: 'Crawl marks', kind: 'text', group: 'Aiming' },
	{ key: 'anchor', label: 'Anchor', kind: 'text', group: 'Aiming' }
];

const LONGBOW: SettingField[] = [
	{ key: 'braceHeight', label: 'Brace height', kind: 'lengthMm', unit: 'in', group: 'Bow' },
	{ key: 'drawWeight', label: 'Draw weight at your draw', kind: 'number', unit: 'lb', group: 'Bow' },
	{ key: 'bowLength', label: 'Bow length', kind: 'lengthMm', unit: 'in', group: 'Bow' },
	{ key: 'anchor', label: 'Anchor', kind: 'text', group: 'Aiming' }
];

export const BOW_SCHEMAS: Record<BowType, SettingField[]> = {
	recurve: [...RECURVE, ...STRING_FIELDS, ...ARROW_FIELDS],
	compound: [...COMPOUND, ...STRING_FIELDS, ...ARROW_FIELDS],
	barebow: [...BAREBOW, ...STRING_FIELDS, ...ARROW_FIELDS],
	longbow: [...LONGBOW, ...STRING_FIELDS, ...ARROW_FIELDS]
};

export type BowSettings = Record<string, string | number | null>;

export function schemaFor(type: BowType): SettingField[] {
	return BOW_SCHEMAS[type] ?? [];
}

export function groupsOf(fields: SettingField[]): string[] {
	return [...new Set(fields.map((f) => f.group))];
}

export interface SettingChange {
	field: SettingField;
	before: string | number | null;
	after: string | number | null;
}

/** Powers the "what changed since my groups got worse" question, so it compares by schema not by key soup. */
export function diffSettings(
	type: BowType,
	before: BowSettings,
	after: BowSettings
): SettingChange[] {
	return schemaFor(type)
		.map((field) => ({
			field,
			before: before[field.key] ?? null,
			after: after[field.key] ?? null
		}))
		.filter((change) => normalise(change.before) !== normalise(change.after));
}

function normalise(value: string | number | null): string {
	if (value === null || value === '') return '';
	return String(value);
}
