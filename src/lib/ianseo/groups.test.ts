import { describe, it, expect } from 'vitest';
import { groupKey } from './groups';

describe('groupKey', () => {
	it('names the panels ianseo publishes under', () => {
		expect(groupKey('Qualification Round')).toBe('qualification');
		expect(groupKey('Final Round - Brackets')).toBe('brackets');
		expect(groupKey('Entry List')).toBe('entryList');
	});

	it('reads a panel however ianseo spaced or cased it', () => {
		expect(groupKey('ENTRY LIST')).toBe('entryList');
		expect(groupKey('  Final Round -   Brackets ')).toBe('brackets');
	});

	it('leaves a panel it has never seen to ianseo, rather than guessing at it', () => {
		expect(groupKey('Something New In 2027')).toBeNull();
		expect(groupKey('')).toBeNull();
	});
});
