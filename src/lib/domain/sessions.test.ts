import { describe, it, expect } from 'vitest';
import { defaultNameKey } from './sessions';

const at = (iso: string) => new Date(iso).getTime();

describe('defaultNameKey', () => {
	it('calls a competition a competition', () => {
		expect(defaultNameKey('competition', at('2026-08-10T09:00'))).toBe(
			'sessions.name.competition.morning'
		);
	});

	it('treats every other kind as practice', () => {
		expect(defaultNameKey('practice', at('2026-08-10T20:00'))).toBe(
			'sessions.name.practice.evening'
		);
		expect(defaultNameKey('qualification', at('2026-08-10T02:00'))).toBe(
			'sessions.name.practice.night'
		);
	});
});
