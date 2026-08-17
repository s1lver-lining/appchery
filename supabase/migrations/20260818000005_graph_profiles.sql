-- The friends screen needs the name and handle of everybody in the archer's graph, and until now the
-- only way to read a profile was to look its handle up one at a time. A follower whose handle had
-- never been typed in was therefore invisible: the followers list and the pending requests could not
-- be built at all.
--
-- Reading is granted along the graph and nowhere else. A block deletes the follow rows in both
-- directions, so a blocked account has no edge left to read along, and the handle search stays the
-- only way to reach a stranger.
create policy profile_select_graph on public.profile for select
	using (
		exists (
			select 1 from public.follow f
			where (f.follower_id = (select auth.uid()) and f.followee_id = profile.user_id)
				or (f.followee_id = (select auth.uid()) and f.follower_id = profile.user_id)
		)
	);
