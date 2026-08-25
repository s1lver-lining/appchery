import { describe, it, expect } from 'vitest';
import { conditionsPatch } from './conditions';

const weather = {
	temperatureC: 14,
	windSpeedKmh: 9,
	windDirectionDeg: 270,
	code: 3,
	fetchedAt: 1
};

describe('conditionsPatch', () => {
	it('records everything a full reading found', () => {
		expect(
			conditionsPatch({ latitude: 48.1, longitude: -1.6, place: 'Rennes, FR', weather })
		).toEqual({
			latitude: 48.1,
			longitude: -1.6,
			location: 'Rennes, FR',
			weather: JSON.stringify(weather)
		});
	});

	/**
	 * The bug this exists for: naming the place is off by default, so every successful reading used to
	 * write a null over the place the archer had typed in themselves.
	 */
	it('leaves the place alone when the reading did not name one', () => {
		const patch = conditionsPatch({ latitude: 48.1, longitude: -1.6, place: null, weather });
		expect(patch).not.toHaveProperty('location');
		expect(patch.latitude).toBe(48.1);
	});

	it('leaves the weather alone when there was no signal to read it', () => {
		const patch = conditionsPatch({ latitude: 48.1, longitude: -1.6, place: 'Rennes', weather: null });
		expect(patch).not.toHaveProperty('weather');
		expect(patch.location).toBe('Rennes');
	});

	it('records the position and nothing else when the reading found nothing else', () => {
		expect(conditionsPatch({ latitude: 1, longitude: 2, place: null, weather: null })).toEqual({
			latitude: 1,
			longitude: 2
		});
	});

	it('never writes an empty place, which is not a place', () => {
		const patch = conditionsPatch({ latitude: 1, longitude: 2, place: '', weather: null });
		expect(patch).not.toHaveProperty('location');
	});
});
