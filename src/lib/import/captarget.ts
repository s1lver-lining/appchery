/**
 * Reading a CapTarget export.
 *
 * CapTarget is another archery app, and this reads the workbook it exports so an archer arriving
 * with years of scores does not start at zero. Its format is nobody's standard and nobody here
 * controls it: sheets get renamed, columns get added, headers turn French, an id disappears, a
 * number arrives as "4,94" instead of "4.94". So this module assumes nothing about position or
 * spelling and asserts nothing it can avoid asserting.
 *
 * The rules it works by:
 *
 *  - Sheets are recognised by the columns they carry, never by their name or their order.
 *  - Columns are matched through an alias table over a normalised header, so `trainingDate`,
 *    `training date` and `dateEntrainement` are one column.
 *  - A row that cannot be read is dropped with a counted warning; it never stops the import.
 *  - Anything derivable is derived. Ends missing from the file are worked out from the arrows,
 *    a session missing from the file is invented to hold its orphaned rounds.
 *  - Coordinates are only kept when their scale can be proved against the scores beside them,
 *    because a plotted arrow in the wrong unit is worse than no plot at all.
 *
 * The result is a plan: a plain description of what would be written, which the repository applies
 * and the tests can check without a database.
 */

import type { RoundDefinition } from '$lib/domain/rounds/types';
import { WA_10_RING } from '$lib/domain/rounds/seed';
import { scoreAt } from '$lib/domain/rounds/geometry';
import { FREE_SCORE_KIND } from '$lib/domain/freeScore';
import { LIMITS, safeCount, safeText } from './limits';

export interface ImportedShot {
	value: number;
	zoneLabel: string;
	x: number | null;
	y: number | null;
}

export interface ImportedEnd {
	endNo: number;
	shots: ImportedShot[];
}

export interface ImportedActivity {
	/** Stable across re-imports, so importing the same file twice replaces rather than duplicates. */
	externalId: string;
	/**
	 * scoring for a round the export carried the arrows of, freeScore for one it only carried a
	 * total for. The second is not a round and must never be written as one, see
	 * src/lib/domain/freeScore.ts.
	 */
	kind: 'scoring' | typeof FREE_SCORE_KIND;
	startedAt: number;
	round: RoundDefinition;
	ends: ImportedEnd[];
	/**
	 * The total CapTarget recorded, kept only when the file has no arrows to add up. A round with
	 * arrows always totals its own arrows, so a disagreement resolves in favour of what was shot.
	 */
	reportedTotal: number | null;
	reportedArrows: number;
	notes: string | null;
}

export interface ImportedSession {
	externalId: string;
	startedAt: number;
	/** practice | competition */
	kind: string;
	label: string | null;
	notes: string | null;
	/** Arrows shot in the session that no round accounts for: warm ups, volume, blank bale. */
	trainingArrows: number;
	/** Everything the session counted, scored or not, as the export reported it. */
	totalArrows: number;
	/** The part of that total that was shot at a score, when the export says. */
	countedArrows: number | null;
	/**
	 * Exercises the export named but kept no arrows and no score for. Nothing can be written for
	 * them, so they are counted and said out loud rather than silently dropped.
	 */
	unrecordedExercises: number;
	activities: ImportedActivity[];
}

export type WarningCode =
	| 'noSessionSheet'
	| 'unreadableRow'
	| 'undatedRow'
	| 'orphanRow'
	| 'droppedCoordinates'
	| 'unknownSheet';

export interface ImportWarning {
	code: WarningCode;
	count: number;
	/** A sheet name or a row identifier, to make the warning traceable back to the file. */
	detail?: string;
}

export interface CapTargetPlan {
	sessions: ImportedSession[];
	warnings: ImportWarning[];
	/** What was found, for the confirmation the archer is shown before anything is written. */
	summary: { sessions: number; rounds: number; arrows: number; from: number | null; to: number | null };
}

export class CapTargetError extends Error {}

/* Header handling */

