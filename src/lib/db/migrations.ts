/**
 * Bundled migrations applied in order against SQLite's user_version.
 * They are strings rather than files because a webview has no filesystem to read them from.
 */

// Never edit a released migration: databases that already ran it silently diverge. Append instead.
export const MIGRATIONS: string[][] = [
	// 0001 initial schema
	[
		`CREATE TABLE IF NOT EXISTS bow (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			name TEXT NOT NULL,
			type TEXT NOT NULL,
			is_active INTEGER NOT NULL DEFAULT 1,
			notes TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS arrow_set (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			label TEXT NOT NULL,
			spine INTEGER,
			length_mm INTEGER,
			point_grain INTEGER,
			fletching TEXT,
			nock TEXT,
			total_grain REAL,
			count INTEGER
		);`,
		`CREATE TABLE IF NOT EXISTS bow_revision (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			bow_id TEXT NOT NULL REFERENCES bow(id),
			revision_no INTEGER NOT NULL,
			settings TEXT NOT NULL,
			arrow_set_id TEXT REFERENCES arrow_set(id),
			reason TEXT,
			effective_from INTEGER NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_bow_revision_bow ON bow_revision (bow_id, revision_no);`,
		`CREATE TABLE IF NOT EXISTS session (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			label TEXT,
			started_at INTEGER NOT NULL,
			ended_at INTEGER,
			kind TEXT NOT NULL DEFAULT 'practice',
			bow_id TEXT REFERENCES bow(id),
			bow_type TEXT,
			bow_revision_id TEXT REFERENCES bow_revision(id),
			location TEXT,
			latitude REAL,
			longitude REAL,
			weather TEXT,
			notes TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS activity (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			session_id TEXT NOT NULL REFERENCES session(id),
			kind TEXT NOT NULL,
			round_definition_id TEXT,
			round_definition TEXT,
			template_key TEXT,
			observations TEXT,
			conclusion TEXT,
			adjustment_made TEXT,
			resulting_revision_id TEXT REFERENCES bow_revision(id),
			started_at INTEGER NOT NULL,
			ended_at INTEGER,
			total_score INTEGER NOT NULL DEFAULT 0,
			count_10s INTEGER NOT NULL DEFAULT 0,
			count_x INTEGER NOT NULL DEFAULT 0,
			arrows_shot INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'in_progress',
			notes TEXT
		);`,
		`CREATE INDEX IF NOT EXISTS idx_activity_session ON activity (session_id, started_at);`,
		`CREATE TABLE IF NOT EXISTS round_end (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			activity_id TEXT NOT NULL REFERENCES activity(id),
			stage_index INTEGER NOT NULL,
			end_no INTEGER NOT NULL,
			subtotal INTEGER NOT NULL DEFAULT 0
		);`,
		`CREATE INDEX IF NOT EXISTS idx_end_activity ON round_end (activity_id);`,
		`CREATE TABLE IF NOT EXISTS shot (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			end_id TEXT NOT NULL REFERENCES round_end(id),
			ordinal INTEGER NOT NULL,
			value INTEGER NOT NULL,
			zone_label TEXT NOT NULL,
			x REAL,
			y REAL,
			source TEXT NOT NULL DEFAULT 'manual',
			arrow_id TEXT
		);`,
		`CREATE INDEX IF NOT EXISTS idx_shot_end ON shot (end_id);`,
		`CREATE TABLE IF NOT EXISTS change_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			table_name TEXT NOT NULL,
			row_id TEXT NOT NULL,
			op TEXT NOT NULL,
			changed_at INTEGER NOT NULL,
			synced_at INTEGER
		);`,
		`CREATE INDEX IF NOT EXISTS idx_change_log_pending ON change_log (synced_at);`,
		`CREATE TABLE IF NOT EXISTS sync_state (
			id TEXT PRIMARY KEY NOT NULL,
			device_id TEXT NOT NULL,
			last_pull_cursor TEXT,
			last_push_cursor TEXT,
			endpoint TEXT
		);`
	],
	// 0002 bow photo, shown in the equipment list
	[`ALTER TABLE bow ADD COLUMN photo TEXT;`],
	// 0003 nothing ever ended a session or an activity, and completion is derived from the arrows
	[`ALTER TABLE session DROP COLUMN ended_at;`, `ALTER TABLE activity DROP COLUMN ended_at;`],
	// 0004 the file name of the scoring video kept for this end, when recording was on
	[`ALTER TABLE round_end ADD COLUMN video TEXT;`],
	// 0005 rounds pinned to the top of the stats page
	[
		`CREATE TABLE IF NOT EXISTS favourite_round (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			round_key TEXT NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_favourite_round_key ON favourite_round (round_key);`
	],
	// 0006 an arrow count to aim for during one session
	[`ALTER TABLE session ADD COLUMN arrow_goal INTEGER;`],
	// 0007 repeating weeks of intended outings
	[
		`CREATE TABLE IF NOT EXISTS plan (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			name TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS plan_slot (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			plan_id TEXT NOT NULL REFERENCES plan(id),
			weekday INTEGER NOT NULL,
			minute_of_day INTEGER NOT NULL,
			arrow_goal INTEGER,
			label TEXT
		);`,
		`CREATE INDEX IF NOT EXISTS idx_plan_slot_plan ON plan_slot (plan_id, weekday);`
	],
	// 0008 arrows a plan asks for that are not tied to any one outing
	[`ALTER TABLE plan ADD COLUMN free_arrows INTEGER;`],
	// 0009 sight marks, one row per distance the bow is sighted in at
	[
		`CREATE TABLE IF NOT EXISTS sight_mark (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			bow_id TEXT NOT NULL REFERENCES bow(id),
			distance INTEGER NOT NULL,
			unit TEXT NOT NULL,
			height TEXT,
			windage TEXT,
			clicker TEXT,
			plunger TEXT
		);`,
		`CREATE INDEX IF NOT EXISTS idx_sight_mark_bow ON sight_mark (bow_id, distance);`
	],
	// 0010 marks worked out from the others rather than shot in
	[`ALTER TABLE sight_mark ADD COLUMN interpolated INTEGER NOT NULL DEFAULT 0;`],
	// 0011 goals the archer has reached, kept once earned
	[
		`CREATE TABLE IF NOT EXISTS badge (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			key TEXT NOT NULL,
			earned_at INTEGER NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_badge_key ON badge (key);`
	],
	// 0012 a plan put aside without being thrown away
	[`ALTER TABLE plan ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`],
	// 0013 head to head matches, which are scored against somebody rather than against a round
	[
		`ALTER TABLE activity ADD COLUMN match_config TEXT;`,
		`ALTER TABLE round_end ADD COLUMN opponent_subtotal INTEGER;`,
		`ALTER TABLE round_end ADD COLUMN is_shoot_off INTEGER NOT NULL DEFAULT 0;`,
		`ALTER TABLE round_end ADD COLUMN winner TEXT;`,
		`ALTER TABLE shot ADD COLUMN side TEXT NOT NULL DEFAULT 'us';`
	],
	// 0014 procedures that compare groups across a bow setting, and the figures a procedure measures
	[
		`ALTER TABLE round_end ADD COLUMN setting_value REAL;`,
		`ALTER TABLE activity ADD COLUMN measurements TEXT;`
	],
	// 0015 the season a plan runs for, so it stops asking for the week once it is over
	[`ALTER TABLE plan ADD COLUMN start_date INTEGER;`, `ALTER TABLE plan ADD COLUMN end_date INTEGER;`]
];
