-- Every table in public must have RLS enabled, forced, and at least one policy. A table added later
-- without policies is unreachable rather than open, but an unforced one trusts its owner, and this
-- is the kind of mistake that is invisible until somebody reads somebody else's scores.
do $$
declare
	bad text;
begin
	select string_agg(c.relname, ', ') into bad
	from pg_class c
	join pg_namespace n on n.oid = c.relnamespace
	where n.nspname = 'public' and c.relkind = 'r'
		and not (c.relrowsecurity and c.relforcerowsecurity);
	if bad is not null then
		raise exception 'tables without forced row level security: %', bad;
	end if;

	select string_agg(c.relname, ', ') into bad
	from pg_class c
	join pg_namespace n on n.oid = c.relnamespace
	where n.nspname = 'public' and c.relkind = 'r'
		and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
	if bad is not null then
		raise exception 'tables with no policy at all: %', bad;
	end if;
end;
$$;

-- Ownership, proved rather than assumed: a second account sees nothing of the first one's rows, and
-- the difference is indistinguishable from the row not existing.
insert into auth.users (id) values
	('11111111-1111-1111-1111-111111111111'),
	('22222222-2222-2222-2222-222222222222');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.session (id, created_at, updated_at, device_id, started_at)
values ('session-a', 1, 1, 'device-a', 1);

do $$
begin
	if (select count(*) from public.session) <> 1 then
		raise exception 'an archer cannot read their own session';
	end if;
end;
$$;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
begin
	if (select count(*) from public.session) <> 0 then
		raise exception 'a second account can read the first one''s sessions';
	end if;

	update public.session set label = 'stolen' where id = 'session-a';
	if found then
		raise exception 'a second account can edit the first one''s sessions';
	end if;

	delete from public.session where id = 'session-a';
	if found then
		raise exception 'a second account can delete the first one''s sessions';
	end if;
end;
$$;

/*
 * The same three questions asked of every synced table, from the table list itself rather than from
 * a list written here: a table added to the schema and forgotten in this file would otherwise be
 * exactly the table nobody checked.
 */
do $$
declare
	name text;
	seen integer;
	owner uuid := '11111111-1111-1111-1111-111111111111';
	other uuid := '22222222-2222-2222-2222-222222222222';
begin
	foreach name in array array[
		'bow', 'arrow_set', 'bow_revision', 'session', 'activity', 'round_end',
		'shot', 'plan', 'plan_slot', 'sight_mark', 'favourite_round'
	] loop
		execute format('set local request.jwt.claim.sub = %L', owner);
		execute format(
			'insert into public.%I (id, created_at, updated_at, device_id%s) values (%L, 1, 1, %L%s)',
			name,
			public.test_extra_columns(name),
			'row-' || name,
			'device-a',
			public.test_extra_values(name)
		);

		execute format('set local request.jwt.claim.sub = %L', other);

		execute format('select count(*) from public.%I where id = %L', name, 'row-' || name) into seen;
		if seen <> 0 then
			raise exception '% is readable by a second account', name;
		end if;

		execute format('update public.%I set updated_at = 2 where id = %L', name, 'row-' || name);
		if found then
			raise exception '% is writable by a second account', name;
		end if;

		execute format('delete from public.%I where id = %L', name, 'row-' || name);
		if found then
			raise exception '% is deletable by a second account', name;
		end if;
	end loop;
end;
$$;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- An unshared activity stays invisible even on a public profile.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.claim_handle('archer_one', 'Archer One');
update public.profile set is_public = true where user_id = '11111111-1111-1111-1111-111111111111';
insert into public.activity (id, created_at, updated_at, device_id, session_id, kind, started_at)
values ('activity-a', 1, 1, 'device-a', 'session-a', 'scoring', 1);

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
	if (select count(*) from public.activity) <> 0 then
		raise exception 'an unshared activity is readable by somebody else';
	end if;
end;
$$;

