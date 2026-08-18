import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// Sync readiness costs a few columns now and is impossible to retrofit later, see doc/data-model.md.
const syncColumns = {
	id: text('id').primaryKey(),
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull(),
	deletedAt: integer('deleted_at'),
	deviceId: text('device_id').notNull()
};

/**
 * Sync columns plus the account a row belongs to, on the tables that actually travel. Null until the
 * archer signs in, and null forever for somebody who never does: inventing an owner for local rows
 * would make the column a lie on every device that stays offline.
 *
 * badge carries none of this. Badges are derived from the shooting record and recomputed per device,
 * see doc/sync.md section 2.
 */
const ownedColumns = {
	...syncColumns,
	userId: text('user_id')
};

export const bow = sqliteTable('bow', {
	...ownedColumns,
	name: text('name').notNull(),
	/** recurve | compound | barebow | longbow */
	type: text('type').notNull(),
	isActive: integer('is_active').notNull().default(1),
	/** Data URL, kept local so a bow photo never leaves the device. */
	photo: text('photo'),
	notes: text('notes')
});

// Immutable: a settings change appends a revision so past scores still resolve to the setup that produced them.
export const bowRevision = sqliteTable(
	'bow_revision',
	{
		...ownedColumns,
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
	...ownedColumns,
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
	...ownedColumns,
	label: text('label'),
	startedAt: integer('started_at').notNull(),
	/** practice | competition | qualification | planned */
	kind: text('kind').notNull().default('practice'),
	/** Arrows the archer meant to shoot this outing, set by hand. Null when no goal was set. */
	arrowGoal: integer('arrow_goal'),
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
		...ownedColumns,
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
		/** The rules of a head to head match as JSON, set on match activities and null everywhere else. */
		matchConfig: text('match_config'),
		observations: text('observations'),
		/**
		 * What a procedure measured, as JSON, for the procedures that record figures rather than a
		 * score: the mass and draw weight of a ratio measurement, the face a brace test was shot on.
		 */
		measurements: text('measurements'),
		conclusion: text('conclusion'),
		adjustmentMade: text('adjustment_made'),
		resultingRevisionId: text('resulting_revision_id'),
		startedAt: integer('started_at').notNull(),
		totalScore: integer('total_score').notNull().default(0),
		count10s: integer('count_10s').notNull().default(0),
		countX: integer('count_x').notNull().default(0),
		arrowsShot: integer('arrows_shot').notNull().default(0),
		/** in_progress | complete | abandoned */
		status: text('status').notNull().default('in_progress'),
		notes: text('notes'),
		/**
		 * When this activity was shared, or null. Sharing is a flag rather than a row per viewer, so
		 * unsharing revokes: nothing was ever copied to anybody. See doc/sync.md section 6.
		 */
		sharedAt: integer('shared_at')
	},
	(t) => [index('idx_activity_session').on(t.sessionId, t.startedAt)]
);

/** Named round_end in SQL because end is a reserved keyword. */
export const end = sqliteTable(
	'round_end',
	{
		...ownedColumns,
		activityId: text('activity_id').notNull(),
		stageIndex: integer('stage_index').notNull(),
		endNo: integer('end_no').notNull(),
		subtotal: integer('subtotal').notNull().default(0),
		/**
		 * The other side's total for this end of a match. Held on the same row as ours because an end
		 * of a match is one thing that happened, not two, and neither total means anything alone.
		 */
		opponentSubtotal: integer('opponent_subtotal'),
		/** The single arrow that separates a level match, which stands outside the regulation ends. */
		isShootOff: integer('is_shoot_off').notNull().default(0),
		/** us | them, recorded only when a judge had to separate two equal shoot-off arrows. */
		winner: text('winner'),
		/**
		 * The bow setting this end was shot at, for a procedure that compares groups across a setting
		 * rather than scoring them: brace height in millimetres today. Null on every scored end.
		 */
		settingValue: real('setting_value'),
		/**
		 * File name of the scoring video kept for this end, or null. Recorded against the end rather
		 * than the detection, so an end filmed by the camera and then typed in by hand is still paired
		 * with its footage: that pairing is the whole value of the recording as training data.
		 */
		video: text('video')
	},
	(t) => [index('idx_end_activity').on(t.activityId)]
);

export const shot = sqliteTable(
	'shot',
	{
		...ownedColumns,
		endId: text('end_id').notNull(),
		ordinal: integer('ordinal').notNull(),
		value: integer('value').notNull(),
		zoneLabel: text('zone_label').notNull(),
		/** us | them. The opponent's arrows are kept to work out who won and count for nobody. */
		side: text('side').notNull().default('us'),
		/** Normalised face coordinates, null when the arrow was entered as a bare number. */
		x: real('x'),
		y: real('y'),
		/** manual | plotted | vision */
		source: text('source').notNull().default('manual'),
		arrowId: text('arrow_id')
	},
	(t) => [index('idx_shot_end').on(t.endId)]
);

