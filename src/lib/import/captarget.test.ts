import { describe, it, expect } from 'vitest';
import {
	planCapTargetImport,
	parseArrows,
	toTimestamp,
	toNumber,
	toBoolean,
	normaliseHeader,
	chooseScale
} from './captarget';

/**
 * The importer's job is to survive a file it did not specify, so most of what is tested here is
 * damage: renamed sheets, French headers, missing columns, orphaned rows, junk in a cell. The
 * happy path is one test; the rest is the point.
 */

type Sheet = { name: string; headers: string[]; rows: Record<string, string>[] };

function sheet(name: string, headers: string[], rows: (string | number)[][]): Sheet {
	return {
		name,
		headers,
		rows: rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? '')])))
	};
}

const SESSIONS = () =>
	sheet(
		'Sessions',
		['trainingDate', 'distance', 'isCompetition', 'isIndoor', 'totalArrows', 'id'],
		[
			['2026-06-19', 50, 0, 0, 100, 'sess-1'],
			['2026-06-28', 50, 1, 0, 72, 'sess-2']
		]
	);

const SHOOTS = () =>
	sheet(
		'Counted shoots',
		['trainingDate', 'total', 'blazon', 'distance', 'id', 'idTraining', 'salves', 'arrows'],
		[
			['2026-06-19', 60, 122, 50, 'shoot-1', 'sess-1', 2, 3],
			['2026-06-28', 72, 122, 50, 'shoot-2', 'sess-2', 2, 6]
		]
	);

const ARROWS = () =>
	sheet(
		'Arrows',
		['date', 'id', 'idTraining', 'title', 'arrows'],
		[
			['2026-06-19', 'shoot-1', 'sess-1', '', '10:0:0,10:0:0,10:0:0,10:0:0,10:0:0,10:0:0'],
			[
				'2026-06-28',
				'shoot-2',
				'sess-2',
				'',
				'8:0:0,7:0:0,6:0:0,6:0:0,5:0:0,4:0:0,8:0:0,7:0:0,6:0:0,6:0:0,5:0:0,4:0:0'
			]
		]
	);