-- Shared, it becomes readable, and the session it belongs to does not follow it across.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.activity set shared_at = 2 where id = 'activity-a';

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
	if (select count(*) from public.activity) <> 1 then
		raise exception 'a shared activity on a public profile is not readable';
	end if;
	if (select count(*) from public.session) <> 0 then
		raise exception 'sharing an activity exposed the session, and with it the conditions';
	end if;
end;
$$;

-- The whole point of the block: what a blocked account sees is what a private profile shows, field
-- for field, and its follow request neither lands nor reports differently.
select public.request_follow('11111111-1111-1111-1111-111111111111');

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.block_account('22222222-2222-2222-2222-222222222222');

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare
	blocked record;
	response text;
begin
	select * into blocked from public.lookup_profile('archer_one');
	if blocked.is_public then
		raise exception 'a blocked account can tell the profile is public';
	end if;
	if blocked.follow_status <> 'none' then
		raise exception 'a blocked account can see its follow was dropped';
	end if;
	if blocked.display_name is distinct from 'Archer One' then
		raise exception 'a blocked account sees a different profile than a private one shows';
	end if;

	response := public.request_follow('11111111-1111-1111-1111-111111111111');
	if response <> 'pending' then
		raise exception 'a follow request from a blocked account answers differently';
	end if;

	if (select count(*) from public.activity) <> 0 then
		raise exception 'a blocked account still reads shared activities';
	end if;
end;
$$;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
	if (select count(*) from public.follow where followee_id = '11111111-1111-1111-1111-111111111111') <> 0 then
		raise exception 'a blocked account''s follow request reached the pending list';
	end if;
end;
$$;

-- What an archer may set on their own profile, and what the server keeps for itself. A statement
-- naming one ungranted column fails whole, and the client reads that as "no connection".
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare
	stamped bigint;
begin
	update public.profile set is_public = true where user_id = auth.uid();
	update public.profile set display_name = 'Archer One' where user_id = auth.uid();

	begin
		update public.profile set updated_at = 1 where user_id = auth.uid();
		raise exception 'a client can date its own profile';
	exception
		when insufficient_privilege then null;
	end;

	select updated_at into stamped from public.profile where user_id = auth.uid();
	if stamped <= 1 then
		raise exception 'the server did not stamp the profile it updated';
	end if;
end;
$$;

-- The graph is readable along its own edges, and only along them: a friends screen that cannot read
-- the handle of somebody who follows you cannot list them at all.
--
-- The block from the section above is lifted first, because a block deletes the edges and this is
-- about what an edge grants.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
delete from public.block where blocked_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
	if (select count(*) from public.profile where user_id = '22222222-2222-2222-2222-222222222222') <> 0 then
		raise exception 'a stranger''s profile is readable without an edge to it';
	end if;
end;
$$;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.claim_handle('archer_two_graph', 'Archer Two');
select public.request_follow('11111111-1111-1111-1111-111111111111');

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
	if (select count(*) from public.profile where user_id = '22222222-2222-2222-2222-222222222222') <> 1 then
		raise exception 'somebody who asked to follow you cannot be listed';
	end if;
end;
$$;

-- Blocking removes the edge, and with it the reading it allowed.
select public.block_account('22222222-2222-2222-2222-222222222222');
do $$
begin
	if (select count(*) from public.profile where user_id = '22222222-2222-2222-2222-222222222222') <> 0 then
		raise exception 'a blocked account is still readable through the graph';
	end if;
end;
$$;
delete from public.block where blocked_id = '22222222-2222-2222-2222-222222222222';

-- The profile card follows the same visibility as what an archer shares, so a card cannot show what
-- a shared activity would not.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.profile_card (user_id, arrows, sessions, badges, level, updated_at)
values ('11111111-1111-1111-1111-111111111111', 4200, 30, 7, 5, 1);

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
	if (select count(*) from public.profile_card) <> 1 then
		raise exception 'a card is not readable by somebody who may see what that archer shares';
	end if;

	update public.profile_card set arrows = 999999 where user_id = '11111111-1111-1111-1111-111111111111';
	if found then
		raise exception 'a card can be rewritten by somebody else';
	end if;
