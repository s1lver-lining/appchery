-- Three ways the app could lean on the server harder than an archer ever would.
--
-- handle_lookup counted the last minute of searches and kept every row for ever: a table that only
-- ever answers "how many in the last minute" was growing without bound. It becomes one table for
-- every limit, pruned as it is used.
--
-- request_follow and claim_handle had no limit at all. Neither is expensive on its own, but nothing
-- stopped a client asking a thousand times: a pending list can be filled with requests, and handles
-- can be churned through faster than the thirty day retirement can hold them.

create table public.rate_limit (
	user_id uuid not null references auth.users (id) on delete cascade,
	action text not null,
	at timestamptz not null default now()
);
create index idx_rate_limit_recent on public.rate_limit (user_id, action, at desc);

alter table public.rate_limit enable row level security;
alter table public.rate_limit force row level security;

-- Reached only by the security definer functions below, which are subject to RLS like anybody else.
-- Ungranted, so an archer can neither read their own allowance nor delete the rows enforcing it.
create policy rate_limit_own on public.rate_limit for select using (user_id = (select auth.uid()));
create policy rate_limit_append on public.rate_limit for insert with check (user_id = (select auth.uid()));

/*
 * Counts what this archer has done recently, records this one, and clears what has aged out. Raises
 * rather than returning a flag, because every caller would only raise anyway.
 */
create or replace function public.spend_allowance(action text, allowed integer, window_length interval)
returns void
language plpgsql
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

	delete from public.rate_limit r
	where r.user_id = viewer and r.action = spend_allowance.action and r.at < now() - window_length;

	select count(*) into recent
	from public.rate_limit r
	where r.user_id = viewer and r.action = spend_allowance.action;

	if recent >= allowed then
		raise exception 'too many requests';
	end if;

	insert into public.rate_limit (user_id, action) values (viewer, spend_allowance.action);
end;
$$;

create or replace function public.lookup_profile(wanted citext)
returns table (user_id uuid, handle citext, display_name text, is_public boolean, follow_status text)
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

	begin
		perform public.spend_allowance('lookup', 20, interval '1 minute');
	exception when others then
		-- The message the client already knows, kept from before this table was generalised.
		raise exception 'too many lookups';
	end;

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

drop table public.handle_lookup;

-- A follow request costs the archer receiving it a line in their pending list, so it is limited by
-- the hour. Blocked requests are counted too: they cost nothing to store and everything to send.
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

	perform public.spend_allowance('follow', 60, interval '1 hour');

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

-- Changing handle is rare and retires the old one for thirty days, so a handful a day is generous.
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

	perform public.spend_allowance('handle', 5, interval '1 day');

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

grant execute on function public.lookup_profile(citext) to authenticated;
grant execute on function public.claim_handle(citext, text) to authenticated;
grant execute on function public.request_follow(uuid) to authenticated;