/** Lowercase, unaccented, letters and digits only: `Date entraînement` and `trainingDate` collide. */
export function normaliseHeader(header: string): string {
	return header
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

/**
 * Every spelling of a field this importer has seen or can reasonably expect, in English and French.
 * Adding a synonym here is the cheapest possible fix when a future export renames something.
 */
const ALIASES: Record<string, string[]> = {
	date: ['trainingdate', 'date', 'dateentrainement', 'datedelaseance', 'sessiondate', 'day'],
	id: ['id', 'identifiant', 'uid', 'key'],
	sessionId: ['idtraining', 'trainingid', 'idseance', 'sessionid', 'idsession', 'parentid'],
	isCompetition: ['iscompetition', 'competition', 'compet', 'isacompetition'],
	isIndoor: ['isindoor', 'indoor', 'salle', 'ensalle'],
	distance: ['distance', 'dist', 'distancem', 'distancemetres'],
	faceSize: ['blazon', 'blason', 'blazonsize', 'blasonsize', 'facesize', 'face', 'taillleblason', 'tailleblason'],
	total: ['total', 'score', 'totalscore', 'points'],
	arrowList: ['arrows', 'fleches', 'arrowlist', 'shots', 'impacts'],
	arrowsPerEnd: ['arrows', 'arrowsperend', 'flechesparvolee', 'nbfleches'],
	ends: ['salves', 'volees', 'ends', 'nbvolees', 'series'],
	rounds: ['rounds', 'manches', 'nbmanches'],
	title: ['title', 'titre', 'name', 'nom', 'label', 'libelle'],
	totalArrows: ['totalarrows', 'totalfleches', 'nbtotalfleches', 'arrowstotal'],
	countedArrows: ['totalcounted', 'totalcomptage', 'countedarrows'],
	notes: ['notes', 'note', 'comment', 'commentaire', 'observations'],
	temperature: ['temperature', 'temp'],
	player1: ['player1name', 'joueur1nom', 'player1'],
	criteria: ['scorecriteria1', 'scorecriteria2', 'scorecriteria3']
};

type Row = Record<string, string>;

/** A sheet with its headers resolved once, so every read is a map lookup rather than a scan. */
interface Table {
	name: string;
	rows: Row[];
	/** Normalised header to the header as written. */
	byNormalised: Map<string, string>;
}

function toTable(sheet: { name: string; headers: string[]; rows: Row[] }): Table {
	const byNormalised = new Map<string, string>();
	for (const header of sheet.headers) {
		const key = normaliseHeader(header);
		// First spelling wins, so a duplicated header cannot shadow the column that has the data.
		if (key && !byNormalised.has(key)) byNormalised.set(key, header);
	}
	return { name: sheet.name, rows: sheet.rows, byNormalised };
}

function has(table: Table, field: keyof typeof ALIASES): boolean {
	return column(table, field) !== null;
}

function column(table: Table, field: keyof typeof ALIASES): string | null {
	for (const alias of ALIASES[field]) {
		const header = table.byNormalised.get(alias);
		if (header) return header;
	}
	return null;
}

function cell(table: Table, row: Row, field: keyof typeof ALIASES): string {
	const header = column(table, field);
	// Bounded here rather than at each caller: everything read out of the file comes through this.
	return header ? safeText(row[header] ?? '') : '';
}

/** What becomes part of a row id, which is shorter than free text and never shown to anybody. */
function idCell(table: Table, row: Row, field: keyof typeof ALIASES): string {
	return safeText(cell(table, row, field), LIMITS.idChars);
}

/* Value parsing */

/** Numbers arrive as `4.94`, `4,94`, `1 234`, or as nothing at all. */
export function toNumber(raw: string): number | null {
	if (!raw) return null;
	const cleaned = raw.replace(/\s/g, '').replace(',', '.');
	const value = Number(cleaned);
	return Number.isFinite(value) ? value : null;
}

export function toBoolean(raw: string): boolean {
	const value = raw.trim().toLowerCase();
	return value === '1' || value === 'true' || value === 'yes' || value === 'oui' || value === 'vrai';
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * A date, from any of the shapes a spreadsheet hands one over in: an ISO string, a day-first or
 * month-first slash date, or the serial number a cell holds when nobody formatted it.
 *
 * Midday local, not midnight: CapTarget records the day, not the time, and a session pinned to
 * midnight lands on the previous day in any timezone behind UTC once anything converts it.
 */
export function toTimestamp(raw: string): number | null {
	if (!raw) return null;

	const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
	if (iso) return atMidday(Number(iso[1]), Number(iso[2]), Number(iso[3]));

	const slashed = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
	if (slashed) {
		const first = Number(slashed[1]);
		const second = Number(slashed[2]);
		// CapTarget is French, so day first is the reading unless the first number cannot be a day.
		const dayFirst = first > 12 || second <= 12;
		return dayFirst
			? atMidday(Number(slashed[3]), second, first)
			: atMidday(Number(slashed[3]), first, second);
	}

	const serial = toNumber(raw);
	// Bounded to 1970..2100 as serials so a stray count in a date column is refused rather than
	// silently placed in the 1900s.
	if (serial !== null && serial > 25_000 && serial < 75_000) {
		return EXCEL_EPOCH + Math.round(serial * 86_400_000) + 12 * 3_600_000;
	}

	const parsed = Date.parse(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

function atMidday(year: number, month: number, day: number): number | null {
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	const date = new Date(year, month - 1, day, 12, 0, 0, 0);
	return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

/* Arrow lists */

interface ParsedArrow {
	value: number;
	label: string;
	x: number | null;
	y: number | null;
}

/**
 * `10:0:0,9:16.137:8.022,M` and every near miss of it. Separators, ordering of the coordinates and
 * the spelling of a miss all vary between exports, so each arrow is read on its own terms and a
 * token that means nothing is skipped rather than scored as zero: a phantom zero would drag an
 * average down for years.
 */
export function parseArrows(raw: string): ParsedArrow[] {
	if (!raw) return [];
	const arrows: ParsedArrow[] = [];
	for (const token of raw.split(/[,;|\n]+/).slice(0, LIMITS.arrowsPerActivity)) {
		const trimmed = token.trim();
		if (!trimmed) continue;
		const parts = trimmed.split(':');
		const head = parts[0].trim().toUpperCase();

		let value: number;
		let label: string;
		if (head === 'X' || head === 'X10' || head === '10X') {
			value = 10;
			label = 'X';
		} else if (head === 'M' || head === '0' || head === 'MISS' || head === '-') {
			value = 0;
			label = 'M';
		} else {
			const parsed = toNumber(head);
			if (parsed === null || parsed < 0 || parsed > 20) continue;
			value = Math.round(parsed);
			label = String(value);
		}

		const x = parts.length > 1 ? toNumber(parts[1].trim()) : null;
		const y = parts.length > 2 ? toNumber(parts[2].trim()) : null;
		arrows.push({ value, label, x, y });
	}
	return arrows;
}

/**
 * What the coordinates are measured in, worked out from the file rather than assumed.
 *
 * CapTarget writes plots in some unit relative to some face, and neither is stated anywhere in the
 * export. Rather than guess, each candidate scale is scored by how often the ring it implies agrees
 * with the value recorded next to it, and the winner has to agree on most arrows. When nothing
 * agrees the plots are dropped and the scores are kept: a score is the fact, a plot is a detail.
 */
export function chooseScale(
	arrows: ParsedArrow[],
	faceSizeCm: number
): { divisor: number; agreement: number } | null {
	const plotted = arrows.filter((a) => a.x !== null && a.y !== null && (a.x !== 0 || a.y !== 0));
	if (plotted.length < 3) return null;

	const radiusMm = (faceSizeCm > 0 ? faceSizeCm : 122) * 5;
	const candidates = [
		1, // already normalised to the unit circle
		radiusMm, // millimetres from the centre
		radiusMm / 10, // centimetres
		100, // percent of the radius
		radiusMm * 2 // millimetres, measured against the diameter
	];

	let best: { divisor: number; agreement: number; error: number } | null = null;
	for (const divisor of candidates) {
		if (!Number.isFinite(divisor) || divisor <= 0) continue;
		let agreed = 0;
		let error = 0;
		for (const arrow of plotted) {
			const zone = scoreAt(WA_10_RING, arrow.x! / divisor, arrow.y! / divisor);
			const off = Math.abs(zone.value - arrow.value);
			// Within one ring, because the line-cutting rule and rounding put honest plots a ring out.
			if (off <= 1) agreed++;
			error += off;
		}
		const agreement = agreed / plotted.length;
		const candidate = { divisor, agreement, error: error / plotted.length };
		// Two scales can both land every arrow within a ring, and then the one that lands them on
		// their own ring is the real unit. Ties are common because the middle of a face is small.
		if (!best || agreement > best.agreement || (agreement === best.agreement && candidate.error < best.error)) {
			best = candidate;
		}
	}
	return best && best.agreement >= 0.7 ? { divisor: best.divisor, agreement: best.agreement } : null;
}

/* Sheet recognition */

type Role = 'sessions' | 'shoots' | 'situations' | 'matches' | 'arrows';

/**
 * Which sheet is which, decided on the columns present. Names are a bad key: they are localised,
 * they get renamed between versions, and a workbook saved through another tool may lose them
 * altogether. Columns are what the importer actually needs, so columns are what it looks for.
 */
function classify(tables: Table[]): Map<Role, Table> {
	const score = (table: Table, role: Role): number => {
		const hasArrowList = has(table, 'arrowList') && looksLikeArrowList(table);
		switch (role) {
			case 'arrows':
				return hasArrowList ? 3 + (has(table, 'sessionId') ? 1 : 0) : 0;
			case 'sessions':
				// The only sheet whose rows are the sessions themselves: an id but no parent id.
				if (has(table, 'sessionId') || hasArrowList) return 0;
				return (
					(has(table, 'totalArrows') ? 2 : 0) +
					(has(table, 'isCompetition') ? 1 : 0) +
					(has(table, 'isIndoor') ? 1 : 0) +
					(has(table, 'date') ? 1 : 0)
				);
			case 'matches':
				return has(table, 'player1') ? 4 : 0;
			case 'situations':
				if (!has(table, 'sessionId') || hasArrowList) return 0;
				return has(table, 'criteria') ? 4 : 0;
			case 'shoots':
				if (!has(table, 'sessionId') || hasArrowList || has(table, 'player1')) return 0;
				return (
					(has(table, 'total') ? 2 : 0) +
					(has(table, 'ends') ? 1 : 0) +
					(has(table, 'faceSize') ? 1 : 0) -
					(has(table, 'criteria') ? 2 : 0)
				);
		}
	};

	const roles: Role[] = ['arrows', 'sessions', 'matches', 'situations', 'shoots'];
	const assigned = new Map<Role, Table>();
	const taken = new Set<Table>();
	// Each role takes its best remaining sheet, strongest signal first, so a sheet cannot be two
	// things and an unrecognised sheet is simply left alone.
	for (const role of roles) {
		let best: { table: Table; score: number } | null = null;
		for (const table of tables) {
			if (taken.has(table) || table.rows.length === 0) continue;
			const value = score(table, role);
			if (value > 0 && (!best || value > best.score)) best = { table, score: value };
		}
		if (best) {
			assigned.set(role, best.table);
			taken.add(best.table);
		}
	}
	return assigned;
}

/** An arrows column holds `8:0:0,7:0:0,…`; a same-named column on another sheet holds `6`. */
function looksLikeArrowList(table: Table): boolean {
	const header = column(table, 'arrowList');
	if (!header) return false;
	for (const row of table.rows.slice(0, 20)) {
		const value = (row[header] ?? '').trim();
		if (!value) continue;
		if (/[,:]/.test(value) && parseArrows(value).length > 1) return true;
	}
	// A column of bare numbers under the same name is an arrow count, not an arrow list.
	return false;
}

/* Planning */

const MAX_FACE = 200;
const MAX_DISTANCE = 300;

export interface PlanOptions {
	/** Overridable so tests are not tied to the clock. */
	now?: number;
}

export function planCapTargetImport(
	sheets: { name: string; headers: string[]; rows: Row[] }[],
	options: PlanOptions = {}
): CapTargetPlan {
	const tables = sheets.map(toTable).filter((t) => t.rows.length > 0);
	const roles = classify(tables);
	const warnings = new WarningLog();

	for (const table of tables) {
		if (![...roles.values()].includes(table)) warnings.add('unknownSheet', table.name);
	}

	const arrowsById = readArrowLists(roles.get('arrows'));
	const sessions = readSessions(roles.get('sessions'), warnings);
	if (!roles.get('sessions')) warnings.add('noSessionSheet');

	/** Exercises the export mentions but keeps no arrows for, counted per session. */
	const unrecorded = new Map<string, number>();
	const rounds = [
		...readShoots(roles.get('shoots'), arrowsById, warnings, 'shoot', unrecorded),
		...readShoots(roles.get('situations'), arrowsById, warnings, 'situation', unrecorded),
		...readShoots(roles.get('matches'), arrowsById, warnings, 'match', unrecorded)
	];

	// Rounds whose session is not in the file still happened, so they get one of their own rather
	// than being dropped: a missing parent row is a hole in the export, not in the archer's year.
	for (const round of rounds) {
		let session = sessions.get(round.sessionKey);
		if (!session) {
			if (round.sessionKey) warnings.add('orphanRow', round.externalId);
			const key = round.sessionKey || `orphan-${round.externalId}`;
			session = {
				externalId: key,
				startedAt: round.activity.startedAt,
				kind: 'practice',
				label: null,
				notes: null,
				trainingArrows: 0,
				totalArrows: 0,
				countedArrows: null,
				unrecordedExercises: 0,
				activities: []
			};
			sessions.set(key, session);
		}
		// A session cannot hold more rounds than an archer could shoot in a day many times over.
		if (session.activities.length < LIMITS.activitiesPerSession) session.activities.push(round.activity);
		// A session dated later than its own rounds, or not dated at all, takes their date.
		if (!Number.isFinite(session.startedAt)) session.startedAt = round.activity.startedAt;
	}

	const list = [...sessions.values()].slice(0, LIMITS.sessions);
	for (const session of list) {
		session.activities.sort((a, b) => a.startedAt - b.startedAt);
		shareOutArrows(session);
		session.unrecordedExercises = unrecorded.get(session.externalId) ?? 0;
	}
	list.sort((a, b) => a.startedAt - b.startedAt);

	const arrows = list.reduce(
		(sum, s) => sum + s.trainingArrows + s.activities.reduce((n, a) => n + countArrows(a), 0),
		0
	);
	const dates = list.map((s) => s.startedAt).filter(Number.isFinite);

	return {
		sessions: list,
		warnings: warnings.list(),
		summary: {
			sessions: list.length,
			rounds: list.reduce((n, s) => n + s.activities.length, 0),
			arrows,
			from: dates.length ? Math.min(...dates) : null,
			to: dates.length ? Math.max(...dates) : null
		}
	};
}

/**
 * How many arrows each round was shot with, and how many the session has left over.
 *
 * CapTarget records two kinds of round. One carries its arrows, and there is nothing to work out.
 * The other, free plotting and whatever else it counts as a "situation", carries a score and
 * nothing else, because the export leaves the arrows behind. Those rounds still happened, and their
 * arrows are still in the session's own counters, so the counters are what they are recovered from:
 * the session says how many arrows were shot at a score, the rounds that carry their arrows account
 * for some of them, and the rest belongs to the rounds that do not.
 *
 * A round with no arrows at all was scoring 62 points over six invented ones before this, which is
 * a thing no archer has ever done. The arrows it gets now are shared out in proportion to what each
 * round scored, and never fewer than the score needs: ten points an arrow is the ceiling.
 */
function shareOutArrows(session: ImportedSession) {
	const detailed = session.activities.filter((a) => a.ends.length > 0);
	const scoreOnly = session.activities.filter((a) => a.ends.length === 0);
	const accounted = detailed.reduce((sum, a) => sum + countArrows(a), 0);

	// The counted total is the arrows that were shot at a score, which is exactly this pool. It is
	// not always filled in, and then the session's whole total is all there is to work from.
	const pool = Math.max(0, (session.countedArrows ?? session.totalArrows) - accounted);

	const floors = scoreOnly.map((a) => Math.max(1, Math.ceil((a.reportedTotal ?? 0) / 10)));
	const totals = scoreOnly.map((a) => Math.max(a.reportedTotal ?? 0, 1));
	const weight = totals.reduce((sum, value) => sum + value, 0);
	const spare = Math.max(0, pool - floors.reduce((sum, value) => sum + value, 0));

	scoreOnly.forEach((activity, index) => {
		const share = weight > 0 ? Math.round((spare * totals[index]) / weight) : 0;
		activity.reportedArrows = safeCount(floors[index] + share, LIMITS.arrowsPerActivity);
		reshapeRound(activity);
	});

	const scored = session.activities.reduce((sum, a) => sum + countArrows(a), 0);
	session.trainingArrows = Math.max(0, session.totalArrows - scored);
}

/** A round whose arrow count was worked out afterwards has to describe that many arrows. */
function reshapeRound(activity: ImportedActivity) {
	const [stage] = activity.round.stages;
	if (!stage) return;
	const arrowsPerEnd = Math.min(stage.arrowsPerEnd, activity.reportedArrows) || 1;
	stage.arrowsPerEnd = arrowsPerEnd;
	stage.ends = Math.max(1, Math.ceil(activity.reportedArrows / arrowsPerEnd));
}

function countArrows(activity: ImportedActivity): number {
	const shot = activity.ends.reduce((n, e) => n + e.shots.length, 0);
	return shot > 0 ? shot : activity.reportedArrows;
}

class WarningLog {
	private counts = new Map<string, ImportWarning>();

	add(code: WarningCode, detail?: string) {
		const key = `${code}:${detail ?? ''}`;
		const existing = this.counts.get(key);
		if (existing) existing.count++;
		else this.counts.set(key, { code, count: 1, detail });
	}

	list(): ImportWarning[] {
		return [...this.counts.values()];
	}
}

function readArrowLists(table: Table | undefined): Map<string, ParsedArrow[]> {
	const byId = new Map<string, ParsedArrow[]>();
	if (!table) return byId;
	const header = column(table, 'arrowList');
	if (!header) return byId;

	for (const row of table.rows) {
		const id = idCell(table, row, 'id');
		const arrows = parseArrows(row[header] ?? '');
		if (!id || arrows.length === 0) continue;
		// A repeated id means the export split one round over several rows, so they are joined.
		const existing = byId.get(id);
		if (existing) existing.push(...arrows);
		else byId.set(id, arrows);
	}
	return byId;
}

function readSessions(table: Table | undefined, warnings: WarningLog): Map<string, ImportedSession> {
	const sessions = new Map<string, ImportedSession>();
	if (!table) return sessions;

	for (const row of table.rows) {
		try {
			const startedAt = toTimestamp(cell(table, row, 'date'));
			if (startedAt === null) {
				warnings.add('undatedRow', table.name);
				continue;
			}
			const id = idCell(table, row, 'id') || `date-${startedAt}-${sessions.size}`;
			const distance = toNumber(cell(table, row, 'distance'));
			const indoorColumn = column(table, 'isIndoor');
			const indoor = indoorColumn ? toBoolean(row[indoorColumn] ?? '') : null;

			sessions.set(id, {
				externalId: id,
				startedAt,
				kind: toBoolean(cell(table, row, 'isCompetition')) ? 'competition' : 'practice',
				label: cell(table, row, 'title') || null,
				notes: sessionNotes(distance, indoor, cell(table, row, 'notes')),
				trainingArrows: 0,
				totalArrows: safeCount(toNumber(cell(table, row, 'totalArrows')), LIMITS.arrows),
				countedArrows: countedArrows(table, row),
				unrecordedExercises: 0,
				activities: []
			});
		} catch {
			warnings.add('unreadableRow', table.name);
		}
	}
	return sessions;
}

/** Null rather than zero when the column is absent, because absent and none are different facts. */
function countedArrows(table: Table, row: Row): number | null {
	if (!has(table, 'countedArrows')) return null;
	const value = toNumber(cell(table, row, 'countedArrows'));
	return value === null ? null : safeCount(value, LIMITS.arrows);
}

/**
 * The conditions CapTarget records are coded numbers whose meaning is not published anywhere, so
 * they are left out rather than decoded wrongly. What survives is what reads plainly.
 */
function sessionNotes(distance: number | null, indoor: boolean | null, notes: string): string | null {
	const parts: string[] = [];
	if (notes) parts.push(notes);
	const conditions: string[] = [];
	if (distance !== null && distance > 0 && distance <= MAX_DISTANCE) conditions.push(`${distance}m`);
	if (indoor !== null) conditions.push(indoor ? 'indoor' : 'outdoor');
	if (conditions.length) parts.push(`CapTarget · ${conditions.join(' · ')}`);
	return parts.length ? parts.join('\n') : null;
}

interface PlannedRound {
	sessionKey: string;
	externalId: string;
	activity: ImportedActivity;
}

function readShoots(
	table: Table | undefined,
	arrowsById: Map<string, ParsedArrow[]>,
	warnings: WarningLog,
	prefix: string,
	unrecorded: Map<string, number>
): PlannedRound[] {
	if (!table) return [];
	const planned: PlannedRound[] = [];

	table.rows.forEach((row, index) => {
		try {
			if (planned.length >= LIMITS.sessions * 4) return;
			const externalId = idCell(table, row, 'id') || `${prefix}-${index}`;
			const startedAt = toTimestamp(cell(table, row, 'date'));
			if (startedAt === null) {
				warnings.add('undatedRow', table.name);
				return;
			}

			const raw = arrowsById.get(externalId) ?? [];
			const total = toNumber(cell(table, row, 'total'));
			const reportedTotal = total === null ? null : safeCount(total, LIMITS.score);
			const faceSize = clamp(toNumber(cell(table, row, 'faceSize')), 10, MAX_FACE, 122);
			const rawDistance = toNumber(cell(table, row, 'distance'));
			const distance = rawDistance !== null && rawDistance > 0 && rawDistance <= MAX_DISTANCE
				? Math.round(rawDistance)
				: null;

			// The end size is read from the whole list, because the ends nobody shot are still declared.
			const arrowsPerEnd = endSize(table, row, raw.length);
			const arrows = trimEmptyEnds(raw, arrowsPerEnd);

			// An exercise the export lists without arrows and without a score: an in-or-out drill, a
			// stay-in-the-zone game. CapTarget keeps no count of those arrows anywhere in the file,
			// not even in the session's own totals, so there is nothing to import but the fact that
			// it happened, which is recorded on the session rather than invented as an activity.
			if (arrows.length === 0 && (reportedTotal === null || reportedTotal === 0)) {
				const key = idCell(table, row, 'sessionId');
				if (key) unrecorded.set(key, (unrecorded.get(key) ?? 0) + 1);
				return;
			}

			const ends = groupEnds(arrows, arrowsPerEnd, faceSize, warnings);
			const endCount = Math.max(
				ends.length,
				clamp(toNumber(cell(table, row, 'ends')), 1, 60, ends.length || 1)
			);

			planned.push({
				sessionKey: idCell(table, row, 'sessionId'),
				externalId,
				activity: {
					externalId: `${prefix}-${externalId}`,
					// Arrows make it a round; a bare total makes it scoring of a kind that has no ends.
					kind: ends.length > 0 ? 'scoring' : FREE_SCORE_KIND,
					startedAt,
					round: buildRound(cell(table, row, 'title'), distance, faceSize, endCount, arrowsPerEnd),
					ends,
					reportedTotal: ends.length === 0 ? reportedTotal : null,
					reportedArrows: arrows.length,
					notes: cell(table, row, 'notes') || null
				}
			});
		} catch {
			warnings.add('unreadableRow', table.name);
		}
	});

	return planned;
}

/**
 * An unfinished round is exported at its full length, with the ends nobody shot written out as
 * zeros. Scored as misses they cost the archer an average for the rest of their life, and there is
 * no way to shoot 111 with 42 arrows and then keep going.
 *
 * Whole ends only, and only unplotted zeros. A round that ends on a genuine miss loses nothing,
 * because one zero at the end of a shot end is a zero somebody shot; six of them in a row are an
 * end that never happened. The trim never changes a score either way.
 */
function trimEmptyEnds(arrows: ParsedArrow[], arrowsPerEnd: number): ParsedArrow[] {
	if (arrowsPerEnd < 1) return arrows;
	let end = arrows.length;
	while (end >= arrowsPerEnd) {
		const last = arrows.slice(end - arrowsPerEnd, end);
		const empty = last.every((a) => a.value === 0 && (a.x ?? 0) === 0 && (a.y ?? 0) === 0);
		if (!empty) break;
		end -= arrowsPerEnd;
	}
	return end === arrows.length ? arrows : arrows.slice(0, end);
}

/**
 * How many arrows an end held. The file usually says; when it does not, or says something that
 * cannot be true, the shape of the round gives it away, and six is the last resort because six is
 * what target archery shoots.
 */
function endSize(table: Table, row: Row, total: number): number {
	const stated = toNumber(cell(table, row, 'arrowsPerEnd'));
	if (stated !== null && stated >= 1 && stated <= 12 && (total === 0 || total % stated === 0)) {
		return Math.round(stated);
	}
	const ends = toNumber(cell(table, row, 'ends'));
	if (ends !== null && ends >= 1 && total > 0 && total % ends === 0) return total / ends;
	if (total > 0) {
		for (const size of [6, 3, 5, 4, 12, 2, 1]) if (total % size === 0) return size;
	}
	return 6;
}

function groupEnds(
	arrows: ParsedArrow[],
	arrowsPerEnd: number,
	faceSize: number,
	warnings: WarningLog
): ImportedEnd[] {
	if (arrows.length === 0) return [];
	const scale = chooseScale(arrows, faceSize);
	if (!scale && arrows.some((a) => (a.x ?? 0) !== 0 || (a.y ?? 0) !== 0)) {
		warnings.add('droppedCoordinates');
	}

	const ends: ImportedEnd[] = [];
	for (let at = 0; at < arrows.length; at += arrowsPerEnd) {
		const slice = arrows.slice(at, at + arrowsPerEnd);
		ends.push({
			endNo: ends.length + 1,
			shots: slice.map((arrow) => {
				const plotted =
					scale !== null && arrow.x !== null && arrow.y !== null && (arrow.x !== 0 || arrow.y !== 0);
				return {
					value: arrow.value,
					zoneLabel: arrow.label,
					x: plotted ? arrow.x! / scale!.divisor : null,
					y: plotted ? arrow.y! / scale!.divisor : null
				};
			})
		});
	}
	return ends;
}

function buildRound(
	title: string,
	distance: number | null,
	faceSize: number,
	ends: number,
	arrowsPerEnd: number
): RoundDefinition {
	const name =
		title.trim() ||
		`${distance ? `${distance}m · ` : ''}${faceSize}cm · ${ends}x${arrowsPerEnd}`;
	return {
		// Deterministic from the shape, so two imported rounds of the same shape group together in
		// the stats the way two custom rounds shot on the app do.
		id: `captarget-${distance ?? 'x'}-${faceSize}-${ends}x${arrowsPerEnd}`,
		name,
		discipline: 'custom',
		scoreSetId: WA_10_RING.id,
		isBuiltin: false,
		stages: [
			{
				distance: distance ? { value: distance, unit: 'm' } : null,
				faceSize,
				ends,
				arrowsPerEnd
			}
		]
	};
}

function clamp(value: number | null, min: number, max: number, fallback: number): number {
	if (value === null || !Number.isFinite(value) || value < min || value > max) return fallback;
	return Math.round(value);
}
