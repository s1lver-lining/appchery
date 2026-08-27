import type {
	BracketDocument,
	BracketEntry,
	BracketMatch,
	BracketRound,
	DocumentCell,
	DocumentColumn,
	DocumentSection,
	ResultDocument,
	TableDocument
} from '../types';
import { cells, flagOf, hasClass, rows, tags, text, type Cell } from './html';
import { readEach } from './reading';

/**
 * One published document, whatever it holds. Nothing here knows what a class code means or which
 * column carries a score: ianseo publishes entry lists, standings, medal tables and brackets through
 * the same two shapes, and a reader of the shapes survives a federation the app has never seen.
 */
export function parseDocument(html: string): ResultDocument | null {
	const table = tags(html, 'table')[0];
	if (!table) return null;

	if (/\btable-grid\b/.test(table.attrs)) {
		try {
			const bracket = parseBracket(table.html);
			if (bracket.rounds.some((round) => round.matches.length > 0)) return bracket;
		} catch {
			// A grid this app can no longer read as a bracket is still a table of names and numbers.
		}
		const fallback = parseTable(table.html);
		return fallback.sections.length > 0 ? fallback : parseBracket(table.html);
	}

	return parseTable(table.html);
}

/** The heading row a section is introduced by: one cell reaching across the table. */
function headingOf(row: string): string | null {
	const found = cells(row).filter((cell) => text(cell.html).length > 0);
	return found.length === 1 && found[0].header ? text(found[0].html) : null;
}

function columnsOf(row: Cell[]): DocumentColumn[] {
	return row.map((cell) => ({
		label: text(cell.html),
		// ianseo's own stylesheet drops these on a narrow screen, so they are the ones the app may fold.
		secondary: hasClass(cell.attrs, 'mobile-noshow')
	}));
}

function cellOf(cell: Cell): DocumentCell {
	return { text: text(cell.html), flag: flagOf(cell.html) };
}

function parseTable(html: string): TableDocument {
	let skipped = 0;
	let title = '';
	let base: DocumentColumn[] | null = null;
	let columns: DocumentColumn[] = [];
	let heading: string | null = null;
	let section: DocumentSection | null = null;
	const sections: DocumentSection[] = [];

	for (const group of blocks(html)) {
		if (group.name === 'thead') {
			for (const row of rows(group.html)) {
				const only = headingOf(row.html);
				if (only !== null) {
					// The first cell reaching across the table names the document; later ones open a section.
					if (title) heading = only;
					else title = only;
					section = null;
					continue;
				}
				const labels = columnsOf(cells(row.html));
				if (labels.length < 2) continue;
				// A section relabels only the columns it uses, leaving the rest to the ones at the top.
				if (base) columns = merge(base, labels);
				else base = columns = labels;
				section = null;
			}
			continue;
		}

		// Row by row, so an archer's line that cannot be read costs that line and not the whole table.
		for (const row of rows(group.html)) {
			try {
				// The secondary lines are the same row again, unfolded for a narrow screen: its detail.
				if (hasClass(row.attrs, 'results-secondary-lines')) {
					const last = section?.rows.at(-1);
					const line = text(row.html);
					if (last && line) last.detail.push(line);
					continue;
				}
				const values = cells(row.html);
				if (values.length === 0) {
					// An empty row is a spacer; one with words in it that yielded no cells is a row lost.
					if (text(row.html)) skipped++;
					continue;
				}
				if (!section) {
					section = { heading, columns, rows: [] };
					sections.push(section);
				}
				// A line narrower than the table it is in has lost something the markup no longer says.
				if (columns.length > 0 && values.length < columns.length) skipped++;
				section.rows.push({
					cells: values.map(cellOf),
					detail: [],
					// Bold is how ianseo marks a podium, and it is worth keeping when the table is redrawn.
					strong: hasClass(row.attrs, 'bold')
				});
			} catch {
				// One row lost. The archer is looking for a name, and the rest of the list still holds it.
				skipped++;
			}
		}
	}

	return {
		kind: 'table',
		title,
		skipped,
		sections: sections.filter((one) => one.rows.length > 0).map(trim)
	};
}

/** ianseo ends several of its tables with a spacer column, which is a blank one wherever it is redrawn. */
function trim(section: DocumentSection): DocumentSection {
	let width = Math.max(section.columns.length, ...section.rows.map((row) => row.cells.length));
	const empty = (at: number) =>
		!section.columns[at]?.label && section.rows.every((row) => !row.cells[at]?.text);
	while (width > 0 && empty(width - 1)) width--;

	return {
		...section,
		columns: section.columns.slice(0, width),
		rows: section.rows.map((row) => ({ ...row, cells: row.cells.slice(0, width) }))
	};
}

/** A section's own labels win where it has one, and fall back to the table's where it prints a blank. */
function merge(base: DocumentColumn[], over: DocumentColumn[]): DocumentColumn[] {
	return over.map((column, index) => (column.label ? column : (base[index] ?? column)));
}

/**
 * `<thead>` and `<tbody>` in the order they appear, which is what makes a section its rows.
 *
 * A block runs to its own closing tag, or, where the page never writes one, to the start of the next
 * block or the end of the table. ianseo publishes team standings with the `<tbody>` left open, and a
 * reader that insisted on the closing tag threw away every line of them.
 */
