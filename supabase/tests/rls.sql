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

reset role;

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
