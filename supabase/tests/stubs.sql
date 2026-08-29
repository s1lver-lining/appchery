-- What a plain Postgres lacks and Supabase supplies: the auth schema, the roles the policies name,
-- and auth.uid(). Enough to prove the migrations apply and the policies compile, which is the part
-- worth catching before a deploy. Behaviour is proven by the policy tests, against a real stack.
create role anon;
create role authenticated;
create schema if not exists auth;

create table auth.users (id uuid primary key);

-- Supabase grants this; without it a test calling auth.uid() directly fails where the real thing works.
grant usage on schema auth to authenticated;

-- The real one reads a JWT claim. This reads a session setting so a test can become somebody.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
	select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

/*
 * The not null columns each table needs beyond the four every row has, so the isolation test can
 * insert one row per table without a hand written INSERT for each. Test scaffolding, never migrated:
 * the synced tables carry no foreign keys, so any value of the right type will do.
 */
create or replace function public.test_extra_columns(name text)
returns text
language sql
immutable
as $$
	select case name
		when 'bow' then ', name, type'
		when 'arrow_set' then ', label'
		when 'bow_revision' then ', bow_id, revision_no, settings, effective_from'
		when 'session' then ', started_at'
		when 'activity' then ', session_id, kind, started_at'
		when 'round_end' then ', activity_id, stage_index, end_no'
		when 'shot' then ', end_id, ordinal, value, zone_label'
		when 'plan' then ', name'
		when 'plan_slot' then ', plan_id, weekday, minute_of_day'
		when 'sight_mark' then ', bow_id, distance, unit'
		when 'favourite_round' then ', round_key'
		else ''
	end;
$$;

create or replace function public.test_extra_values(name text)
returns text
language sql
immutable
as $$
	select case name
		when 'bow' then ', ''a bow'', ''recurve'''
		when 'arrow_set' then ', ''a set'''
		when 'bow_revision' then ', ''bow-1'', 1, ''{}'', 1'
		when 'session' then ', 1'
		when 'activity' then ', ''session-1'', ''scoring'', 1'
		when 'round_end' then ', ''activity-1'', 0, 1'
		when 'shot' then ', ''end-1'', 1, 10, ''10'''
		when 'plan' then ', ''a plan'''
		when 'plan_slot' then ', ''plan-1'', 0, 600'
		when 'sight_mark' then ', ''bow-1'', 18, ''m'''
		when 'favourite_round' then ', ''wa18'''
		else ''
	end;
$$;

-- Held to the same rule as the migrated functions, so the assertion that nothing in public is
-- executable by PUBLIC can be read as being about the schema rather than about an exemption list.
revoke all on function public.test_extra_columns(text) from public;
revoke all on function public.test_extra_values(text) from public;
grant execute on function public.test_extra_columns(text) to authenticated;
grant execute on function public.test_extra_values(text) to authenticated;
