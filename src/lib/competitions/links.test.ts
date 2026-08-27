import { describe, expect, it } from 'vitest';
import { fileLink, webLink } from './links';

const IANSEO = 'https://www.ianseo.net';

describe('fileLink', () => {
	it('resolves a published file under the source it came from', () => {
		expect(fileLink('/TourData/2026/27949/TQD2F.pdf', IANSEO)).toBe(
			'https://www.ianseo.net/TourData/2026/27949/TQD2F.pdf'
		);
	});

	it('encodes a name with a space in it, which is how a mandate is usually filed', () => {
		expect(fileLink('/TourData/2026/27949/Mandat D2v.pdf?time=2026-04-27', IANSEO)).toBe(
			'https://www.ianseo.net/TourData/2026/27949/Mandat%20D2v.pdf?time=2026-04-27'
		);
	});

	it('refuses a scheme of the page own choosing', () => {
		expect(fileLink('javascript:alert(1)', IANSEO)).toBeUndefined();
		expect(fileLink('data:text/html,<script>', IANSEO)).toBeUndefined();
	});

	it('refuses a file that is not the source own', () => {
		expect(fileLink('https://example.com/x.pdf', IANSEO)).toBeUndefined();
		expect(fileLink('//example.com/x.pdf', IANSEO)).toBeUndefined();
	});

	it('has nothing to say about nothing', () => {
		expect(fileLink(null, IANSEO)).toBeUndefined();
		expect(fileLink('', IANSEO)).toBeUndefined();
	});
});

describe('webLink', () => {
	it('takes a page on the open web', () => {
		expect(webLink('https://brouchy.inscriptarc.fr/x')).toBe('https://brouchy.inscriptarc.fr/x');
	});

	it('refuses anything that is not a page', () => {
		expect(webLink('javascript:alert(1)')).toBeUndefined();
		expect(webLink('mailto:someone@example.com')).toBeUndefined();
		expect(webLink('/relative')).toBeUndefined();
		expect(webLink(null)).toBeUndefined();
	});
});
