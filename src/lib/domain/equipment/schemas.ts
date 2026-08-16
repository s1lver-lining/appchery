import type { BowType } from '../tuning/templates';
import { mmToInches, inchesToMm } from '../units';

/**
 * Setting fields per bow type. Adding a bow type means adding a schema here, never touching a form,
 * because the schema drives rendering, validation, and the revision diff alike.
 */
export type FieldKind = 'lengthMm' | 'lengthCm' | 'massG' | 'number' | 'text' | 'select';

export interface SettingField {
	key: string;
	label: string;
	kind: FieldKind;
	/**
	 * Shown beside the input. Length fields store mm; `lengthMm` is read in inches and `lengthCm` in
	 * centimetres, which is how brace height and tiller are actually measured. Mass is stored in
	 * grams and read in kilogrammes, which is how a bow is weighed. See doc/architecture.md.
	 */
	unit?: string;
	step?: number;
	options?: string[];
	group: string;
}

/**
 * What the archer brings to whichever bow is picked up: the hand it is shot from and how far it is
 * drawn. Kept per bow all the same, because the same archer draws a longbow shorter than a compound
 * and may well shoot one of them the other way round.
 */
const ARCHER_FIELDS: SettingField[] = [
	{ key: 'handedness', label: 'Bow hand', kind: 'select', options: ['Right', 'Left'], group: 'Archer' },
	{ key: 'drawLength', label: 'Draw length', kind: 'lengthMm', unit: 'in', group: 'Archer' }
];

const ARROW_FIELDS: SettingField[] = [
	{ key: 'arrowSpine', label: 'Arrow spine', kind: 'number', group: 'Arrows' },
	{ key: 'arrowLength', label: 'Arrow length', kind: 'lengthMm', unit: 'in', group: 'Arrows' },
	{ key: 'pointWeight', label: 'Point weight', kind: 'number', unit: 'gr', group: 'Arrows' }
];

const STRING_FIELDS: SettingField[] = [
	{ key: 'stringMaterial', label: 'String material', kind: 'text', group: 'String' },
	{ key: 'stringStrands', label: 'Strands', kind: 'number', group: 'String' },
	{ key: 'nockingPoint', label: 'Nocking point above square', kind: 'number', unit: 'mm', group: 'String' }
];

/** What the arrow leaves on, which is what half the tuning procedures end up moving. */
const REST_FIELDS: SettingField[] = [
	{ key: 'centreShot', label: 'Centre shot', kind: 'number', unit: 'mm', group: 'Rest' },
	{ key: 'plunger', label: 'Plunger tension', kind: 'text', group: 'Rest' }
];

const RECURVE: SettingField[] = [
	{ key: 'bowMass', label: 'Bow mass', kind: 'massG', unit: 'kg', group: 'Bow' },
	{ key: 'braceHeight', label: 'Brace height', kind: 'lengthCm', unit: 'cm', group: 'Bow' },
	{ key: 'drawWeight', label: 'Draw weight on fingers', kind: 'number', unit: 'lb', group: 'Bow' },
	{ key: 'limbSize', label: 'Limb size', kind: 'select', options: ['Short', 'Medium', 'Long'], group: 'Bow' },
	{ key: 'tillerUpper', label: 'Tiller upper', kind: 'lengthCm', unit: 'cm', group: 'Bow' },
	{ key: 'tillerLower', label: 'Tiller lower', kind: 'lengthCm', unit: 'cm', group: 'Bow' }
];

const COMPOUND: SettingField[] = [
	{ key: 'bowMass', label: 'Bow mass', kind: 'massG', unit: 'kg', group: 'Bow' },
	{ key: 'peakWeight', label: 'Peak weight', kind: 'number', unit: 'lb', group: 'Bow' },
	{ key: 'letOff', label: 'Let-off', kind: 'number', unit: '%', group: 'Bow' },
	{ key: 'axleToAxle', label: 'Axle to axle', kind: 'lengthMm', unit: 'in', group: 'Bow' },
	{ key: 'braceHeight', label: 'Brace height', kind: 'lengthCm', unit: 'cm', group: 'Bow' },
	{ key: 'camTiming', label: 'Cam timing', kind: 'text', group: 'Cams' },
	{ key: 'drawStop', label: 'Draw stop', kind: 'text', group: 'Cams' },
	{ key: 'peepHeight', label: 'Peep height', kind: 'lengthMm', unit: 'in', group: 'String' },
	{ key: 'dLoopLength', label: 'D-loop length', kind: 'lengthMm', unit: 'in', group: 'String' }
];

