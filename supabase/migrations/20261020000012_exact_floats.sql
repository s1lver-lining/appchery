-- Postgres prints a double with fifteen significant digits by default, two short of what it stores,
-- so a plotted arrow or a GPS fix read back by the device it came from never matched it exactly.
-- Three asks for the shortest text that round trips. New connections take it; see doc/sync.md § 4.
do $$
begin
	execute format('alter database %I set extra_float_digits = 3', current_database());
end;
$$;
