-- A rate limit that only ever tightened, and never came back.
--
-- rate_limit is forced, so the security definer function is subject to its policies like anybody
-- else, and the table was given a select and an insert policy but no delete. The prune inside
-- spend_allowance therefore matched no rows and removed nothing, silently: a delete filtered by RLS
-- is not an error. The count that follows it reads every row the account has ever written, so the
-- window stopped meaning anything and each allowance became a lifetime total. Twenty handle searches
-- ever, then 'too many lookups' for good. Five handle changes ever. Sixty follows ever.
--
-- Two changes, because either alone would have been enough and the pair costs nothing: the policy
-- the prune needs, and a count that carries the window itself so the limit stays right even if some
-- future prune fails the same way.

create policy rate_limit_prune on public.rate_limit for delete using (user_id = (select auth.uid()));

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
	-- A window that runs backwards ages out rows that have not aged out, which empties the counter
	-- rather than reading it.
	if window_length <= interval '0' then
		raise exception 'a rate limit window must be positive';
	end if;

	delete from public.rate_limit r
	where r.user_id = viewer and r.action = spend_allowance.action and r.at < now() - window_length;

	select count(*) into recent
	from public.rate_limit r
	where r.user_id = viewer and r.action = spend_allowance.action
		and r.at > now() - window_length;

	if recent >= allowed then
		raise exception 'too many requests';
	end if;

	insert into public.rate_limit (user_id, action) values (viewer, spend_allowance.action);
end;
$$;

revoke all on function public.spend_allowance(text, integer, interval) from public, anon;

-- Whatever the broken prune left behind, so an account already locked out is not locked out for ever.
delete from public.rate_limit where at < now() - interval '1 day';