/** A repeating week of intended outings. Several can run at once: a plan is a habit, not a mode. */
export const plan = sqliteTable('plan', {
	...ownedColumns,
	name: text('name').notNull(),
	/**
	 * Arrows the week asks for that belong to no particular outing: shoot them whenever, they still
	 * have to be shot. They add to the week's total alongside the slot goals.
	 */
	freeArrows: integer('free_arrows'),
	/** A plan put aside: it keeps its slots and its history, but stops asking anything of the week. */
	isActive: integer('is_active').notNull().default(1),
	/**
	 * The season the plan runs for, either end open. Midnight of the first day it asks for and
	 * midnight of the last, so both days count whole and a day outside is a day the plan is silent on.
	 */
	startDate: integer('start_date'),
	endDate: integer('end_date')
});

/**
 * One intended outing inside a plan's week. It is a template, never an outing: the session itself
 * is only written when the archer taps the slot, so a skipped week leaves nothing behind.
 */
export const planSlot = sqliteTable(
	'plan_slot',
	{
		...ownedColumns,
		planId: text('plan_id').notNull(),
		/** 0 is Monday, so the week reads the way the calendar on the sessions page does. */
		weekday: integer('weekday').notNull(),
		minuteOfDay: integer('minute_of_day').notNull(),
		arrowGoal: integer('arrow_goal'),
		/** Used as the session's name instead of the part of the day it falls in. */
		label: text('label')
	},
	(t) => [index('idx_plan_slot_plan').on(t.planId, t.weekday)]
);

/**
 * Where the sight sits for one distance. Kept as its own rows rather than inside a bow revision,
 * because a sight mark is a list that grows a distance at a time, not a setting that gets changed.
 */
export const sightMark = sqliteTable(
	'sight_mark',
	{
		...ownedColumns,
		bowId: text('bow_id').notNull(),
		distance: integer('distance').notNull(),
		/** m | yd, held per mark: an archer shooting both keeps both without converting either. */
		unit: text('unit').notNull(),
		/** Free text, because sight scales are read off the sight, not measured in any unit. */
		height: text('height'),
		/**
		 * Worked out from the marks around it rather than shot in. Kept as a row like any other so it
		 * can be read at the line, and flagged so it is never mistaken for a mark that was proved.
		 */
		interpolated: integer('interpolated').notNull().default(0),
		windage: text('windage'),
		clicker: text('clicker'),
		plunger: text('plunger')
	},
	(t) => [index('idx_sight_mark_bow').on(t.bowId, t.distance)]
);

/**
 * A round the archer pinned to the top of the stats page. Keyed by the same string the stats
 * summaries group on, so a custom round keeps its favourite across activities that share its shape.
 */
export const favouriteRound = sqliteTable(
	'favourite_round',
	{
		...ownedColumns,
		roundKey: text('round_key').notNull()
	},
	(t) => [index('idx_favourite_round_key').on(t.roundKey)]
);

/**
 * A goal the archer has reached. Stored rather than derived, unlike a personal best: a badge is
 * earned once and kept, so editing the round that won it never takes it away. Only the recalculation
 * in settings revokes one, when the shooting behind it is gone.
 */
export const badge = sqliteTable(
	'badge',
	{
		...syncColumns,
		/** Matches a key in the badge catalogue, see src/lib/domain/badges.ts. */
		key: text('key').notNull(),
		/** When the shooting that earned it happened, not when the row was written. */
		earnedAt: integer('earned_at').notNull()
	},
	(t) => [index('idx_badge_key').on(t.key)]
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
		syncedAt: integer('synced_at'),
		/** Refusals counted, so a row the server will never take stops being asked about. */
		attempts: integer('attempts').notNull().default(0),
		failedAt: integer('failed_at')
	},
	(t) => [index('idx_change_log_pending').on(t.syncedAt)]
);

/**
 * Somebody else's profile as it was last seen, so the friends screen reads at a range with no
 * signal. A cache and never a source: nothing here is pushed, and anything the server disagrees with
 * is overwritten on the next look.
 */
export const socialProfile = sqliteTable(
	'social_profile',
	{
		userId: text('user_id').primaryKey(),
		handle: text('handle').notNull(),
		displayName: text('display_name'),
		isPublic: integer('is_public').notNull().default(0),
		/** none | pending | approved, from this device's point of view. */
		followStatus: text('follow_status').notNull().default('none'),
		/** Whether they follow us, so one table answers both directions of the graph. */
		followsUs: text('follows_us').notNull().default('none'),
		cachedAt: integer('cached_at').notNull()
	},
	(t) => [index('idx_social_profile_handle').on(t.handle)]
);

/**
 * An activity somebody shared, kept whole as the JSON its card and score sheet render from. Held
 * apart from the archer's own tables on purpose: somebody else's arrows must never reach their
 * averages, their records or their badges.
 */
export const socialActivity = sqliteTable(
	'social_activity',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id').notNull(),
		sharedAt: integer('shared_at').notNull(),
		payload: text('payload').notNull(),
		cachedAt: integer('cached_at').notNull()
	},
	(t) => [index('idx_social_activity_owner').on(t.ownerId, t.sharedAt)]
);

export const syncState = sqliteTable('sync_state', {
	id: text('id').primaryKey(),
	deviceId: text('device_id').notNull(),
	lastPullCursor: text('last_pull_cursor'),
	lastPushCursor: text('last_push_cursor'),
	endpoint: text('endpoint'),
	/** Read on a screen that has to work with no signal, so it is stored rather than asked for. */
	lastSyncAt: integer('last_sync_at')
});
