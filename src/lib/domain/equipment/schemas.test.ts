import { describe, it, expect } from 'vitest';
import { schemaFor, diffSettings, BOW_SCHEMAS } from './schemas';
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
