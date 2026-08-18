# Migrations

Two independent migration systems: the SQLite database on the device, and the Postgres database on
the server. They are never generated from each other. A column added to one is added to the other by
hand, in the same commit.

## Client, SQLite

`src/lib/db/migrations.ts` holds an array of statement groups. Index 0 is migration 0001, and the
array index plus one is the version written to SQLite's `user_version`. They are strings, not files,
because a webview has no filesystem to read migrations from.

**Never edit a released migration.** Databases that already ran it will not run it again, and they
silently diverge. Append a new one instead.

### Add a migration

1. Append a group to the end of the array in `src/lib/db/migrations.ts`, with a `// 00NN what it does` comment.
2. Mirror the change in `src/lib/db/schema.ts`, so Drizzle's types match the columns that now exist.
3. Mirror it in `supabase/migrations/` too if the table syncs, and add the column to
   `src/lib/db/synced.ts` if it is a whole new table.
4. `npm test`

```bash
npm test        # smoke tests apply every migration to a real SQLite
npm run check   # schema.ts and the app agree
```

### Rules

- One group per migration, applied in one transaction by the runner.
- `ALTER TABLE ... ADD COLUMN` is safe. Renaming and dropping are not: SQLite rewrites the table,
  and old app versions may still be running against it on another device.
- A migration that repairs data must log to `change_log` before it repairs, or the repair never
  reaches the server: log the rows it is about to touch, then touch them.
- A test that needs a specific migration indexes it by number, never by "the last one".

### Never squash again

Migration 0001 is a collapse of the eighteen migrations written during development. It was safe
exactly once, because every database that had run them was thrown away on purpose.

Squashing costs two things once anybody's data is real, and neither announces itself:

- The array length is the schema version. Collapse to one group and a device sitting at version 18
  runs nothing, looks fine, then silently skips the next migration you append, because 18 is already
  past it.
- Backup files carry the version they were written at, and a restore refuses anything higher than
  `MIGRATIONS.length`. Shortening the array makes existing backup files unreadable.

## Server, Postgres

`supabase/migrations/`, plain SQL, applied in filename order. Filenames are
`<utc timestamp>_<name>.sql`.

### Add a migration

```bash
npx supabase migration new add_something   # creates the timestamped file
$EDITOR supabase/migrations/*_add_something.sql
npm run db:check                           # applies every migration to a throwaway Postgres, runs the policy tests
```

It also holds the two schemas against each other: every column push sends must exist on the server,
and no column the server insists on may go unsent. The two are written by hand in two languages, and
drift between them reaches an archer as a permission or a not null error.

`npm run db:check` needs Docker and takes a few seconds. It uses plain `postgres:16` with
`supabase/tests/stubs.sql` standing in for `auth.uid()` and the roles, so it proves the SQL applies
and the policies behave. It says nothing about GoTrue or PostgREST.

### Rules

- **Every new table needs RLS enabled, forced, and a policy**, or `npm run db:check` fails. A table
  meant to be unreachable still gets forced RLS and policies for the security definer functions that
  use it; what keeps clients out is the absent grant.
- Grants are explicit. A new table is addressable by nobody until it is granted to `authenticated`.
- Never edit a migration that has been pushed to preprod or prod. Append.
- Add a case to `supabase/tests/rls.sql` for any policy that decides who reads somebody else's rows.

## Applying server migrations

Local stack:

```bash
npx supabase start      # applies everything in supabase/migrations
npx supabase db reset   # reapply from scratch after editing an unreleased migration
```

Remote, one project per environment:

```bash
export APPCHERY_SUPABASE_PREPROD=<preprod project ref>
export APPCHERY_SUPABASE_PROD=<prod project ref>

npm run db:push:preprod
npm run db:push:prod
```

`db push` applies only the migrations that project has not seen. Order of work for any schema
change: local, then preprod, then prod, and the server migration goes out **before** the app build
that needs it. A client that pushes a column the server does not have gets an error; a server with a
column no client sends yet is harmless.
