import { describe, it, expect } from 'vitest';
import { defaultNameKey, matchesQuery } from './sessions';

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

describe('matchesQuery', () => {
	const fields = ['Morning session', 'Club field', 'WA 18m', null, 'windy, shot well'];

	it('keeps everything while nothing is typed', () => {
		expect(matchesQuery('', fields)).toBe(true);
		expect(matchesQuery('   ', fields)).toBe(true);
	});

	it('matches a word in any field, whatever the case', () => {
		expect(matchesQuery('CLUB', fields)).toBe(true);
		expect(matchesQuery('18m', fields)).toBe(true);
		expect(matchesQuery('windy', fields)).toBe(true);
		expect(matchesQuery('compound', fields)).toBe(false);
	});

	it('asks every word to be found, across fields and in any order', () => {
		expect(matchesQuery('windy club', fields)).toBe(true);
		expect(matchesQuery('club rain', fields)).toBe(false);
	});

	it('ignores accents on both sides', () => {
		expect(matchesQuery('entrainement', ['Entraînement du soir'])).toBe(true);
		expect(matchesQuery('soirée', ['Entrainement du soiree'])).toBe(true);
	});
});
