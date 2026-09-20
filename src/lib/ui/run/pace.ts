import { clock } from '$lib/domain/running';
import { formatPace } from '$lib/domain/run/workout';

/**
 * How a speed is said. A pace in minutes per kilometre is what a runner trains in, so it is the
 * default and it is the default again on every run: an hour a week on a bike does not change what a
 * running programme is written in. Kilometres an hour is one tap away for anybody who thinks in it.
 */
export type PaceUnit = 'pace' | 'speed';

export function sayPace(secondsPerKm: number | null, unit: PaceUnit): string {
	if (!secondsPerKm || secondsPerKm <= 0) return '–:--';
	if (unit === 'pace') return formatPace(secondsPerKm);
	return (3600 / secondsPerKm).toFixed(1);
}

/** The unit itself, for the label under the figure. */
export function paceUnitKey(unit: PaceUnit): 'running.perKm' | 'running.kmh' {
	return unit === 'pace' ? 'running.perKm' : 'running.kmh';
}

/** A split's pace, which is its own seconds over its own kilometre. */
export function saySplit(seconds: number, distanceM: number, unit: PaceUnit): string {
	if (distanceM <= 0 || seconds <= 0) return '–:--';
	return sayPace(seconds / (distanceM / 1000), unit);
}

export { clock };
