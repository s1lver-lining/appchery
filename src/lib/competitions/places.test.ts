import { describe, it, expect } from 'vitest';
import { keyOf, pick } from './places';

const at = (country: string, latitude: number, longitude = 0, postcodes?: string[]) => ({
	country,
	latitude,
	longitude,
	postcodes
});

describe('keyOf', () => {
	it('remembers a town by its postcode where the source printed one', () => {
		expect(keyOf({ name: 'ALLUYES', country: 'France', postcode: '28800' })).toBe(
			'28800|alluyes|france'
		);
	});

	it('is the same key for the same town written two ways', () => {
		expect(keyOf({ name: 'Pérols', country: 'France' })).toBe(
			keyOf({ name: 'PEROLS', country: 'france' })
		);
	});
});

describe('pick', () => {
	const town = { name: 'Rennes', country: 'France' };

	it('takes the answer in the country the competition is held in', () => {
		expect(pick([at('Italy', 40), at('France', 48.11)], town)).toEqual({
			latitude: 48.11,
			longitude: 0
		});
	});

	it('lets a postcode settle two towns of the same name in one country', () => {
		const point = pick(
			[at('France', 48.11, 1, ['35000']), at('France', 43.5, 2, ['34470'])],
			{ name: 'Pérols', country: 'France', postcode: '34470' }
		);
		expect(point).toEqual({ latitude: 43.5, longitude: 2 });
	});

	it('leaves a town unknown rather than putting it in the wrong country', () => {
		expect(pick([at('Italy', 40), at('Spain', 41)], town)).toBe(null);
	});

	it('takes the first answer when the source never said which country', () => {
		expect(pick([at('Italy', 40), at('France', 48)], { name: 'Rennes' })).toEqual({
			latitude: 40,
			longitude: 0
		});
	});

	it('has no answer for a lookup that found nothing', () => {
		expect(pick([], town)).toBe(null);
	});
});
