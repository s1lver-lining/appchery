-- A function is granted to PUBLIC the moment it is created, and revoking it from anon does not take
-- that away: anon holds it through PUBLIC, not through a grant of its own. So every
-- `revoke all on all functions in schema public from anon` written so far has been inert, and the
-- helpers behind the social rules have been callable by anybody holding the anon key, which is
-- printed in the client bundle. Tables were never exposed this way, because tables carry no default
-- grant. Only functions and schema usage do.
--
-- Two of them were reachable and answered.

/*
 * 1. is_blocked(owner, viewer) takes both accounts as arguments and reads the block table as its
 *    definer, so it answered for any pair. The blocked account could ask whether it was blocked, and
 *    a stranger could read the block graph of two people they had nothing to do with. Every other
 *    rule around blocking exists to keep exactly this from being learnable: lookup_profile masks a
 *    block as a private profile, request_follow returns 'pending' and stores nothing, and the block
 *    policy shows the row to the blocker alone. The helper underneath them answered plainly.
 *
 *    It is called only from can_view, lookup_profile and request_follow, all security definer, where
 *    execute is checked against the definer. Nothing outside needs to reach it.
 */
revoke all on function public.is_blocked(uuid, uuid) from public, anon;

/*
 * 2. spend_allowance takes the window as an argument and deletes what has aged out of it, so a
 *    direct call with a negative interval deleted every row that had not aged out either, and the
 *    caller's allowance was empty again. That is the whole of the rate limiting: the handle limit
 *    holding the thirty day retirement shut, the lookup limit keeping the handle list from being
 *    walked, the follow limit keeping a pending list from being filled.
 *
 *    Ungranted, and refusing a window that runs backwards regardless, because the argument only has
 *    to be wrong once and a grant is easier to reintroduce than to notice.
 */
revoke all on function public.spend_allowance(text, integer, interval) from public, anon;

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
	where r.user_id = viewer and r.action = spend_allowance.action;

	if recent >= allowed then
		raise exception 'too many requests';
	end if;

	insert into public.rate_limit (user_id, action) values (viewer, spend_allowance.action);
end;
$$;

revoke all on function public.spend_allowance(text, integer, interval) from public, anon;

/*
 * 3. The four an archer legitimately calls. Each already refuses a caller with no auth.uid(), so
 *    anon reaching them was never a way in, but a token is what the schema comment promises and a
 *    grant is cheaper to read than the null check inside every one of them. can_view stays reachable
 *    by authenticated: the shared activity policies call it, and a policy is checked against the
 *    role running the query rather than against the definer.
 */
revoke all on function public.can_view(uuid) from public, anon;
revoke all on function public.lookup_profile(citext) from public, anon;
revoke all on function public.claim_handle(citext, text) from public, anon;
revoke all on function public.request_follow(uuid) from public, anon;
revoke all on function public.block_account(uuid) from public, anon;

grant execute on function public.can_view(uuid) to authenticated;
grant execute on function public.lookup_profile(citext) to authenticated;
grant execute on function public.claim_handle(citext, text) to authenticated;
grant execute on function public.request_follow(uuid) to authenticated;
grant execute on function public.block_account(uuid) to authenticated;
