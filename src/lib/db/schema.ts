import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

/**
 * Local SQLite schema — the source of truth for all user data.
 *
 * Sync-readiness conventions, applied from day one even though nothing consumes
 * them yet (see doc/data-model.md):
 *   - `id` is a UUID, never an autoincrement, so two devices cannot collide.
 *   - `updatedAt` drives last-writer-wins resolution.
 *   - `deletedAt` soft-deletes, because a hard delete cannot be synced.
 *   - every mutation is appended to `changeLog`.
 * Retrofitting these over existing user data is far more painful than carrying
 * a few unused columns.
 */

const syncColumns = {
	id: text('id').primaryKey(),
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull(),
	deletedAt: integer('deleted_at'),
	deviceId: text('device_id').notNull()
};

export const bow = sqliteTable('bow', {
	...syncColumns,
	name: text('name').notNull(),
	/** 'recurve' | 'compound' | 'barebow' | 'longbow' */
	type: text('type').notNull(),
	isActive: integer('is_active').notNull().default(1),
	notes: text('notes')
});

/**
 * Immutable. Changing a setting appends a revision rather than updating one, so
 * a past score always resolves to the exact configuration that produced it.
 */
export const bowRevision = sqliteTable(
	'bow_revision',
	{
		...syncColumns,
		bowId: text('bow_id').notNull(),
		revisionNo: integer('revision_no').notNull(),
		/** JSON, validated against the schema for the bow's type. */
		settings: text('settings').notNull(),
		arrowSetId: text('arrow_set_id'),
		/** Why the change was made. Free text, and unexpectedly valuable months later. */
		reason: text('reason'),
		effectiveFrom: integer('effective_from').notNull()
	},
	(t) => [index('idx_bow_revision_bow').on(t.bowId, t.revisionNo)]
);

export const arrowSet = sqliteTable('arrow_set', {
	...syncColumns,
	label: text('label').notNull(),
	spine: integer('spine'),
	/** Canonical metric storage; arrow lengths are *displayed* in inches. */
	lengthMm: integer('length_mm'),
	pointGrain: integer('point_grain'),
	fletching: text('fletching'),
	nock: text('nock'),
	totalGrain: real('total_grain'),
	count: integer('count')
});

export const session = sqliteTable(
	'session',
	{
		...syncColumns,
		roundDefinitionId: text('round_definition_id').notNull(),
		bowRevisionId: text('bow_revision_id'),
		startedAt: integer('started_at').notNull(),
		endedAt: integer('ended_at'),
		/** 'practice' | 'competition' | 'qualification' */
		kind: text('kind').notNull().default('practice'),
		location: text('location'),
		/** JSON: wind, temperature, light, indoor/outdoor. */
		conditions: text('conditions'),
		/** Denormalised for list views; recomputed whenever an end changes. */
		totalScore: integer('total_score').notNull().default(0),
		count10s: integer('count_10s').notNull().default(0),
		countX: integer('count_x').notNull().default(0),
		arrowsShot: integer('arrows_shot').notNull().default(0),
		/** 'in_progress' | 'complete' | 'abandoned' */
		status: text('status').notNull().default('in_progress'),
		notes: text('notes')
	},
	(t) => [index('idx_session_round').on(t.roundDefinitionId, t.startedAt)]
);

/** Named `round_end` in SQL: `end` is a reserved SQLite keyword. */
export const end = sqliteTable(
	'round_end',
	{
		...syncColumns,
		sessionId: text('session_id').notNull(),
		stageIndex: integer('stage_index').notNull(),
		endNo: integer('end_no').notNull(),
		subtotal: integer('subtotal').notNull().default(0)
	},
	(t) => [index('idx_end_session').on(t.sessionId)]
);

export const shot = sqliteTable(
	'shot',
	{
		...syncColumns,
		endId: text('end_id').notNull(),
		ordinal: integer('ordinal').notNull(),
		value: integer('value').notNull(),
		zoneLabel: text('zone_label').notNull(),
		/**
		 * Normalised face coordinates, centre (0,0), radius 1.0. Null for
		 * score-only entry. When present, `value` is derived from position rather
		 * than entered separately — one input, so the two cannot contradict.
		 */
		x: real('x'),
		y: real('y'),
		/** 'manual' | 'plotted' | 'vision' */
		source: text('source').notNull().default('manual'),
		arrowId: text('arrow_id')
	},
	(t) => [index('idx_shot_end').on(t.endId)]
);

export const tuningRun = sqliteTable('tuning_run', {
	...syncColumns,
	templateKey: text('template_key').notNull(),
	bowRevisionId: text('bow_revision_id').notNull(),
	/** JSON: captured observations — tear direction, bare-shaft offset, crawls. */
	observations: text('observations').notNull(),
	conclusion: text('conclusion'),
	adjustmentMade: text('adjustment_made'),
	/**
	 * The revision this run produced. Closes the causal loop:
	 * setup -> test -> observation -> change -> new setup -> subsequent scores.
	 */
	resultingRevisionId: text('resulting_revision_id'),
	photos: text('photos')
});

/**
 * Written from phase 1, consumed by sync in phase 3. Unused for now — that is
 * deliberate. A change log that starts recording only when sync ships cannot
 * reconcile anything that happened before it.
 */
export const changeLog = sqliteTable(
	'change_log',
	{
		/** Local ordering only; never synced, so an autoincrement is correct here. */
		id: integer('id').primaryKey({ autoIncrement: true }),
		tableName: text('table_name').notNull(),
		rowId: text('row_id').notNull(),
		/** 'insert' | 'update' | 'delete' */
		op: text('op').notNull(),
		changedAt: integer('changed_at').notNull(),
		syncedAt: integer('synced_at')
	},
	(t) => [index('idx_change_log_pending').on(t.syncedAt)]
);

export const syncState = sqliteTable('sync_state', {
	id: text('id').primaryKey(),
	deviceId: text('device_id').notNull(),
	lastPullCursor: text('last_pull_cursor'),
	lastPushCursor: text('last_push_cursor'),
	endpoint: text('endpoint')
});