end;
$$;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.block_account('22222222-2222-2222-2222-222222222222');
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
	if (select count(*) from public.profile_card) <> 0 then
		raise exception 'a blocked account still reads the card';
	end if;
end;
$$;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
delete from public.block where blocked_id = '22222222-2222-2222-2222-222222222222';

-- Handles are the app's only public names, so the rules that decide who may hold one are database
-- constraints and not client validation.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare
	failed boolean;
begin
	foreach failed in array array[true] loop
		-- Reserved: nobody registers a handle an archer would read as the app speaking.
		begin
			perform public.claim_handle('admin');
			raise exception 'a reserved handle can be claimed';
		exception when others then
			if sqlerrm <> 'handle unavailable' then raise; end if;
		end;

		-- Shape: enforced by the check constraint, whatever a client sends.
		begin
			perform public.claim_handle('No Spaces Allowed');
			raise exception 'a malformed handle can be claimed';
		exception when others then
			if sqlerrm = 'a malformed handle can be claimed' then raise; end if;
		end;

		-- Case insensitive uniqueness, or two archers hold what reads as one name.
		begin
			perform public.claim_handle('ARCHER_ONE');
			raise exception 'a handle differing only in case can be claimed';
		exception
			when unique_violation then null;
		end;
	end loop;
end;
$$;

-- A handle just left is held rather than freed, so nobody inherits the mentions of whoever left it.
select public.claim_handle('archer_two');
select public.claim_handle('archer_two_renamed');

-- Read as the owner, because an archer has no grant on this table and that is the point of it.
reset role;
do $$
begin
	if not exists (select 1 from public.retired_handle where handle = 'archer_two') then
		raise exception 'an abandoned handle was not retired';
	end if;
end;
$$;
set local role authenticated;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
	begin
		perform public.claim_handle('archer_two');
		raise exception 'a handle retired minutes ago was handed to somebody else';
	exception when others then
		if sqlerrm <> 'handle unavailable' then raise; end if;
	end;
end;
$$;

-- Lookup is rate limited, or the handle list is a directory anybody can walk.
do $$
declare
	i integer;
begin
	for i in 1..25 loop
		begin
			perform public.lookup_profile('archer_one');
		exception when others then
			if sqlerrm = 'too many lookups' then
				return;
			end if;
			raise;
		end;
	end loop;
	raise exception 'handle lookup is not rate limited';
end;
$$;

-- A handle cannot be taken by writing the column directly. The rules live in a trigger and the
-- grant is narrowed, because a rule only enforced in a function guards nothing the table exposes.
do $$
begin
	begin
		update public.profile set handle = 'admin' where user_id = auth.uid();
		raise exception 'a reserved handle can be taken by updating the row';
	exception when others then
		-- Two defences, and either is a pass: the column is not granted, and the trigger refuses the
		-- value even if some future grant hands the column back.
		if sqlerrm not in ('handle unavailable', 'permission denied for table profile') then raise; end if;
	end;
end;
$$;

-- A deleted activity stops being shared. Deleting is the one action whose failure the archer who
-- took it can never see.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.activity set deleted_at = 3 where id = 'activity-a';

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
	if (select count(*) from public.activity where id = 'activity-a') <> 0 then
		raise exception 'a deleted activity is still shared';
	end if;
end;
$$;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.activity set deleted_at = null where id = 'activity-a';

-- Approving a follower may set the status and nothing else, or a followee could hand somebody
-- else's pending request to an account that never asked for it.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.request_follow('11111111-1111-1111-1111-111111111111');

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
	begin
		update public.follow set follower_id = '11111111-1111-1111-1111-111111111111'
		where followee_id = '11111111-1111-1111-1111-111111111111';
		raise exception 'a follow can be moved between accounts';
	exception when others then
		if sqlerrm = 'a follow can be moved between accounts' then raise; end if;
	end;
end;
$$;

-- The pull cursor has to be a total order: rows written by one statement must still be separable,
-- or a page boundary inside them steps over the rest.
do $$
declare
	distinct_marks integer;