describe('planCapTargetImport', () => {
	it('reads sessions, rounds and arrows out of a whole export', () => {
		const plan = planCapTargetImport([SESSIONS(), SHOOTS(), ARROWS()]);

		expect(plan.summary.sessions).toBe(2);
		expect(plan.summary.rounds).toBe(2);

		const [first, second] = plan.sessions;
		expect(first.kind).toBe('practice');
		expect(second.kind).toBe('competition');
		// Six arrows in three-arrow ends, as the file says, rather than the round's nominal shape.
		expect(first.activities[0].ends.map((e) => e.shots.length)).toEqual([3, 3]);
		expect(second.activities[0].ends.map((e) => e.shots.length)).toEqual([6, 6]);
	});

	it('counts the session arrows the rounds do not account for as volume shooting', () => {
		const plan = planCapTargetImport([SESSIONS(), SHOOTS(), ARROWS()]);
		// 100 arrows in the session, 6 of them scored.
		expect(plan.sessions[0].trainingArrows).toBe(94);
		// 72 recorded, 12 scored.
		expect(plan.sessions[1].trainingArrows).toBe(60);
	});

	it('never counts an arrow twice in the summary', () => {
		const plan = planCapTargetImport([SESSIONS(), SHOOTS(), ARROWS()]);
		expect(plan.summary.arrows).toBe(100 + 72);
	});

	it('recognises the sheets by their columns, whatever they are called or ordered', () => {
		const scrambled = [ARROWS(), SHOOTS(), SESSIONS()].map((s, i) => ({ ...s, name: `Feuille${i}` }));
		const plan = planCapTargetImport(scrambled);
		expect(plan.summary.rounds).toBe(2);
		expect(plan.summary.sessions).toBe(2);
	});

	it('reads French headers', () => {
		const sessions = sheet(
			'Séances',
			['Date entraînement', 'Distance', 'Compétition', 'Total flèches', 'Identifiant'],
			[['19/06/2026', 50, 'oui', 30, 'sess-1']]
		);
		const shoots = sheet(
			'Comptages',
			['Date', 'Total', 'Blason', 'Distance', 'id', 'idSeance', 'Volées', 'Flèches par volée'],
			[['19/06/2026', 30, 122, 50, 'shoot-1', 'sess-1', 1, 3]]
		);
		const arrows = sheet(
			'Flèches',
			['Date', 'id', 'idSeance', 'Flèches'],
			[['19/06/2026', 'shoot-1', 'sess-1', '10:0:0,10:0:0,10:0:0']]
		);

		const plan = planCapTargetImport([sessions, shoots, arrows]);
		expect(plan.sessions).toHaveLength(1);
		expect(plan.sessions[0].kind).toBe('competition');
		expect(plan.sessions[0].activities[0].ends[0].shots).toHaveLength(3);
	});

	it('gives a round whose session is missing a session of its own', () => {
		const plan = planCapTargetImport([SHOOTS(), ARROWS()]);
		expect(plan.summary.rounds).toBe(2);
		expect(plan.sessions).toHaveLength(2);
		expect(plan.warnings.some((w) => w.code === 'orphanRow')).toBe(true);
	});

	it('keeps the score of a round whose arrows the file does not carry', () => {
		const plan = planCapTargetImport([SESSIONS(), SHOOTS()]);
		const activity = plan.sessions[0].activities[0];
		expect(activity.ends).toHaveLength(0);
		expect(activity.reportedTotal).toBe(60);
	});

	it('drops rows it cannot date, and keeps the rest', () => {
		const sessions = SESSIONS();
		sessions.rows[0].trainingDate = 'not a date';
		const plan = planCapTargetImport([sessions, SHOOTS(), ARROWS()]);
		expect(plan.warnings.some((w) => w.code === 'undatedRow')).toBe(true);
		// The undated session is gone, but its round is kept under a session of its own.
		expect(plan.summary.rounds).toBe(2);
	});

	it('ignores a row with neither arrows nor a score', () => {
		const shoots = SHOOTS();
		shoots.rows.push({ ...shoots.rows[0], id: 'shoot-empty', total: '0' });
		const plan = planCapTargetImport([SESSIONS(), shoots, ARROWS()]);
		expect(plan.summary.rounds).toBe(2);
	});

	it('survives a sheet it has never seen', () => {
		const extra = sheet('Nouveautés', ['thing', 'other'], [['a', 'b']]);
		const plan = planCapTargetImport([SESSIONS(), SHOOTS(), ARROWS(), extra]);
		expect(plan.summary.rounds).toBe(2);
		expect(plan.warnings.some((w) => w.code === 'unknownSheet')).toBe(true);
	});

	it('reports nothing rather than throwing on an empty workbook', () => {
		const plan = planCapTargetImport([]);
		expect(plan.sessions).toEqual([]);
		expect(plan.summary.arrows).toBe(0);
	});

	it('works out the end size when the file does not say it', () => {
		const shoots = sheet(
			'shoots',
			['date', 'total', 'blazon', 'distance', 'id', 'idTraining'],
			[['2026-06-19', 60, 122, 50, 'shoot-1', 'sess-1']]
		);
		const arrows = sheet(
			'arrows',
			['date', 'id', 'idTraining', 'arrows'],
			[['2026-06-19', 'shoot-1', 'sess-1', Array(12).fill('9:0:0').join(',')]]
		);
		const plan = planCapTargetImport([SESSIONS(), shoots, arrows]);
		expect(plan.sessions[0].activities[0].ends.map((e) => e.shots.length)).toEqual([6, 6]);
	});

	it('falls back on the end count when the stated end size cannot be true', () => {
		const shoots = SHOOTS();
		// 6 arrows cannot be shot 5 to an end, so the two ends the row claims decide it instead.
		shoots.rows[0].arrows = '5';
		const plan = planCapTargetImport([SESSIONS(), shoots, ARROWS()]);
		expect(plan.sessions[0].activities[0].ends.map((e) => e.shots.length)).toEqual([3, 3]);
	});

	it('clamps a nonsense face or distance to something shootable', () => {
		const shoots = SHOOTS();
		shoots.rows[0].blazon = '99999';
		shoots.rows[0].distance = '-4';
		const plan = planCapTargetImport([SESSIONS(), shoots, ARROWS()]);
		const [stage] = plan.sessions[0].activities[0].round.stages;
		expect(stage.faceSize).toBe(122);
		expect(stage.distance).toBeNull();
	});

	it('gives a round with no arrow detail the arrows the session counted', () => {
		// Free plotting in CapTarget: a score, and an arrow count only the session knows.
		const sessions = sheet(
			'Sessions',
			['trainingDate', 'totalCounted', 'totalArrows', 'id'],
			[['2025-11-12', 8, 8, 'sess-1']]
		);
		const situations = sheet(
			'Situations',
			['date', 'total', 'id', 'idTraining', 'blazonSize', 'scoreCriteria1'],
			[['2025-11-12', 62, 'situ-1', 'sess-1', 40, '']]
		);

		const plan = planCapTargetImport([sessions, situations]);
		const [activity] = plan.sessions[0].activities;
		// Not a round: it has a score and no arrows behind it, which is its own kind of activity.
		expect(activity.kind).toBe('freeScore');
		expect(activity.ends).toEqual([]);
		expect(activity.reportedTotal).toBe(62);
		expect(activity.reportedArrows).toBe(8);
		// All eight are accounted for by the round, so none of them are volume shooting.
		expect(plan.sessions[0].trainingArrows).toBe(0);
	});

	it('shares the counted arrows between rounds in proportion to what they scored', () => {
		const sessions = sheet(
			'Sessions',
			['trainingDate', 'totalCounted', 'totalArrows', 'id'],
			[['2025-11-27', 90, 150, 'sess-1']]
		);
		const shoots = sheet(
			'Counted shoots',
			['trainingDate', 'total', 'blazon', 'distance', 'id', 'idTraining', 'salves', 'arrows'],
			[['2025-11-27', 30, 122, 50, 'shoot-1', 'sess-1', 1, 3]]
		);
		const arrows = sheet(
			'Arrows',
			['date', 'id', 'idTraining', 'arrows'],
			[['2025-11-27', 'shoot-1', 'sess-1', '10:0:0,10:0:0,10:0:0']]
		);
		const situations = sheet(
			'Situations',
			['date', 'total', 'id', 'idTraining', 'blazonSize', 'scoreCriteria1'],
			[
				['2025-11-27', 200, 'situ-1', 'sess-1', 40, ''],
				['2025-11-27', 100, 'situ-2', 'sess-1', 40, '']
			]
		);

		const plan = planCapTargetImport([sessions, shoots, arrows, situations]);
		const [detailed, big, small] = plan.sessions[0].activities;
		expect(detailed.reportedArrows).toBe(3);
		// 87 arrows left of the 90 counted, split two to one, and never fewer than the score needs.
		expect(big.reportedArrows + small.reportedArrows).toBe(87);
		expect(big.reportedArrows).toBeGreaterThan(small.reportedArrows);
		expect(small.reportedArrows).toBeGreaterThanOrEqual(10);
		expect(plan.sessions[0].trainingArrows).toBe(60);
	});

	it('never leaves a round scoring more than ten points an arrow', () => {
		const sessions = sheet('Sessions', ['trainingDate', 'totalArrows', 'id'], [['2025-11-12', 0, 'sess-1']]);
		const situations = sheet(
			'Situations',
			['date', 'total', 'id', 'idTraining', 'blazonSize', 'scoreCriteria1'],
			[['2025-11-12', 62, 'situ-1', 'sess-1', 40, '']]
		);
		const plan = planCapTargetImport([sessions, situations]);
		expect(plan.sessions[0].activities[0].reportedArrows).toBe(7);
	});

	it('drops the ends of an abandoned round rather than scoring them as misses', () => {
		const shoots = sheet(
			'Counted shoots',
			['trainingDate', 'total', 'blazon', 'distance', 'id', 'idTraining', 'salves', 'arrows'],
			[['2026-06-27', 25, 122, 50, 'shoot-1', 'sess-1', 3, 3]]
		);
		const arrows = sheet(
			'Arrows',
			['date', 'id', 'idTraining', 'arrows'],
			// Three arrows shot, then two ends the archer never took.
			[['2026-06-27', 'shoot-1', 'sess-1', '9:0:0,8:0:0,8:0:0,0:0:0,0:0:0,0:0:0,0:0:0,0:0:0,0:0:0']]
		);
		const plan = planCapTargetImport([SESSIONS(), shoots, arrows]);
		const [activity] = plan.sessions.flatMap((s) => s.activities);
		expect(activity.ends).toHaveLength(1);
		expect(activity.ends[0].shots).toHaveLength(3);
	});

	it('keeps a miss shot at the end of an end', () => {
		const arrows = ARROWS();
		arrows.rows[0].arrows = '10:0:0,10:0:0,10:0:0,10:0:0,10:0:0,0:0:0';
		const plan = planCapTargetImport([SESSIONS(), SHOOTS(), arrows]);
		const shots = plan.sessions[0].activities[0].ends.flatMap((e) => e.shots);
		expect(shots).toHaveLength(6);
		expect(shots[5].zoneLabel).toBe('M');
	});

	it('counts the exercises the export keeps no arrows for, and invents nothing for them', () => {
		const sessions = sheet(
			'Sessions',
			['trainingDate', 'totalCounted', 'totalArrows', 'id'],
			[['2025-12-03', 22, 45, 'sess-1']]
		);
		const situations = sheet(
			'Situations',
			['date', 'total', 'id', 'idTraining', 'blazonSize', 'scoreCriteria1'],
			[
				['2025-12-03', 104, 'situ-1', 'sess-1', 40, ''],
				['2025-12-03', 104, 'situ-2', 'sess-1', 40, ''],
				// In or out, and stay in the zone: CapTarget exports neither their arrows nor a score.
				['2025-12-03', 0, 'situ-3', 'sess-1', 40, ''],
				['2025-12-03', 0, 'situ-4', 'sess-1', 40, ''],
				['2025-12-03', 0, 'situ-5', 'sess-1', 40, '']
			]
		);

		const plan = planCapTargetImport([sessions, situations]);
		const [session] = plan.sessions;
		expect(session.activities).toHaveLength(2);
		expect(session.unrecordedExercises).toBe(3);
		// The 22 counted arrows go to the two rounds that scored; the rest is volume shooting.
		expect(session.activities.map((a) => a.reportedArrows)).toEqual([11, 11]);
		expect(session.trainingArrows).toBe(23);
	});

	it('marks a round that carries its arrows as an ordinary scored round', () => {
		const plan = planCapTargetImport([SESSIONS(), SHOOTS(), ARROWS()]);
		expect(plan.sessions[0].activities[0].kind).toBe('scoring');
	});

	it('is stable across two reads of the same file', () => {
		const first = planCapTargetImport([SESSIONS(), SHOOTS(), ARROWS()]);
		const second = planCapTargetImport([SESSIONS(), SHOOTS(), ARROWS()]);
		expect(JSON.stringify(first)).toBe(JSON.stringify(second));
	});
});

