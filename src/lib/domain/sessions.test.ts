import { describe, it, expect } from 'vitest';
import { defaultNameKey, sessionShape, isRunningSession, matchesQuery, hasHappened } from './sessions';

const at = (iso: string) => new Date(iso).getTime();

describe('defaultNameKey', () => {
	it('calls a competition a competition', () => {
		expect(defaultNameKey('competition', at('2026-08-10T09:00'))).toBe(
			'sessions.name.competition.morning'
		);
	});

	it('calls a run a run', () => {
		expect(defaultNameKey('running', at('2026-08-10T09:00'))).toBe('sessions.name.running.morning');
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

describe('sessionShape', () => {
	const done = (kind: string) => ({ kind, status: 'complete' });
	const going = (kind: string) => ({ kind, status: 'in_progress' });

	it('is a run when every activity is one', () => {
		expect(sessionShape([going('running')])).toBe('running');
		expect(sessionShape([going('running'), done('running')])).toBe('running');
	});

	it('names the other single kinds after what they are', () => {
		expect(sessionShape([going('match')])).toBe('match');
		expect(sessionShape([going('tuning')])).toBe('tuning');
		expect(sessionShape([going('strength')])).toBe('strength');
		expect(sessionShape([going('training')])).toBe('training');
	});

	it('is scoring as soon as a round was finished, whatever else is in it', () => {
		expect(sessionShape([done('scoring'), going('running')])).toBe('scoring');
		expect(sessionShape([done('scoring'), going('tuning')])).toBe('scoring');
	});

	it('is scoring when it holds a mixture that finished nothing', () => {
		expect(sessionShape([going('tuning'), going('match')])).toBe('scoring');
		expect(sessionShape([going('scoring')])).toBe('scoring');
		expect(sessionShape([])).toBe('scoring');
	});

	// Training arrows are a counter on the session, so they never take the icon off what was shot.
	it('lets the training counter ride along', () => {
		expect(sessionShape([going('running'), going('training')])).toBe('running');
		expect(sessionShape([going('tuning'), going('training')])).toBe('tuning');
	});
});

describe('isRunningSession', () => {
	it('follows the shape', () => {
		expect(isRunningSession([{ kind: 'running' }])).toBe(true);
		expect(isRunningSession([{ kind: 'running' }, { kind: 'scoring' }])).toBe(false);
		expect(isRunningSession([])).toBe(false);
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

describe('hasHappened', () => {
	const now = new Date('2026-08-12T18:00').getTime();
	const session = (extra: { kind?: string; startedAt?: number } = {}) => ({
		kind: 'practice',
		startedAt: new Date('2026-08-12T09:00').getTime(),
		...extra
	});

	it('counts an outing that has taken place', () => {
		expect(hasHappened(session(), now)).toBe(true);
	});

	it('counts one nothing was entered in, since turning up is still turning up', () => {
		// Nothing here says whether it holds arrows: an empty outing is one all the same.
		expect(hasHappened(session({ startedAt: now - 1000 }), now)).toBe(true);
	});

	it('leaves out a session still ahead, whatever it is called', () => {
		expect(hasHappened(session({ startedAt: new Date('2026-08-15T09:00').getTime() }), now)).toBe(
			false
		);
		expect(hasHappened(session({ kind: 'competition', startedAt: now + 1000 }), now)).toBe(false);
	});

	it('leaves out a slot a plan called for, even one whose hour has gone by', () => {
		expect(hasHappened(session({ kind: 'planned' }), now)).toBe(false);
	});
});
