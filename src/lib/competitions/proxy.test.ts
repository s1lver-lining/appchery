import { describe, it, expect } from 'vitest';
import { PROXY_PREFIX, targetOf } from './proxy';

const at = (path: string) => targetOf(new URL(`https://appchery.com${PROXY_PREFIX}${path}`));

describe('targetOf, for ianseo', () => {
	it('points a proxied path at ianseo', () => {
		expect(at('/ianseo/TourList.php')).toBe('https://www.ianseo.net/TourList.php');
		expect(at('/ianseo/TourData/2026/26053/IQRM.php')).toBe(
			'https://www.ianseo.net/TourData/2026/26053/IQRM.php'
		);
	});

	it('carries the one query ianseo is asked anything with', () => {
		expect(at('/ianseo/Details.php?toId=26053')).toBe(
			'https://www.ianseo.net/Details.php?toId=26053'
		);
	});
});

describe('targetOf, for the FFTA', () => {
	it('points a proxied path at the federation', () => {
		expect(at('/ffta/epreuve/27617')).toBe('https://www.ffta.fr/epreuve/27617');
	});

	it('carries the calendar query, including the départements, which repeat', () => {
		const target = at('/ffta/competitions?start=2026-08-25&end=2026-11-25&dep%5B%5D=36&dep%5B%5D=1&page=2');
		expect(target).toContain('https://www.ffta.fr/competitions?');
		expect(target).toContain('start=2026-08-25');
		expect(target).toContain('end=2026-11-25');
		expect(target).toContain('page=2');
		expect(target?.match(/dep%5B%5D=/g)).toHaveLength(2);
	});

	it('drops a query neither source was asked for', () => {
		expect(at('/ffta/competitions?destination=http://evil.example.com')).toBe(
			'https://www.ffta.fr/competitions'
		);
	});
});

describe('targetOf, for Inscript\'Arc', () => {
	it('points at the one page that lists what is open for entry', () => {
		expect(at('/inscriptarc/competitions/resultats')).toBe(
			'https://www.inscriptarc.fr/competitions/resultats'
		);
	});

	it('reaches nothing else on the platform, which is where archers’ own details are', () => {
		expect(at('/inscriptarc/competitions')).toBe(null);
		expect(at('/inscriptarc/identification')).toBe(null);
	});
});

describe('targetOf, on anything else', () => {
	it('answers for no path either source does not publish', () => {
		expect(at('/ianseo/Admin.php')).toBe(null);
		expect(at('/ffta/user/login')).toBe(null);
		expect(at('/ffta/epreuve/../../etc/passwd')).toBe(null);
		expect(at('/other/TourList.php')).toBe(null);
	});

	it('answers for nothing outside its own prefix', () => {
		expect(targetOf(new URL('https://appchery.com/TourList.php'))).toBe(null);
		expect(targetOf(new URL(`https://appchery.com${PROXY_PREFIX}`))).toBe(null);
	});

	it('never lets one source’s path be asked of the other', () => {
		expect(at('/ffta/TourList.php')).toBe(null);
		expect(at('/ianseo/competitions')).toBe(null);
	});
});
