import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// Sync readiness costs a few columns now and is impossible to retrofit later, see doc/data-model.md.
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
	/** recurve | compound | barebow | longbow */
	type: text('type').notNull(),
	isActive: integer('is_active').notNull().default(1),
	notes: text('notes')
});

// Immutable: a settings change appends a revision so past scores still resolve to the setup that produced them.
export const bowRevision = sqliteTable(
	'bow_revision',
	{
		...syncColumns,
		bowId: text('bow_id').notNull(),
		revisionNo: integer('revision_no').notNull(),
		settings: text('settings').notNull(),
		arrowSetId: text('arrow_set_id'),
		reason: text('reason'),
		effectiveFrom: integer('effective_from').notNull()
	},
	(t) => [index('idx_bow_revision_bow').on(t.bowId, t.revisionNo)]
);

export const arrowSet = sqliteTable('arrow_set', {
	...syncColumns,
	label: text('label').notNull(),
	spine: integer('spine'),
	/** Canonical metric storage, displayed in inches. */
	lengthMm: integer('length_mm'),
	pointGrain: integer('point_grain'),
	fletching: text('fletching'),
	nock: text('nock'),
	totalGrain: real('total_grain'),
	count: integer('count')
});

/** One outing, holding the bow used, the conditions, and every activity done during it. */
export const session = sqliteTable('session', {
	...syncColumns,
	label: text('label'),
	startedAt: integer('started_at').notNull(),
	endedAt: integer('ended_at'),
	/** practice | competition | qualification */
	kind: text('kind').notNull().default('practice'),
	/** Set when shooting a bow the archer has recorded. */
	bowId: text('bow_id'),
	/** Set instead of bowId when the archer only wants to note a generic bow type. */
	bowType: text('bow_type'),
	bowRevisionId: text('bow_revision_id'),
	location: text('location'),
	latitude: real('latitude'),
	longitude: real('longitude'),
	/** JSON weather snapshot taken once at session start, never refreshed. */
	weather: text('weather'),
	notes: text('notes')
});

/** One thing done inside a session: a scored round, or a tuning procedure. */
export const activity = sqliteTable(
	'activity',
	{
		...syncColumns,
		sessionId: text('session_id').notNull(),
		/** scoring | tuning */
		kind: text('kind').notNull(),
		/** Set for built-in rounds, null for custom ones. */
		roundDefinitionId: text('round_definition_id'),
		/**
		 * Full round snapshot as JSON, so editing a definition never rewrites the history of a
		 * round already shot under the old one.
		 */
		roundDefinition: text('round_definition'),
		/** Set for tuning activities. */
		templateKey: text('template_key'),
		observations: text('observations'),
		conclusion: text('conclusion'),
		adjustmentMade: text('adjustment_made'),
		resultingRevisionId: text('resulting_revision_id'),
		startedAt: integer('started_at').notNull(),
		endedAt: integer('ended_at'),
		totalScore: integer('total_score').notNull().default(0),
		count10s: integer('count_10s').notNull().default(0),
		countX: integer('count_x').notNull().default(0),
		arrowsShot: integer('arrows_shot').notNull().default(0),
		/** in_progress | complete | abandoned */
		status: text('status').notNull().default('in_progress'),
		notes: text('notes')
	},
	(t) => [index('idx_activity_session').on(t.sessionId, t.startedAt)]
);

/** Named round_end in SQL because end is a reserved keyword. */
export const end = sqliteTable(
	'round_end',
	{
		...syncColumns,
		activityId: text('activity_id').notNull(),
		stageIndex: integer('stage_index').notNull(),
		endNo: integer('end_no').notNull(),
		subtotal: integer('subtotal').notNull().default(0)
	},
	(t) => [index('idx_end_activity').on(t.activityId)]
);

export const shot = sqliteTable(
	'shot',
	{
		...syncColumns,
		endId: text('end_id').notNull(),
		ordinal: integer('ordinal').notNull(),
		value: integer('value').notNull(),
		zoneLabel: text('zone_label').notNull(),
		/** Normalised face coordinates, null when the arrow was entered as a bare number. */
		x: real('x'),
		y: real('y'),
		/** manual | plotted | vision */
		source: text('source').notNull().default('manual'),
		arrowId: text('arrow_id')
	},
	(t) => [index('idx_shot_end').on(t.endId)]
);

// Written from phase 1 so sync in phase 3 has a history to reconcile, see doc/architecture.md.
export const changeLog = sqliteTable(
	'change_log',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		tableName: text('table_name').notNull(),
		rowId: text('row_id').notNull(),
		/** insert | update | delete */
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
