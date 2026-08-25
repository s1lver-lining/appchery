import { describe, it, expect } from 'vitest';
import { allowedPath, targetOf } from './proxy';

const at = (path: string) => targetOf(new URL(`https://appchery.com${path}`));

describe('allowedPath', () => {
	it('allows the four kinds of page the app reads', () => {
		expect(allowedPath('/TourList.php')).toBe(true);
		expect(allowedPath('/Details.php')).toBe(true);
		expect(allowedPath('/TourData/2026/26053/IQRM.php')).toBe(true);
		expect(allowedPath('/TourData/2026/26053/IQRM.pdf')).toBe(true);
	});

	it('allows nothing else, however it is dressed up', () => {
		expect(allowedPath('/')).toBe(false);
		expect(allowedPath('/Admin.php')).toBe(false);
		expect(allowedPath('/TourData/2026/26053/../../../etc/passwd')).toBe(false);
		expect(allowedPath('/TourList.php/extra')).toBe(false);
		expect(allowedPath('//evil.example.com/')).toBe(false);
	});
});

describe('targetOf', () => {
	it('points a proxied path at ianseo', () => {
		expect(at('/ianseo-api/TourList.php')).toBe('https://www.ianseo.net/TourList.php');
	});

	it('carries the one query ianseo is asked anything with', () => {
		expect(at('/ianseo-api/Details.php?toId=26053')).toBe(
			'https://www.ianseo.net/Details.php?toId=26053'
		);
	});

	it('drops every other query rather than passing it on', () => {
		expect(at('/ianseo-api/Details.php?toId=1&redirect=http://evil.example.com')).toBe(
			'https://www.ianseo.net/Details.php?toId=1'
		);
	});

	it('answers for nothing outside its own prefix', () => {
		expect(at('/TourList.php')).toBe(null);
		expect(at('/ianseo-api')).toBe(null);
	});
});
