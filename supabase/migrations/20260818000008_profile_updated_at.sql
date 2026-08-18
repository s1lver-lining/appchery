-- Making a profile public failed with permission denied, and the client read that as "no connection".
--
-- 20260818000004 narrowed the grant to `update (display_name, is_public)`, which is the right pair
-- of columns for an archer to set by hand. But setProfilePublic also wrote updated_at, and a column
-- outside the grant fails the whole statement. The stamp is not the client's to write anyway: it is
-- what the sync orders profiles by, and a client that can set it can date a row into the future.

create or replace function public.stamp_profile_updated()
returns trigger
language plpgsql
as $$
begin
	new.updated_at := (extract(epoch from now()) * 1000)::bigint;
	return new;
end;
$$;

-- After the handle rules, so a rejected update is never stamped: triggers of one kind run by name.
create trigger trg_profile_stamp_updated
	before update on public.profile
	for each row execute function public.stamp_profile_updated();
