import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { afterToggle, defaultColumns, NO_CHOICE, visibleColumns, wrappingColumn } from './columns';
import { parseDocument } from './parse/document';
import type { DocumentSection, TableDocument } from './types';

const load = (name: string) =>
	(parseDocument(readFileSync(`test/ianseo/${name}.html`, 'utf8')) as TableDocument).sections[0];

const labels = (section: DocumentSection, visible: boolean[]) =>
	section.columns.filter((_, at) => visible[at]).map((column) => column.label);

describe('what a start list opens with', () => {
	/** The document the whole idea comes from: five columns of French, of which two identify a line. */
	const section = load('ENA-fr');

	it('shows who the line is about and where they are shooting, and no more', () => {
		expect(labels(section, defaultColumns(section))).toEqual(['Athlète', 'Cible']);
	});

	it('leaves the club and the class to be asked for', () => {
		const shown = labels(section, defaultColumns(section));
		expect(shown).not.toContain('Clubs / Pays');
		expect(shown).not.toContain('Epreuve');
	});

	it('adds one when the archer asks for it, and keeps the rest away', () => {
		const choice = { chosen: new Set(['Clubs / Pays']), refused: new Set<string>() };
		// In the order the document prints them, not the order they were asked for.
		expect(labels(section, visibleColumns(section, choice))).toEqual([
			'Athlète',
			'Cible',
			'Clubs / Pays'
		]);
	});

	it('drops one the archer does not want, even though it opens with it', () => {
		const choice = { chosen: new Set<string>(), refused: new Set(['Cible']) };
		expect(labels(section, visibleColumns(section, choice))).toEqual(['Athlète']);
	});
});

describe('what a result list opens with', () => {
	const section = load('IQRM');

	it('shows the placing, the archer and the figures, and folds what ianseo folds', () => {
		expect(labels(section, defaultColumns(section))).toEqual(['Pos.', 'Athlete', 'Tot.', '10', '9']);
	});

	it('never drops the archer, whose line it is', () => {
		expect(section.columns[wrappingColumn(section)].label).toBe('Athlete');
	});
});

describe('afterToggle', () => {
	const label = 'Clubs / Pays';

	it('records wanting a column the document would not have shown', () => {
		const after = afterToggle(label, false, false, NO_CHOICE);
		expect([...after.chosen]).toEqual([label]);
		expect([...after.refused]).toEqual([]);
	});

	it('records refusing a column the document would have shown', () => {
		const after = afterToggle('Cible', true, true, NO_CHOICE);
		expect([...after.refused]).toEqual(['Cible']);
	});

	/** Nothing is remembered about a column left doing what it would have done anyway. */
	it('forgets a choice that agrees with the document again', () => {
		const chosen = afterToggle(label, false, false, NO_CHOICE);
		const back = afterToggle(label, true, false, chosen);
		expect([...back.chosen]).toEqual([]);
		expect([...back.refused]).toEqual([]);
	});

	it('leaves every other choice alone', () => {
		const start = { chosen: new Set(['Epreuve']), refused: new Set(['Cible']) };
		const after = afterToggle(label, false, false, start);
		expect([...after.chosen].sort()).toEqual(['Clubs / Pays', 'Epreuve']);
		expect([...after.refused]).toEqual(['Cible']);
	});
});
