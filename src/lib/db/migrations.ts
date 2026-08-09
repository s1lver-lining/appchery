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
	[`ALTER TABLE round_end ADD COLUMN video TEXT;`]
];
