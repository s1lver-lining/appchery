-- Phase 3.1: handles, profiles, following, blocking, shared activities. See doc/sync.md section 6.
--
-- Migrated with phase 3 so the security model is designed whole, and read by no client screen until
-- 3.1. This file is where the app grows its first rows a stranger can reach, so the rules are in the
-- database and not in the client: the anon key is public and the client is not trusted.

create extension if not exists "citext";

create table public.profile (
	user_id uuid primary key references auth.users (id) on delete cascade,
	handle citext not null unique,
	display_name text,
	-- A public profile can be followed without approval and shows its shared activities to anyone.
	is_public boolean not null default false,
	created_at bigint not null,
	updated_at bigint not null,
	constraint handle_shape check (handle ~ '^[a-z0-9_]{3,20}$')
);

-- Handles nobody may claim, because an archer reading @admin or @support will believe it.
create table public.reserved_handle (handle citext primary key);
insert into public.reserved_handle (handle) values
	('admin'), ('administrator'), ('appchery'), ('support'), ('help'), ('root'), ('system'),
	('moderator'), ('mod'), ('staff'), ('official'), ('security'), ('api'), ('www'), ('null');

-- Retired rather than freed: somebody taking the handle you left a minute ago inherits every
-- mention of you. The row is kept until released_at is old enough for the RPC below to allow it.
create table public.retired_handle (
	handle citext primary key,
	user_id uuid not null references auth.users (id) on delete cascade,
	released_at timestamptz not null default now()
);

create table public.follow (
	follower_id uuid not null references auth.users (id) on delete cascade,
	followee_id uuid not null references auth.users (id) on delete cascade,
	-- pending | approved. A public profile approves on creation, a private one by hand.
	status text not null default 'pending',
	created_at timestamptz not null default now(),
	primary key (follower_id, followee_id),
	constraint no_self_follow check (follower_id <> followee_id)
);
create index idx_follow_followee on public.follow (followee_id, status);

create table public.block (
	blocker_id uuid not null references auth.users (id) on delete cascade,
	blocked_id uuid not null references auth.users (id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (blocker_id, blocked_id),
	constraint no_self_block check (blocker_id <> blocked_id)
);

-- Sharing is a flag on the activity, not a row per viewer: shared or not, and when shared it is
-- visible to whoever the profile rules already allow. Unsharing revokes because nothing was copied.
alter table public.activity add column shared_at bigint;
create index idx_activity_shared on public.activity (user_id) where shared_at is not null;

create or replace function public.is_blocked(owner uuid, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (select 1 from public.block where blocker_id = owner and blocked_id = viewer);
$$;

-- The one rule the whole social surface rests on: may this viewer see what that owner shared.
create or replace function public.can_view(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select case
		when auth.uid() is null then false
		when owner = auth.uid() then true
		when public.is_blocked(owner, auth.uid()) then false
		when exists (select 1 from public.profile where user_id = owner and is_public) then true
		else exists (
			select 1 from public.follow
			where followee_id = owner and follower_id = auth.uid() and status = 'approved'
		)
	end;
$$;

-- Shared activities, and the ends and shots underneath them, become readable to whoever can_view
-- allows. Permissive policies are ORed with the owner policies from 0002, so this only ever adds.
create policy activity_select_shared on public.activity for select
	using (shared_at is not null and public.can_view(user_id));

create policy end_select_shared on public.round_end for select
	using (exists (
		select 1 from public.activity a
		where a.id = round_end.activity_id and a.shared_at is not null and public.can_view(a.user_id)
	));

create policy shot_select_shared on public.shot for select
	using (exists (
		select 1 from public.round_end e
		join public.activity a on a.id = e.activity_id
		where e.id = shot.end_id and a.shared_at is not null and public.can_view(a.user_id)
	));

-- Conditions stay private: location, weather and the bow behind a shared activity never travel,
-- which is why session carries no shared policy at all.

alter table public.profile enable row level security;
alter table public.profile force row level security;
alter table public.follow enable row level security;
alter table public.follow force row level security;
alter table public.block enable row level security;
alter table public.block force row level security;
alter table public.reserved_handle enable row level security;
alter table public.reserved_handle force row level security;
alter table public.retired_handle enable row level security;
alter table public.retired_handle force row level security;

-- Forcing RLS subjects the owner to it, and a security definer function runs as the owner, so these
-- two need policies for the reads and writes claim_handle performs. What keeps a client out is the
-- absence of a grant, not the absence of a policy: no role but the function's own may address them.
create policy reserved_handle_read on public.reserved_handle for select using (true);
create policy retired_handle_read on public.retired_handle for select using (true);
create policy retired_handle_write on public.retired_handle for all using (true) with check (true);

-- The profile table itself is readable only by its owner. Everyone else goes through the masking
-- function below, so a blocked viewer cannot read is_public straight off the row and tell the
-- difference between being blocked and the profile being private.
create policy profile_select_own on public.profile for select using (user_id = (select auth.uid()));
create policy profile_insert_own on public.profile for insert with check (user_id = (select auth.uid()));
create policy profile_update_own on public.profile for update
	using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- You can see who follows you and who you follow, and you can remove either. Nobody sees a third
-- party's graph, and nobody inserts a follow by hand: request_follow decides what a request means.
create policy follow_select_involved on public.follow for select
	using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));
-- request_follow is the only writer, and it is ungranted to clients. The policy exists because the
-- function is subject to RLS like anybody else, and it still refuses to create a follow for a third party.
create policy follow_insert_self on public.follow for insert
	with check (follower_id = (select auth.uid()));
create policy follow_update_followee on public.follow for update
	using (followee_id = (select auth.uid())) with check (followee_id = (select auth.uid()));
create policy follow_delete_involved on public.follow for delete
	using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));