describe('parseArrows', () => {
	it('reads values with and without coordinates', () => {
		expect(parseArrows('10:1:2,9,M')).toEqual([
			{ value: 10, label: '10', x: 1, y: 2 },
			{ value: 9, label: '9', x: null, y: null },
			{ value: 0, label: 'M', x: null, y: null }
		]);
	});

	it('reads an X as a ten that keeps its label', () => {
		expect(parseArrows('X:0:0')[0]).toMatchObject({ value: 10, label: 'X' });
	});

	it('reads a zero as a miss', () => {
		expect(parseArrows('0:0:0')[0]).toMatchObject({ value: 0, label: 'M' });
	});

	it('skips junk rather than scoring it as a miss', () => {
		expect(parseArrows('9,,oops,,8')).toHaveLength(2);
		expect(parseArrows('')).toEqual([]);
	});

	it('accepts the other separators an export might use', () => {
		expect(parseArrows('9;8|7\n6')).toHaveLength(4);
	});
});

describe('chooseScale', () => {
	const plotted = (points: [number, number, number][]) =>
		points.map(([value, x, y]) => ({ value, label: String(value), x, y }));

	it('finds millimetres on a 122cm face', () => {
		// A ten sits inside 61mm of the centre on a 122cm face, a five inside 366mm.
		const scale = chooseScale(plotted([[10, 20, 10], [9, 90, 0], [5, 300, 40], [7, 200, 0]]), 122);
		expect(scale?.divisor).toBeCloseTo(610);
	});

	it('finds coordinates that are already normalised', () => {
		const scale = chooseScale(plotted([[10, 0.02, 0], [9, 0.15, 0], [5, 0.55, 0], [3, 0.75, 0]]), 122);
		expect(scale?.divisor).toBe(1);
	});

	it('gives up when no scale agrees with the scores', () => {
		expect(chooseScale(plotted([[10, 900, 900], [1, 2, 2], [9, 700, 0], [2, 5, 1]]), 122)).toBeNull();
	});

	it('gives up rather than guessing from one or two arrows', () => {
		expect(chooseScale(plotted([[10, 20, 10], [9, 90, 0]]), 122)).toBeNull();
	});
});

