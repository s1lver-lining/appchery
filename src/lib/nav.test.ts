import { describe, it, expect } from 'vitest';
import { isMainPage, parentPath, mainPageIndex, runBackGuards } from './nav';

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

describe('runBackGuards', () => {
	it('lets the key through when nothing claims it', () => {
		expect(runBackGuards([])).toBe(false);
		expect(runBackGuards([() => false])).toBe(false);
	});

	it('offers the key to the innermost guard first and stops there', () => {
		const seen: string[] = [];
		const guard = (name: string, takes: boolean) => () => {
			seen.push(name);
			return takes;
		};
		expect(runBackGuards([guard('outer', true), guard('inner', true)])).toBe(true);
		expect(seen).toEqual(['inner']);
	});

	it('falls through to an outer guard when the inner one declines', () => {
		expect(runBackGuards([() => true, () => false])).toBe(true);
	});
});

describe('mainPageIndex', () => {
	it('places a page in the tab bar order', () => {
		expect(mainPageIndex('/')).toBe(0);
		expect(mainPageIndex('/stats')).toBe(3);
		expect(mainPageIndex('/settings/')).toBe(4);
	});

	it('rejects a page that is not in the tab bar', () => {
		expect(mainPageIndex('/sessions/abc')).toBe(-1);
	});
});
