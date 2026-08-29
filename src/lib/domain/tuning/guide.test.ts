import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	GUIDE_STEPS,
	HANDED_STEPS,
	HANDED_DIAGRAMS,
	stepsFor,
	groupsFor,
	stepText,
	BRACE_HEIGHT_TABLE
} from './guide';
import { TUNING_TEMPLATES } from './templates';
import { LOCALES } from '$lib/i18n';

/*
 * The guide is sixty kilobytes of parallel data kept by hand: every step written twice for the two
 * languages, some of them a third and fourth time for a left handed bow, each pointing at a diagram
 * that has to be drawn somewhere else and at a tuning template that has to exist. None of it is
 * reached by the type checker, and all of it drifts. These hold the pieces against each other.
 */

const KEYS = GUIDE_STEPS.map((step) => step.key);

describe('the tuning guide', () => {
	it('gives every step a key of its own', () => {
		expect([...new Set(KEYS)]).toHaveLength(KEYS.length);
		expect(KEYS.length).toBeGreaterThan(20);
	});

	it('reads in every language, with nothing left blank', () => {
		const blank: string[] = [];
		for (const locale of LOCALES) {
			for (const step of GUIDE_STEPS) {
				const text = stepText(step.key, locale);
				if (!text) {
					blank.push(`${locale} ${step.key}: nothing at all`);
					continue;
				}
				if (!text.title?.trim()) blank.push(`${locale} ${step.key}: no title`);
				if (!text.why?.trim()) blank.push(`${locale} ${step.key}: no why`);
				if (!text.steps?.length) blank.push(`${locale} ${step.key}: no steps`);
				if (text.steps?.some((s) => !s.trim())) blank.push(`${locale} ${step.key}: a blank step`);
				if (text.results?.some((r) => !r.observation?.trim() || !r.suggests?.trim()))
					blank.push(`${locale} ${step.key}: a blank result`);
			}
		}
		expect(blank).toEqual([]);
	});

	/**
	 * A left handed archer reads every sideways instruction mirrored. The wording is written out
	 * rather than swapped by machine, so the two versions can fall out of step with each other, and
	 * a step that quietly serves the right handed words to a left handed bow is worse than no step.
	 */
	it('mirrors exactly the steps that need mirroring, and no others', () => {
		const wrong: string[] = [];

		for (const key of HANDED_STEPS) {
			if (!KEYS.includes(key)) wrong.push(`HANDED_STEPS names ${key}, which is not a step`);
			for (const locale of LOCALES) {
				const right = stepText(key, locale, 'right');
				const left = stepText(key, locale, 'left');
				if (!left) {
					wrong.push(`${locale} ${key}: no left handed reading`);
					continue;
				}
				if (JSON.stringify(right) === JSON.stringify(left))
					wrong.push(`${locale} ${key}: listed as handed but reads the same either way`);
				if (left.steps.length !== right.steps.length)
					wrong.push(`${locale} ${key}: the two hands have different numbers of steps`);
				if (left.results.length !== right.results.length)
					wrong.push(`${locale} ${key}: the two hands have different numbers of results`);
			}
		}

		for (const step of GUIDE_STEPS) {
			if (HANDED_STEPS.includes(step.key)) continue;
			for (const locale of LOCALES) {
				if (
					JSON.stringify(stepText(step.key, locale, 'right')) !==
					JSON.stringify(stepText(step.key, locale, 'left'))
				)
					wrong.push(`${locale} ${step.key}: reads differently but is not listed as handed`);
			}
		}

		expect(wrong).toEqual([]);
	});

	it('points only at templates that exist', () => {
		const templates = new Set(TUNING_TEMPLATES.map((template) => template.key));
		const missing = GUIDE_STEPS.filter(
			(step) => step.templateKey && !templates.has(step.templateKey)
		).map((step) => `${step.key} -> ${step.templateKey}`);
		expect(missing).toEqual([]);
	});

	it('asks only for diagrams something draws', () => {
		const source = readFileSync('src/lib/ui/TuningDiagram.svelte', 'utf8');
		const drawn = new Set([...source.matchAll(/name === '([a-zA-Z]+)'/g)].map((m) => m[1]));
		// If this ever empties, the check below would pass by knowing nothing.
		expect(drawn.size).toBeGreaterThan(5);

		const asked = GUIDE_STEPS.map((step) => step.diagram).filter((name): name is string => !!name);
		expect([...new Set(asked)].filter((name) => !drawn.has(name))).toEqual([]);
		// And nothing is drawn that no step ever shows.
		expect([...drawn].filter((name) => !asked.includes(name))).toEqual([]);
	});

	it('names handed diagrams that steps actually use', () => {
		const used = new Set(GUIDE_STEPS.map((step) => step.diagram));
		expect(HANDED_DIAGRAMS.filter((name) => !used.has(name))).toEqual([]);
	});

	it('cuts each bow into headings without losing a step or reordering one', () => {
		for (const bow of ['recurve', 'compound'] as const) {
			const straight = stepsFor(bow);
			const groups = groupsFor(bow);
			expect(groups.flatMap((group) => group.steps).map((step) => step.key)).toEqual(
				straight.map((step) => step.key)
			);
			for (const group of groups) {
				expect(group.steps.length).toBeGreaterThan(0);
				expect(group.steps.every((step) => step.category === group.category)).toBe(true);
			}
			// A heading that comes back later reads as two sections with the same name.
			const headings = groups.map((group) => group.category);
			expect([...new Set(headings)]).toHaveLength(headings.length);
		}
	});

	it('keeps the brace height table readable in order', () => {
		for (const [i, row] of BRACE_HEIGHT_TABLE.entries()) {
			expect(row.minCm).toBeLessThan(row.maxCm);
			if (i > 0) expect(row.bowLength).toBeGreaterThan(BRACE_HEIGHT_TABLE[i - 1].bowLength);
		}
	});
});
