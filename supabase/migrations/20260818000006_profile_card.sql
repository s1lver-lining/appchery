-- The figures a profile page shows about somebody: arrows shot, outings, badges earned, level.
--
-- Published rather than synced. Badges and experience are derived from the shooting record and
-- recomputed on every device, so the server cannot work them out and is never asked to: the device
-- computes the card and overwrites it, and no client ever reads its own back. It can be stale, which
-- is acceptable for a display of somebody else's badge count and unacceptable for anything the app
-- reasons about. Keeping the two apart is what stops a stale figure becoming a fact.
create table public.profile_card (
	user_id uuid primary key references auth.users (id) on delete cascade,
	arrows integer not null default 0,
	sessions integer not null default 0,
	badges integer not null default 0,
	level integer not null default 1,
	updated_at bigint not null
);

alter table public.profile_card enable row level security;
alter table public.profile_card force row level security;

-- Written by its owner, read by whoever may already see what that archer shares. can_view answers
-- the block, the private profile and the approved follower in one place, so the card cannot drift
-- from the rules the shared activities follow.
create policy profile_card_write_own on public.profile_card for all
	using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy profile_card_select_visible on public.profile_card for select
	using (public.can_view(user_id));

grant select, insert, update on public.profile_card to authenticated;