const BAREBOW: SettingField[] = [
	{ key: 'bowMass', label: 'Bow mass', kind: 'massG', unit: 'kg', group: 'Bow' },
	{ key: 'braceHeight', label: 'Brace height', kind: 'lengthCm', unit: 'cm', group: 'Bow' },
	{ key: 'drawWeight', label: 'Draw weight on fingers', kind: 'number', unit: 'lb', group: 'Bow' },
	{ key: 'tillerUpper', label: 'Tiller upper', kind: 'lengthCm', unit: 'cm', group: 'Bow' },
	{ key: 'tillerLower', label: 'Tiller lower', kind: 'lengthCm', unit: 'cm', group: 'Bow' },
	{ key: 'weightSystem', label: 'Weight system', kind: 'text', group: 'Bow' },
	{ key: 'crawlTable', label: 'Crawl marks', kind: 'text', group: 'Aiming' },
	{ key: 'anchor', label: 'Anchor', kind: 'text', group: 'Aiming' }
];

const LONGBOW: SettingField[] = [
	{ key: 'bowMass', label: 'Bow mass', kind: 'massG', unit: 'kg', group: 'Bow' },
	{ key: 'braceHeight', label: 'Brace height', kind: 'lengthCm', unit: 'cm', group: 'Bow' },
	{ key: 'drawWeight', label: 'Draw weight at your draw', kind: 'number', unit: 'lb', group: 'Bow' },
	{ key: 'bowLength', label: 'Bow length', kind: 'lengthMm', unit: 'in', group: 'Bow' },
	{ key: 'anchor', label: 'Anchor', kind: 'text', group: 'Aiming' }
];

export const BOW_SCHEMAS: Record<BowType, SettingField[]> = {
	recurve: [...ARCHER_FIELDS, ...RECURVE, ...STRING_FIELDS, ...REST_FIELDS, ...ARROW_FIELDS],
	compound: [...ARCHER_FIELDS, ...COMPOUND, ...STRING_FIELDS, ...REST_FIELDS, ...ARROW_FIELDS],
	barebow: [...ARCHER_FIELDS, ...BAREBOW, ...STRING_FIELDS, ...REST_FIELDS, ...ARROW_FIELDS],
	longbow: [...ARCHER_FIELDS, ...LONGBOW, ...STRING_FIELDS, ...ARROW_FIELDS]
};

export type BowSettings = Record<string, string | number | null>;

export function schemaFor(type: BowType): SettingField[] {
	return BOW_SCHEMAS[type] ?? [];
}

export function groupsOf(fields: SettingField[]): string[] {
	return [...new Set(fields.map((f) => f.group))];
}

/**
 * Every length is stored in millimetres and read in whatever unit the field is measured in, so the
 * three pages that show settings never disagree about what a stored number means.
 */
export function displaySetting(field: SettingField, value: string | number | null): string {
	if (value === null || value === undefined || value === '') return '';
	if (field.kind === 'lengthMm') return String(Math.round(mmToInches(Number(value)) * 100) / 100);
	if (field.kind === 'lengthCm') return String(Math.round(Number(value) / 10 / 0.01) * 0.01);
	if (field.kind === 'massG') return String(Math.round(Number(value) / 10) / 100);
	return String(value);
}

/** The value to store for what was typed. An empty field is not set, which is not the same as zero. */
export function parseSetting(field: SettingField, raw: string): string | number | null {
	if (raw.trim() === '') return null;
	if (field.kind === 'lengthMm') return Math.round(inchesToMm(Number(raw)) * 10) / 10;
	if (field.kind === 'lengthCm') return Math.round(Number(raw) * 10 * 10) / 10;
	if (field.kind === 'massG') return Math.round(Number(raw) * 1000);
	if (field.kind === 'number') return Number(raw);
	return raw;
}

/** The same value said out loud, with its unit, for a summary or a diff. */
export function formatSetting(field: SettingField, value: string | number | null): string {
	if (value === null || value === '') return '—';
	if (field.kind === 'lengthMm') return `${displaySetting(field, value)}"`;
	if (field.kind === 'lengthCm') return `${displaySetting(field, value)} cm`;
	if (field.kind === 'massG') return `${displaySetting(field, value)} kg`;
	return field.unit ? `${value} ${field.unit}` : String(value);
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