-- A block is never visible to the blocked account, by policy and not by convention.
create policy block_all_own on public.block for all
	using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

create table public.handle_lookup (
	user_id uuid not null references auth.users (id) on delete cascade,
	at timestamptz not null default now()
);
create index idx_handle_lookup_recent on public.handle_lookup (user_id, at desc);
alter table public.handle_lookup enable row level security;
alter table public.handle_lookup force row level security;
-- Only ever reached by lookup_profile, which counts and then appends. Ungranted, so an archer can
-- neither read their own rate limit nor delete the rows that enforce it.
create policy handle_lookup_own on public.handle_lookup for select using (user_id = (select auth.uid()));
create policy handle_lookup_append on public.handle_lookup for insert with check (user_id = (select auth.uid()));

-- Lookup is a function and not a select over profile, or the handle list is a directory anybody can
-- walk. Exact matches only, one row at a time, and rate limited per account.
create or replace function public.lookup_profile(wanted citext)
returns table (user_id uuid, handle citext, display_name text, is_public boolean, follow_status text)
language plpgsql
-- Volatile, not stable: looking somebody up spends a unit of the caller's rate limit, so the lookup
-- writes a row and cannot be folded away or cached by the planner.
security definer
set search_path = public
as $$
declare
	viewer uuid := auth.uid();
	recent integer;
begin
	if viewer is null then
		raise exception 'authentication required';
	end if;

	select count(*) into recent
	from public.handle_lookup l
	where l.user_id = viewer and l.at > now() - interval '1 minute';

	if recent >= 20 then
		raise exception 'too many lookups';
	end if;

	insert into public.handle_lookup (user_id) values (viewer);

	return query
	select
		p.user_id,
		p.handle,
		p.display_name,
		-- A blocked viewer is shown a private profile, identical in every field to a genuinely
		-- private one. Any difference here, in a value or in an error, announces the block.
		p.is_public and not public.is_blocked(p.user_id, viewer) as is_public,
		coalesce(
			(select f.status from public.follow f
				where f.followee_id = p.user_id and f.follower_id = viewer
				and not public.is_blocked(p.user_id, viewer)),
			'none'
		) as follow_status
	from public.profile p
	where p.handle = wanted;
end;
$$;

-- Claiming a handle checks the reserved and retired lists in the database, because a client side
-- check is a suggestion. Retired handles are held for thirty days before anyone else may take one.
create or replace function public.claim_handle(wanted citext, display text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	viewer uuid := auth.uid();
	previous citext;
	now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
	if viewer is null then
		raise exception 'authentication required';
	end if;
	if exists (select 1 from public.reserved_handle where handle = wanted) then
		raise exception 'handle unavailable';
	end if;
	if exists (
		select 1 from public.retired_handle
		where handle = wanted and user_id <> viewer and released_at > now() - interval '30 days'
	) then
		raise exception 'handle unavailable';
	end if;

	select p.handle into previous from public.profile p where p.user_id = viewer;

	insert into public.profile (user_id, handle, display_name, created_at, updated_at)
	values (viewer, wanted, display, now_ms, now_ms)
	on conflict (user_id) do update set handle = excluded.handle,
		display_name = coalesce(excluded.display_name, public.profile.display_name),
		updated_at = now_ms;

	if previous is not null and previous <> wanted then
		insert into public.retired_handle (handle, user_id) values (previous, viewer)
		on conflict (handle) do update set user_id = viewer, released_at = now();
	end if;

	delete from public.retired_handle where handle = wanted and user_id = viewer;
end;
$$;

-- A request from a blocked account returns exactly what a real one returns and stores nothing, so
-- the blocked account never learns it was blocked and the block never lands in a pending list.
create or replace function public.request_follow(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
	viewer uuid := auth.uid();
	target_public boolean;
begin
	if viewer is null then
		raise exception 'authentication required';
	end if;
	if target = viewer then
		raise exception 'cannot follow yourself';
	end if;

	select is_public into target_public from public.profile where user_id = target;
	if target_public is null then
		raise exception 'no such profile';
	end if;

	if public.is_blocked(target, viewer) then
		return 'pending';
	end if;

	insert into public.follow (follower_id, followee_id, status)
	values (viewer, target, case when target_public then 'approved' else 'pending' end)
	on conflict (follower_id, followee_id) do nothing;

	return case when target_public then 'approved' else 'pending' end;
end;
$$;

-- Blocking drops any follow in either direction: a block that leaves an existing follower reading
-- your scores is not a block.
create or replace function public.block_account(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	viewer uuid := auth.uid();
begin
	if viewer is null then
		raise exception 'authentication required';
	end if;
	if target = viewer then
		raise exception 'cannot block yourself';
	end if;

	insert into public.block (blocker_id, blocked_id) values (viewer, target) on conflict do nothing;
	delete from public.follow
	where (follower_id = viewer and followee_id = target)
		or (follower_id = target and followee_id = viewer);
end;
$$;

-- profile is written through claim_handle, and follow is created through request_follow, so neither
-- gets an insert grant here. What is left is what an archer legitimately does by hand: read their
-- own profile, flip it public or private, accept a follower, remove one, unblock somebody.
grant select, update on public.profile to authenticated;
grant select, update, delete on public.follow to authenticated;
grant select, insert, delete on public.block to authenticated;

revoke all on all functions in schema public from anon;
grant execute on function public.lookup_profile(citext) to authenticated;
grant execute on function public.claim_handle(citext, text) to authenticated;
grant execute on function public.request_follow(uuid) to authenticated;
grant execute on function public.block_account(uuid) to authenticated;
