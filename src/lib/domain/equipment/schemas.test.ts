import { describe, it, expect } from 'vitest';
import { schemaFor, diffSettings, displaySetting, parseSetting, BOW_SCHEMAS } from './schemas';
import { BOW_TYPES } from '../tuning/templates';

describe('bow schemas', () => {
	it('defines a schema for every bow type', () => {
		for (const type of BOW_TYPES) {
			expect(schemaFor(type).length).toBeGreaterThan(0);
		}
	});

	it('gives every field a unique key within its bow type', () => {
		for (const [type, fields] of Object.entries(BOW_SCHEMAS)) {
			const keys = fields.map((f) => f.key);
			expect(new Set(keys).size, `${type} has duplicate keys`).toBe(keys.length);
		}
	});

	it('gives compound cam timing and barebow crawls, and neither the other', () => {
		const compound = schemaFor('compound').map((f) => f.key);
		const barebow = schemaFor('barebow').map((f) => f.key);
		expect(compound).toContain('camTiming');
		expect(compound).not.toContain('crawlTable');
		expect(barebow).toContain('crawlTable');
		expect(barebow).not.toContain('camTiming');
	});
});

describe('reading and writing a setting', () => {
	it('stores a brace height in millimetres and reads it back in centimetres', () => {
		const braceHeight = schemaFor('recurve').find((f) => f.key === 'braceHeight')!;
		expect(parseSetting(braceHeight, '24')).toBe(240);
		expect(displaySetting(braceHeight, 240)).toBe('24');
	});

	it('round trips every field of every bow type, whatever unit it is measured in', () => {
		for (const type of BOW_TYPES) {
			for (const field of schemaFor(type)) {
				const typed = field.kind === 'text' || field.kind === 'select' ? 'a' : '24';
				const stored = parseSetting(field, typed);
				expect(displaySetting(field, stored), `${type}.${field.key}`).toBe(typed);
			}
		}
	});

	it('keeps an empty field unset rather than zero', () => {
		const drawWeight = schemaFor('recurve').find((f) => f.key === 'drawWeight')!;
		expect(parseSetting(drawWeight, '')).toBeNull();
		expect(displaySetting(drawWeight, null)).toBe('');
	});
});

describe('diffSettings', () => {
	it('reports only what actually changed', () => {
		const changes = diffSettings(
			'recurve',
			{ braceHeight: 232, drawWeight: 38 },
			{ braceHeight: 235, drawWeight: 38 }
		);
		expect(changes).toHaveLength(1);
		expect(changes[0].field.key).toBe('braceHeight');
		expect(changes[0].before).toBe(232);
		expect(changes[0].after).toBe(235);
	});

	it('treats a missing value and an empty string as the same absence', () => {
		expect(diffSettings('recurve', {}, { braceHeight: null })).toHaveLength(0);
		expect(diffSettings('recurve', { anchor: '' }, {})).toHaveLength(0);
	});

	it('ignores keys the schema does not define, so stale data cannot resurface as a change', () => {
		expect(diffSettings('longbow', { camTiming: 'a' }, { camTiming: 'b' })).toHaveLength(0);
	});

	it('reports a first value as a change from nothing', () => {
		const changes = diffSettings('recurve', {}, { braceHeight: 230 });
		expect(changes).toHaveLength(1);
		expect(changes[0].before).toBeNull();
	});
});
