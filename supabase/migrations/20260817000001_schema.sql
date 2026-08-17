-- Postgres mirror of the local SQLite tables, see doc/sync.md.
--
-- Two columns exist here that SQLite has no use for. user_id owns the row and every policy in
-- 0002 is written against it. server_updated_at is the pull cursor: updated_at is a device clock,
-- and one phone set to next year would otherwise hide every other device's rows until it caught up.
-- No client ever writes server_updated_at, so no client clock can move the cursor.
--
-- Timestamps are epoch milliseconds, as bigint, matching SQLite exactly. Converting at the boundary
-- would invite a rounding difference into last writer wins comparisons.

create extension if not exists "pgcrypto";

create or replace function public.touch_server_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.server_updated_at := now();
	return new;
end;
$$;

-- Every synced table gets the same shape, so the columns are declared once here and inherited by
-- hand below rather than by table inheritance, which does not carry constraints or policies.
create or replace function public.add_sync_columns(target regclass)
returns void
language plpgsql
as $$
declare
	name text := target::text;
begin
	execute format('alter table %s
		add column user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
		add column created_at bigint not null,
		add column updated_at bigint not null,
		add column deleted_at bigint,
		add column device_id text not null,
		add column server_updated_at timestamptz not null default now()', name);

	execute format('create index %I on %s (user_id, server_updated_at)', 'idx_' || name || '_pull', name);

	execute format('create trigger %I before insert or update on %s
		for each row execute function public.touch_server_updated_at()', 'trg_' || name || '_touch', name);
end;
$$;

create table public.bow (
	id text primary key,
	name text not null,
	type text not null,
	is_active integer not null default 1,
	notes text
);
-- bow.photo is deliberately absent: a bow photo stays on the device until photo sync gets its own
-- storage bucket and policies, see doc/sync.md section 7.
select public.add_sync_columns('public.bow');

create table public.arrow_set (
	id text primary key,
	label text not null,
	spine integer,
	length_mm integer,
	point_grain integer,
	fletching text,
	nock text,
	total_grain double precision,
	count integer
);
select public.add_sync_columns('public.arrow_set');

create table public.bow_revision (
	id text primary key,
	bow_id text not null,
	revision_no integer not null,
	settings text not null,
	arrow_set_id text,
	reason text,
	effective_from bigint not null
);
select public.add_sync_columns('public.bow_revision');
create index idx_bow_revision_bow on public.bow_revision (bow_id, revision_no);

create table public.session (
	id text primary key,
	label text,
	started_at bigint not null,
	kind text not null default 'practice',
	arrow_goal integer,
	bow_id text,
	bow_type text,
	bow_revision_id text,
	location text,
	latitude double precision,
	longitude double precision,
	weather text,
	notes text
);
select public.add_sync_columns('public.session');

create table public.activity (
	id text primary key,
	session_id text not null,
	kind text not null,
	round_definition_id text,
	round_definition text,
	template_key text,
	match_config text,
	observations text,
	measurements text,
	conclusion text,
	adjustment_made text,
	resulting_revision_id text,
	started_at bigint not null,
	total_score integer not null default 0,
	count_10s integer not null default 0,
	count_x integer not null default 0,
	arrows_shot integer not null default 0,
	status text not null default 'in_progress',
	notes text
);
select public.add_sync_columns('public.activity');
create index idx_activity_session on public.activity (session_id, started_at);

create table public.round_end (
	id text primary key,
	activity_id text not null,
	stage_index integer not null,
	end_no integer not null,
	subtotal integer not null default 0,
	opponent_subtotal integer,
	is_shoot_off integer not null default 0,
	winner text,
	setting_value double precision,
	video text
);
select public.add_sync_columns('public.round_end');
create index idx_end_activity on public.round_end (activity_id);

create table public.shot (
	id text primary key,
	end_id text not null,
	ordinal integer not null,
	value integer not null,
	zone_label text not null,
	side text not null default 'us',
	x double precision,
	y double precision,
	source text not null default 'manual',
	arrow_id text
);
select public.add_sync_columns('public.shot');
create index idx_shot_end on public.shot (end_id);

create table public.plan (
	id text primary key,
	name text not null,
	free_arrows integer,
	is_active integer not null default 1,
	start_date bigint,
	end_date bigint
);
select public.add_sync_columns('public.plan');

create table public.plan_slot (
	id text primary key,
	plan_id text not null,
	weekday integer not null,
	minute_of_day integer not null,
	arrow_goal integer,
	label text
);
select public.add_sync_columns('public.plan_slot');
create index idx_plan_slot_plan on public.plan_slot (plan_id, weekday);

create table public.sight_mark (
	id text primary key,
	bow_id text not null,
	distance integer not null,
	unit text not null,
	height text,
	interpolated integer not null default 0,
	windage text,
	clicker text,
	plunger text
);
select public.add_sync_columns('public.sight_mark');
create index idx_sight_mark_bow on public.sight_mark (bow_id, distance);

create table public.favourite_round (
	id text primary key,
	round_key text not null
);
select public.add_sync_columns('public.favourite_round');

-- badge, change_log and sync_state have no mirror on purpose. Badges are derived from the shooting
-- record and recomputed per device, and the log and the cursors are local bookkeeping.

drop function public.add_sync_columns(regclass);
