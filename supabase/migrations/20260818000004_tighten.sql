-- Four holes found reviewing phase 3, each proved against a real deployment before being fixed.
--
-- The shape of all four is the same mistake: a rule enforced in a function, with the table left
-- writable underneath it. A function is only a rule when nothing else can reach the columns it guards.

/*
 * 1. Handles. claim_handle checks the reserved list, the retired list and case insensitive
 *    uniqueness, but `grant update on profile` let a client set the column directly and skip all
 *    three. Anybody could take @admin. Grants are narrowed to the two columns an archer may set by
 *    hand, and the rules move into a trigger so no future grant can reopen this.
 */
revoke update on public.profile from authenticated;
grant update (display_name, is_public) on public.profile to authenticated;

create or replace function public.enforce_handle_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if tg_op = 'UPDATE' and new.handle is not distinct from old.handle then
		return new;
	end if;

	if exists (select 1 from public.reserved_handle where handle = new.handle) then
		raise exception 'handle unavailable';
	end if;

	if exists (
		select 1 from public.retired_handle
		where handle = new.handle and user_id <> new.user_id and released_at > now() - interval '30 days'
	) then
		raise exception 'handle unavailable';
	end if;

	return new;
end;
$$;

create trigger trg_profile_handle_rules
	before insert or update on public.profile
	for each row execute function public.enforce_handle_rules();

/*
 * 2. A deleted activity kept its shared_at, and the shared policies never looked at deleted_at, so
 *    an archer who deleted a shared round went on showing it to their followers. Deleting is the one
 *    action whose failure is invisible to the person who took it.
 */
drop policy activity_select_shared on public.activity;
drop policy end_select_shared on public.round_end;
drop policy shot_select_shared on public.shot;

create policy activity_select_shared on public.activity for select
	using (shared_at is not null and deleted_at is null and public.can_view(user_id));

create policy end_select_shared on public.round_end for select
	using (
		deleted_at is null
		and exists (
			select 1 from public.activity a
			where a.id = round_end.activity_id
				and a.shared_at is not null
				and a.deleted_at is null
				and public.can_view(a.user_id)
		)
	);

create policy shot_select_shared on public.shot for select
	using (
		deleted_at is null
		and exists (
			select 1 from public.round_end e
			join public.activity a on a.id = e.activity_id
			where e.id = shot.end_id
				and e.deleted_at is null
				and a.shared_at is not null
				and a.deleted_at is null
				and public.can_view(a.user_id)
		)
	);

/*
 * 3. Approving a follower was an update on the whole row, so a followee could rewrite follower_id
 *    and turn one archer's pending request into an approved follow for somebody who never asked.
 *    Status is the only column approving may touch.
 */
revoke update on public.follow from authenticated;
grant update (status) on public.follow to authenticated;

create or replace function public.reject_follow_rewrite()
returns trigger
language plpgsql
as $$
begin
	if new.follower_id is distinct from old.follower_id or new.followee_id is distinct from old.followee_id then
		raise exception 'a follow cannot be moved between accounts';
	end if;
	if new.status not in ('pending', 'approved') then
		raise exception 'unknown follow status';
	end if;
	return new;
end;
$$;

create trigger trg_follow_no_rewrite
	before update on public.follow
	for each row execute function public.reject_follow_rewrite();

/*
 * 4. server_updated_at is the pull cursor, and now() is the transaction clock, so every row of one
 *    upsert carried the same value. A page boundary landing inside such a group would step over the
 *    rest of it, because the next page asks for rows strictly newer than the last one seen.
 *    clock_timestamp() ticks per row, which makes the cursor a total order again.
 */
create or replace function public.touch_server_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.server_updated_at := clock_timestamp();
	return new;
end;
$$;