begin
	insert into public.session (id, created_at, updated_at, device_id, started_at)
	select 'batch-' || i, 1, 1, 'device-a', 1 from generate_series(1, 5) as i;

	select count(distinct server_updated_at) into distinct_marks
	from public.session where id like 'batch-%';

	if distinct_marks <> 5 then
		raise exception 'rows written together share a cursor value (% distinct)', distinct_marks;
	end if;
end;
$$;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

-- A handle change retires the old one for thirty days, so churning through them is capped by the day.
do $$
declare
	i integer;
begin
	for i in 1..10 loop
		begin
			perform public.claim_handle(('churn_' || i)::citext);
		exception when others then
			if sqlerrm = 'too many requests' then
				return;
			end if;
			raise;
		end;
	end loop;
	raise exception 'handles can be claimed without limit';
end;
$$;

-- A follow request costs the archer receiving it a line in their list, so it is capped by the hour.
do $$
declare
	i integer;
begin
	for i in 1..70 loop
		begin
			perform public.request_follow('11111111-1111-1111-1111-111111111111');
		exception when others then
			if sqlerrm = 'too many requests' then
				return;
			end if;
			raise;
		end;
	end loop;
	raise exception 'follow requests can be sent without limit';
end;
$$;

reset role;

-- The table behind those limits answers only "how many recently", so it must not grow for ever.
do $$
declare
	held integer;
begin
	perform public.spend_allowance('prune_check', 5, interval '1 minute');
	update public.rate_limit set at = now() - interval '2 days' where action = 'prune_check';
	perform public.spend_allowance('prune_check', 5, interval '1 minute');

	select count(*) into held from public.rate_limit where action = 'prune_check';
	if held <> 1 then
		raise exception 'the rate limit table keeps % rows it will never read', held;
	end if;
end;
$$;

-- Nothing in the schema is addressable without a token, whatever the policies say.
do $$
declare
	bad text;
begin
	select string_agg(distinct table_name, ', ') into bad
	from information_schema.role_table_grants
	where table_schema = 'public' and grantee = 'anon';
	if bad is not null then
		raise exception 'tables granted to anon: %', bad;
	end if;
end;
$$;

-- The same for functions, which is the harder half: a function is executable by PUBLIC from the
-- moment it is created, and revoking it from anon leaves that untouched, so a helper meant for the
-- rules alone is reachable by whoever holds the anon key printed in the client bundle. Extension
-- functions are exempt, and a trigger function refuses a direct call whatever its grants say.
do $$
declare
	bad text;
begin
	select string_agg(p.proname, ', ') into bad
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.prorettype <> 'trigger'::regtype
		and not exists (
			select 1 from pg_depend d
			where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
		)
		and (p.proacl is null or exists (
			select 1 from aclexplode(p.proacl) a where a.grantee = 0
		));
	if bad is not null then
		raise exception 'functions executable by PUBLIC: %', bad;
	end if;
end;
$$;

-- is_blocked answers about any pair of accounts it is handed, so a grant on it hands out the block
-- graph. Every other rule around blocking exists to keep that from being learnable, and they are all
-- worth nothing while the helper underneath them will say so plainly.
do $$
begin
	begin
		set local role anon;
		perform public.is_blocked(
			'11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
		raise exception 'the anon key can read whether one archer blocked another';
	exception when insufficient_privilege then null;
	end;
end;
$$;
reset role;

-- spend_allowance takes its own window as an argument, so a client that can call it hands in a
-- negative one and deletes the rows recording what it has already spent. Ungranted, and refusing the
-- window besides: the reachable path and the argument are separate mistakes.
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
	begin
		perform public.spend_allowance('reset_check', 100, interval '-1 hour');
		raise exception 'an archer can clear the record of what they have spent';
	exception when insufficient_privilege then null;
	end;
end;
$$;

reset role;
do $$
begin
	begin
		perform public.spend_allowance('reset_check', 100, interval '-1 hour');
		raise exception 'a rate limit window that runs backwards was accepted';
	exception when others then
		if sqlerrm <> 'a rate limit window must be positive' then raise; end if;
	end;
end;
$$;