describe('value parsing', () => {
	it('reads numbers written either way round', () => {
		expect(toNumber('4,94')).toBe(4.94);
		expect(toNumber('4.94')).toBe(4.94);
		expect(toNumber('1 234')).toBe(1234);
		expect(toNumber('n/a')).toBeNull();
		expect(toNumber('')).toBeNull();
	});

	it('reads the several shapes of yes', () => {
		expect(['1', 'true', 'oui', 'YES'].map(toBoolean)).toEqual([true, true, true, true]);
		expect(['0', '', 'non'].map(toBoolean)).toEqual([false, false, false]);
	});

	it('reads dates as the day they name, whatever notation is used', () => {
		const iso = toTimestamp('2026-06-19')!;
		expect(new Date(iso).getDate()).toBe(19);
		expect(new Date(iso).getMonth()).toBe(5);
		// Day first, as a French export writes it.
		expect(toTimestamp('19/06/2026')).toBe(iso);
		expect(toTimestamp('06/19/2026')).toBe(iso);
		// The serial an unformatted cell holds.
		expect(new Date(toTimestamp('46192')!).getFullYear()).toBe(2026);
		expect(toTimestamp('rubbish')).toBeNull();
	});

	it('dates a session at midday so no timezone moves it a day', () => {
		expect(new Date(toTimestamp('2026-06-19')!).getHours()).toBe(12);
	});
});

