/**
 * Bundled migrations applied in order against SQLite's user_version.
 * They are strings rather than files because a webview has no filesystem to read them from.
 */

// Never edit a released migration: databases that already ran it silently diverge. Append instead.
export const MIGRATIONS: string[][] = [
	// 0001 the schema as the development phase left it, collapsed from the eighteen migrations that
	// built it up. Safe to collapse only because every database that ran them was thrown away; from
	// here on, a change is a new group appended below and never an edit to this one.
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
			notes TEXT,
			photo TEXT,
			user_id TEXT
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
			count INTEGER,
			user_id TEXT
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
			effective_from INTEGER NOT NULL,
			user_id TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS session (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			label TEXT,
			started_at INTEGER NOT NULL,
			kind TEXT NOT NULL DEFAULT 'practice',
			bow_id TEXT REFERENCES bow(id),
			bow_type TEXT,
			bow_revision_id TEXT REFERENCES bow_revision(id),
			location TEXT,
			latitude REAL,
			longitude REAL,
			weather TEXT,
			notes TEXT,
			arrow_goal INTEGER,
			user_id TEXT
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
			total_score INTEGER NOT NULL DEFAULT 0,
			count_10s INTEGER NOT NULL DEFAULT 0,
			count_x INTEGER NOT NULL DEFAULT 0,
			arrows_shot INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'in_progress',
			notes TEXT,
			match_config TEXT,
			measurements TEXT,
			user_id TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS round_end (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			activity_id TEXT NOT NULL REFERENCES activity(id),
			stage_index INTEGER NOT NULL,
			end_no INTEGER NOT NULL,
			subtotal INTEGER NOT NULL DEFAULT 0,
			video TEXT,
			opponent_subtotal INTEGER,
			is_shoot_off INTEGER NOT NULL DEFAULT 0,
			winner TEXT,
			setting_value REAL,
			user_id TEXT
		);`,
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
			arrow_id TEXT,
			side TEXT NOT NULL DEFAULT 'us',
			user_id TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS plan (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			name TEXT NOT NULL,
			free_arrows INTEGER,
			is_active INTEGER NOT NULL DEFAULT 1,
			start_date INTEGER,
			end_date INTEGER,
			user_id TEXT
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
			label TEXT,
			user_id TEXT
		);`,
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
			plunger TEXT,
			interpolated INTEGER NOT NULL DEFAULT 0,
			user_id TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS favourite_round (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			round_key TEXT NOT NULL,
			user_id TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS badge (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER,
			device_id TEXT NOT NULL,
			key TEXT NOT NULL,
			earned_at INTEGER NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS change_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			table_name TEXT NOT NULL,
			row_id TEXT NOT NULL,
			op TEXT NOT NULL,
			changed_at INTEGER NOT NULL,
			synced_at INTEGER
		);`,
		`CREATE TABLE IF NOT EXISTS sync_state (
			id TEXT PRIMARY KEY NOT NULL,
			device_id TEXT NOT NULL,
			last_pull_cursor TEXT,
			last_push_cursor TEXT,
			endpoint TEXT,
			last_sync_at INTEGER
		);`,
		`CREATE INDEX IF NOT EXISTS idx_activity_session ON activity (session_id, started_at);`,
		`CREATE INDEX IF NOT EXISTS idx_badge_key ON badge (key);`,
		`CREATE INDEX IF NOT EXISTS idx_bow_revision_bow ON bow_revision (bow_id, revision_no);`,
		`CREATE INDEX IF NOT EXISTS idx_change_log_pending ON change_log (synced_at);`,
		`CREATE INDEX IF NOT EXISTS idx_end_activity ON round_end (activity_id);`,
		`CREATE INDEX IF NOT EXISTS idx_favourite_round_key ON favourite_round (round_key);`,
		`CREATE INDEX IF NOT EXISTS idx_plan_slot_plan ON plan_slot (plan_id, weekday);`,
		`CREATE INDEX IF NOT EXISTS idx_shot_end ON shot (end_id);`,
		`CREATE INDEX IF NOT EXISTS idx_sight_mark_bow ON sight_mark (bow_id, distance);`
	],
	// 0002 sharing an activity, and a read only copy of the social side so it is legible with no signal
	[
		`ALTER TABLE activity ADD COLUMN shared_at INTEGER;`,
		// Somebody else's profile as it was last seen. A cache: never a source, never pushed.
		`CREATE TABLE IF NOT EXISTS social_profile (
			user_id TEXT PRIMARY KEY NOT NULL,
			handle TEXT NOT NULL,
			display_name TEXT,
			is_public INTEGER NOT NULL DEFAULT 0,
			/** none | pending | approved, from this device's point of view. */
			follow_status TEXT NOT NULL DEFAULT 'none',
			/** Set on the accounts following us, so one table answers both directions. */
			follows_us TEXT NOT NULL DEFAULT 'none',
			cached_at INTEGER NOT NULL
		);`,
		// An activity somebody shared, kept whole as the JSON the profile page renders. Held apart from
		// the archer's own tables so nobody else's arrows can reach their statistics.
		`CREATE TABLE IF NOT EXISTS social_activity (
			id TEXT PRIMARY KEY NOT NULL,
			owner_id TEXT NOT NULL,
			shared_at INTEGER NOT NULL,
			payload TEXT NOT NULL,
			cached_at INTEGER NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_social_activity_owner ON social_activity (owner_id, shared_at);`,
		`CREATE INDEX IF NOT EXISTS idx_social_profile_handle ON social_profile (handle);`
	],
	// 0003 a change the server keeps refusing, so it stops being retried and starts being reported
	[
		`ALTER TABLE change_log ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;`,
		`ALTER TABLE change_log ADD COLUMN failed_at INTEGER;`
	]
];
