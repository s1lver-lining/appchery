-- Row Level Security for the synced tables, see doc/sync.md section 3.
--
-- The anon key is public by definition, so nothing here may depend on the client behaving. Every
-- table is forced, meaning the policies apply to the table owner too, and every table gets all four
-- verbs. A table without a policy is unreachable rather than open, but an unforced table with a
-- permissive owner is exactly the accident this guards against.
--
-- There are no foreign keys between synced tables. Push uploads in chunks, and a chunk boundary can
-- land between a session and its activities, so a constraint here would reject a legitimate upload
-- that the next chunk completes. Referential integrity is the local database's job, where the whole
-- graph is written in one transaction.

create or replace function public.apply_owner_policies(target regclass)
returns void
language plpgsql
as $$
declare
	name text := target::text;
	short text := split_part(name, '.', 2);
begin
	execute format('alter table %s enable row level security', name);
	execute format('alter table %s force row level security', name);

	execute format('create policy %I on %s for select using (user_id = (select auth.uid()))',
		short || '_select_own', name);
	execute format('create policy %I on %s for insert with check (user_id = (select auth.uid()))',
		short || '_insert_own', name);
	execute format('create policy %I on %s for update using (user_id = (select auth.uid()))
		with check (user_id = (select auth.uid()))', short || '_update_own', name);
	execute format('create policy %I on %s for delete using (user_id = (select auth.uid()))',
		short || '_delete_own', name);
end;
$$;

select public.apply_owner_policies(t) from unnest(array[
	'public.bow'::regclass,
	'public.arrow_set'::regclass,
	'public.bow_revision'::regclass,
	'public.session'::regclass,
	'public.activity'::regclass,
	'public.round_end'::regclass,
	'public.shot'::regclass,
	'public.plan'::regclass,
	'public.plan_slot'::regclass,
	'public.sight_mark'::regclass,
	'public.favourite_round'::regclass
]) as t;

drop function public.apply_owner_policies(regclass);

-- A client may never write the columns that decide ownership or drive the pull cursor, whatever it
-- sends. The insert policy already pins user_id, but an update could otherwise hand a row to
-- somebody else, and server_updated_at is reset by trigger on every write regardless.
create or replace function public.reject_ownership_change()
returns trigger
language plpgsql
as $$
begin
	if new.user_id is distinct from old.user_id then
		raise exception 'user_id is not writable';
	end if;
	return new;
end;
$$;

do $$
declare
	name text;
begin
	foreach name in array array[
		'bow', 'arrow_set', 'bow_revision', 'session', 'activity', 'round_end',
		'shot', 'plan', 'plan_slot', 'sight_mark', 'favourite_round'
	] loop
		execute format('create trigger %I before update on public.%I
			for each row execute function public.reject_ownership_change()', 'trg_' || name || '_owner', name);
	end loop;
end;
$$;

-- Nothing in this schema is reachable without a token. The social surface in 0003 grants the only
-- exceptions, and it grants them through functions rather than by opening a table.
revoke all on schema public from anon;
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

-- Grants are stated rather than inherited from whatever the platform hands a new schema. RLS decides
-- which rows an archer reaches; a grant decides whether the table is addressable at all, and the two
-- are worth keeping independent so a policy mistake still meets a closed door.
grant usage on schema public to authenticated;
do $$
declare
	name text;
begin
	foreach name in array array[
		'bow', 'arrow_set', 'bow_revision', 'session', 'activity', 'round_end',
		'shot', 'plan', 'plan_slot', 'sight_mark', 'favourite_round'
	] loop
		execute format('grant select, insert, update, delete on public.%I to authenticated', name);
	end loop;
end;
$$;