describe('normaliseHeader', () => {
	it('collapses spelling, case, accents and punctuation', () => {
		expect(normaliseHeader('Date entraînement')).toBe('dateentrainement');
		expect(normaliseHeader('training_date')).toBe('trainingdate');
		expect(normaliseHeader(' Total  Score ')).toBe('totalscore');
	});
});

describe('a file that carries the same round id twice', () => {
	const twice = (secondSession: string) => [
		sheet(
			'Sessions',
			['trainingDate', 'distance', 'isCompetition', 'isIndoor', 'totalArrows', 'id'],
			[
				['2026-06-19', 50, 0, 0, 6, 'sess-1'],
				['2026-06-20', 50, 0, 0, 6, 'sess-2']
			]
		),
		sheet(
			'Counted shoots',
			['trainingDate', 'total', 'blazon', 'distance', 'id', 'idTraining', 'salves', 'arrows'],
			[
				['2026-06-19', 60, 122, 50, 'shoot-1', 'sess-1', 2, 3],
				['2026-06-20', 30, 122, 50, 'shoot-1', secondSession, 2, 3]
			]
		)
	];

	const keys = (sheets: ReturnType<typeof twice>) =>
		planCapTargetImport(sheets)
			.sessions.flatMap((session) => session.activities)
			.map((activity) => activity.externalId);

	/**
	 * The id is the key every imported round is written and re-imported under. Handed to two rounds
	 * it is the primary key twice in one session, which stops the import partway through a file it
	 * has already begun writing; across two sessions the second quietly clears the first, and the
	 * archer is told a round was imported that the database does not hold.
	 */
	it('gives each round a key of its own, in one session', () => {
		const found = keys(twice('sess-1'));
		expect(found).toHaveLength(2);
		expect(new Set(found).size).toBe(2);
	});

	it('gives each round a key of its own, across two sessions', () => {
		const found = keys(twice('sess-2'));
		expect(found).toHaveLength(2);
		expect(new Set(found).size).toBe(2);
	});

	/** Re-importing has to replace rather than duplicate, so the same file has to key the same way. */
	it('keys the same file the same way every time', () => {
		expect(keys(twice('sess-2'))).toEqual(keys(twice('sess-2')));
	});

	/** A file with nothing wrong with it keeps the plain key it always had. */
	it('leaves a file whose ids are its own alone', () => {
		const plan = planCapTargetImport([SESSIONS(), SHOOTS(), ARROWS()]);
		expect(plan.sessions.flatMap((s) => s.activities).map((a) => a.externalId)).toEqual([
			'shoot-shoot-1',
			'shoot-shoot-2'
		]);
	});
});
