/**
 * Shooting time.
 *
 * World Archery runs a round on a clock and on signals, not on a coach's judgement: two blasts to
 * come to the line, one to start, three to collect the arrows. The lights go green while shooting is
 * allowed, amber for the last thirty seconds, and red when the time is up. Everything in here is the
 * rules of that clock, so the page drawing it and the sound playing it cannot disagree.
 */

export type TimerLight = 'idle' | 'green' | 'amber' | 'red';

export interface TimerPreset {
	key: string;
	seconds: number;
	/** Arrows the time is given for, which is what makes a preset recognisable. */
	arrows: number;
	/** Sides shooting in turn, so the clock runs twice per end rather than once. */
	alternating?: boolean;
}

/**
 * The times World Archery shoots to. Six arrows get four minutes and three get two in qualification;
 * a match gives two minutes for three arrows, a team two minutes for six, and a mixed team eighty
 * seconds for four. Alternating shooting gives twenty seconds an arrow.
 */
export const TIMER_PRESETS: TimerPreset[] = [
	{ key: 'qualification6', seconds: 240, arrows: 6 },
	{ key: 'qualification3', seconds: 120, arrows: 3 },
	{ key: 'match3', seconds: 120, arrows: 3 },
	{ key: 'team6', seconds: 120, arrows: 6 },
	{ key: 'mixed4', seconds: 80, arrows: 4 },
	{ key: 'alternating', seconds: 20, arrows: 1, alternating: true }
];

/** The last thirty seconds are amber, unless the whole time is too short for that to mean anything. */
export function amberAt(seconds: number): number {
	return seconds > 60 ? 30 : Math.min(10, Math.floor(seconds / 2));
}

export function lightFor(remaining: number, total: number, running: boolean): TimerLight {
	if (!running && remaining === total) return 'idle';
	if (remaining <= 0) return 'red';
	return remaining <= amberAt(total) ? 'amber' : 'green';
}

/** Two blasts call the line up, one starts the shooting, three end it. */
export type Signal = 'lineUp' | 'start' | 'end' | 'stop';

export const BLASTS: Record<Signal, number> = {
	lineUp: 2,
	start: 1,
	end: 3,
	/** Five or more stops everything: it means somebody is walking where arrows are about to fly. */
	stop: 5
};

/** Counted down from a start stamp rather than ticked, so a slept phone comes back with the truth. */
export function remainingAt(startedAt: number, total: number, now: number): number {
	return Math.max(0, total - Math.floor((now - startedAt) / 1000));
}

export function formatClock(seconds: number): string {
	const safe = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(safe / 60);
	return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}
