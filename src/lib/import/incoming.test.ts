import { describe, it, expect } from 'vitest';
import { decodeFilename, encodeFilename, namedFile } from './incoming';

/**
 * The share sheet hands the worker a file and the worker parks it for the import page, with the name
 * travelling between them in a header. A header carries bytes, so the name has to survive being one.
 */
describe('the name of a shared file', () => {
	const names = [
		'export.xlsx',
		'résultats.xlsx',
		'結果.xlsx',
		'результаты.xlsx',
		'αποτελέσματα.xlsx',
		'نتائج.xlsx',
		'score 🎯.xlsx',
		'50% club.xlsx',
		'a b.xlsx'
	];

	it('can be written to a header in every alphabet the app reads competitions in', () => {
		for (const name of names) {
			// The worker builds exactly this, and threw here on anything outside Latin-1: the throw is
			// caught as a share it could not read, so the file was dropped without a word.
			expect(() => new Response('x', { headers: { 'x-filename': encodeFilename(name) } })).not.toThrow();
		}
	});

	it('comes back as it went in', () => {
		for (const name of names) {
			const response = new Response('x', { headers: { 'x-filename': encodeFilename(name) } });
			expect(decodeFilename(response.headers.get('x-filename') ?? '')).toBe(name);
		}
	});

	/** A file parked by an older worker carries its name raw, and one of those holds a per cent sign. */
	it('leaves a name it cannot decode alone rather than losing it', () => {
		expect(decodeFilename('50% club.xlsx')).toBe('50% club.xlsx');
		expect(decodeFilename('')).toBe('');
	});

	it('still falls back for a share that carried no name at all', () => {
		expect(namedFile(new Blob(['x']), decodeFilename('')).name).toBe('export.xlsx');
	});
});
