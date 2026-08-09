import { describe, it, expect } from 'vitest';
import { isMainPage, parentPath, neighbourPage } from './nav';

describe('parentPath', () => {
	it('has no parent for the pages in the tab bar', () => {
		expect(parentPath('/')).toBeNull();
		expect(parentPath('/sessions')).toBeNull();
		expect(parentPath('/settings/')).toBeNull();
	});

	it('climbs one level from a detail page', () => {
		expect(parentPath('/sessions/abc')).toBe('/sessions');
		expect(parentPath('/equipment/abc')).toBe('/equipment');
	});

	it('falls back to home when the prefix is not a page of its own', () => {
		expect(parentPath('/activities/abc')).toBe('/');
	});
});

describe('isMainPage', () => {
	it('rejects detail pages', () => {
		expect(isMainPage('/sessions')).toBe(true);
		expect(isMainPage('/sessions/abc')).toBe(false);
	});
});

describe('neighbourPage', () => {
	it('walks the tab bar order', () => {
		expect(neighbourPage('/', 1)).toBe('/sessions');
		expect(neighbourPage('/stats', -1)).toBe('/equipment');
	});

	it('stops at the ends and ignores pages outside the tab bar', () => {
		expect(neighbourPage('/', -1)).toBeNull();
		expect(neighbourPage('/settings', 1)).toBeNull();
		expect(neighbourPage('/sessions/abc', 1)).toBeNull();
	});
});