function blocks(html: string): { name: 'thead' | 'tbody'; html: string }[] {
	const opens = [...html.matchAll(/<(thead|tbody)\b[^>]*>/gi)];
	// A table written without either is all rows, which is how the smaller documents are published.
	if (opens.length === 0) return [{ name: 'tbody', html }];

	const found: { name: 'thead' | 'tbody'; html: string }[] = [];
	opens.forEach((open, index) => {
		const name = open[1].toLowerCase() as 'thead' | 'tbody';
		const start = open.index + open[0].length;
		const next = opens[index + 1]?.index ?? html.length;
		const close = html.slice(start, next).search(new RegExp(`</${name}\\b`, 'i'));
		found.push({ name, html: html.slice(start, close < 0 ? next : start + close) });
	});
	return found;
}

/**
 * An elimination bracket, which ianseo draws as a grid: an athlete is a run of cells side by side,
 * and the round they are in is the column that run starts at. Read by column rather than by the
 * spans in the header row, whose widths do not add up to the width of the grid below them.
 *
 * The set scores of a match are drawn as a little table of their own, in a row of its own just below
 * the two athletes it belongs to. They are matched to a match by where they sit rather than by
 * counting: a draw with byes in it has fewer sets than matches, and counting hands one archer's
 * arrows to another.
 */
function parseBracket(html: string): BracketDocument {
	let skipped = 0;
	const all = rows(html);
	const title = all.length > 0 ? (headingOf(all[0].html) ?? '') : '';

	const titles: string[] = [];
	const entries = new Map<number, { row: number; entry: BracketEntry }[]>();
	const tables: { row: number; column: number; sets: string[][] }[] = [];

	all.slice(1).forEach((row, at) => {
		let values: Cell[];
		try {
			values = cells(row.html);
		} catch {
			// A line of the grid lost, which costs a match rather than the whole draw.
			skipped++;
			return;
		}
		if (values.length > 0 && values.every((cell) => cell.header || text(cell.html) === '')) {
			for (const cell of values) {
				const label = text(cell.html);
				if (cell.header && label) titles.push(label);
			}
		}

		values.forEach((cell, column) => {
			for (const nested of cell.nested) {
				const sets = rows(nested).map((line) => cells(line.html).map((score) => text(score.html)));
				if (sets.length > 0) tables.push({ row: at, column, sets });
			}
		});

		let index = 0;
		while (index < values.length) {
			if (!hasClass(values[index].attrs, 'data-cell')) {
				index++;
				continue;
			}
			const start = index;
			while (index < values.length && hasClass(values[index].attrs, 'data-cell')) index++;
			entries.set(start, [
				...(entries.get(start) ?? []),
				{ row: at, entry: entryOf(values.slice(start, index)) }
			]);
		}
	});

	const columns = [...entries.keys()].sort((a, b) => a - b);
	/** Where each match starts on the grid, which is how its own set scores are recognised below it. */
	const rounds = columns.map((column, index) => ({
		title: titles[index] ?? '',
		matches: pair(entries.get(column) ?? [])
	}));

	// A match's own set scores are the ones drawn below it and above the match after it. The first
	// round's sit inside the width its full names take up, which is why the column is only a floor.
	for (const table of tables) {
		const round = columns.filter((column) => column <= table.column).at(-1);
		if (round === undefined) continue;
		const matches = rounds[columns.indexOf(round)].matches;
		const mine = matches.filter((match) => match.startRow <= table.row).at(-1);
		if (mine && mine.sets.length === 0) mine.sets = table.sets;
	}

	const shown: BracketRound[] = rounds.map((round) => ({
		title: round.title,
		matches: round.matches.map((match) => ({ entries: match.entries, sets: match.sets }))
	}));
	return { kind: 'bracket', title, skipped, rounds: shown };
}

/** Six cells where the bracket names an athlete in full, two where it only carries them forward. */
function entryOf(run: Cell[]): BracketEntry {
	const value = (cell: Cell | undefined) => {
		const found = cell ? text(cell.html) : '';
		return found.length > 0 ? found : null;
	};
	if (run.length < 4) {
		return { seed: null, name: value(run[0]) ?? '', country: null, club: null, score: value(run[1]) };
	}
	return {
		seed: value(run[0]),
		name: value(run[1]) ?? '',
		country: run[2] ? flagOf(run[2].html) : null,
		club: value(run[4]),
		score: value(run.at(-1))
	};
}

/** Two entries to a match, in the order the grid stacks them, dropping the slots nobody reached. */
function pair(entries: { row: number; entry: BracketEntry }[]): (BracketMatch & { startRow: number })[] {
	const matches: (BracketMatch & { startRow: number })[] = [];
	for (let index = 0; index < entries.length; index += 2) {
		const both = entries.slice(index, index + 2);
		if (both.some((one) => one.entry.name.length > 0)) {
			matches.push({ entries: both.map((one) => one.entry), sets: [], startRow: both[0].row });
		}
	}
	return matches;
}
