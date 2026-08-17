# Appchery — Sync and social

Plan for phase 3 (sync) and phase 3.1 (profiles, follows, shared activities). Companion to
[architecture.md](./architecture.md) and [data-model.md](./data-model.md).

Nothing here changes the first rule of the app: the local SQLite database is the source of truth,
and everything works forever with the server switched off. Sync is additive. An archer who never
signs in must not be able to tell this phase happened.

## 1. What is already in place

Phase 1 built the scaffolding and phase 2 left it untouched, which is exactly what was intended:

- `change_log` records every mutation with its table, row id, operation and timestamp, and a null
  `synced_at` meaning pending. All persistence goes through `src/lib/db/repository.ts`, so the log
  is complete by construction.
- `sync_state` holds a device id, a pull cursor, a push cursor and an endpoint. Never written yet.
- Every user table carries `created_at`, `updated_at`, `deleted_at` and `device_id`.
- Deletes are soft everywhere, so tombstones exist to be pushed.
- `src/lib/db/backup.ts` already serialises every table in parent before child order. That ordering
  is the order sync applies rows in, and it is worth keeping the two lists in one place.

Three gaps the scaffolding does not cover, answered in section 4.

1. `change_log` stores no payload, only a row reference, so push reads current row state. Ten edits
   of one end collapse into one upload, which is a feature, but a hard deleted row is unpushable.
2. `wipeAll()` and the import reset path hard delete and clear `change_log`.
3. Bulk import can enqueue thousands of pending rows at once.

## 2. What syncs, and what deliberately does not

**Synced.** The raw shooting record and the equipment behind it: `session`, `activity`, `end`,
`shot`, `bow`, `bow_revision`, `arrow_set`, `sight_mark`, `plan`, `plan_slot`, `favourite_round`.

**Local, forever.** Anything derived or recalibrated: badges, experience, personal bests,
preferences, theme, celebration state. These are recomputed from the shooting record on every
device, so syncing them would be syncing a cache and inviting conflicts over data that has a single
correct answer already. A second device that pulls a year of shooting earns the badges itself.

The visible cost is that a device pulling history for the first time re-celebrates level ups. The
settings data tab already has the button that resets celebration state, and the recheck already
reconciles badges, so both are one press away.

**Published, not synced.** The profile card in phase 3.1. See section 7.

## 3. Server

Supabase, self-hostable, as decided in architecture.md section 3. A `supabase/` directory in the
repository holds the SQL migrations so the server schema is reviewed next to the client one.

Postgres mirrors the SQLite tables column for column, plus `user_id uuid not null` on every one.
Row Level Security is forced on every table, and a test enumerates `pg_tables` and fails on any
table without it. The anon key is public by definition, so no policy may depend on the client
behaving, and every write path checks ownership server side.

`user_id` arrives on the client through a migration adding a nullable column to every user table.
Nullable because rows shot before signing in have no owner. Signing in stamps every null row with
the new user id and marks them pending, which is what adopting existing data into an account means.
Local only use never reads the column.

## 4. Push, pull, and the three gaps

### Push

Read `change_log` where `synced_at` is null, ordered by id. Chunk it, dedupe to the latest operation
per table and row, read those rows from SQLite, upsert one call per table, then stamp `synced_at` on
the consumed log ids and advance `last_push_cursor`. A tombstone is an ordinary upsert of a row with
`deleted_at` set. A failed chunk leaves everything after it pending, so a retry resumes rather than
restarts, which is what makes a bulk import of thousands of rows survivable.

### Pull

The cursor is the server side `updated_at` high water mark in `last_pull_cursor`. Fetch rows newer
than it, ordered, paged, applied parent before child inside one transaction. Pulled rows must not
re-enter `change_log`, so pull writes through its own path rather than the repository. `dataChanged()`
fires after a pull that wrote anything, or the mounted pages go on showing what they read on load.

### Conflicts

Last writer wins per row on `updated_at`, ties broken by `device_id` so both devices reach the same
answer rather than each keeping its own. Sessions are append only and never merged, per
architecture.md section 6: if one exists on both sides the earlier `created_at` wins outright and the
other side's edits are dropped, not blended. Two devices editing one session is pathological; a
session belongs to the device that shot it.

### Wipe, restore, import

A local wipe requires signing out first. Deleting the account's data on the server is a separate,
explicit action that never touches the phone, and wiping the phone never touches the server. Neither
is a side effect of the other, because the archer asking to free up space on a phone is not asking to
lose their history, and an archer closing an account is not asking to wipe the device in their hand.

Restoring a backup re-enqueues every restored row as pending rather than clearing the log.

## 5. Orchestration

`syncNow()` pushes then pulls, guarded so only one runs at a time, exposing a store with idle,
syncing, error, pending count and last success. It runs on sign in, on app resume, on regaining
connectivity, on a manual button, and after a session closes. Never on a timer while scoring.
Failures are silent and retried: being offline at a range is the normal case, not an error. Sync is
absent from the boot path entirely, so a broken sync can never stop somebody scoring.

The settings account section shows, signed out, that sync is optional and everything works without
it. Signed in it shows the account, the last sync, the pending count and sign out. Signing out keeps
the local database untouched.

## 6. Phase 3.1: profiles, follows, shared activities

The client lands after phase 3, but the tables and policies are designed and migrated as part of
phase 3 so the security model is built whole rather than bolted on. No client screen reads them
until 3.1.

### The public surface

Phase 3 has one policy shape, `user_id = auth.uid()`, and no publicly readable row anywhere. The
`profile` table is the first exception and therefore the app's entire public attack surface. It holds
a handle, a display name and a public flag. Never the email. Handle lookup is a rate limited RPC
rather than an open select, or anyone can enumerate every user of the app.

A handle is optional. Sync works without one, and the app asks for it the first time the archer
opens the friends screen, so an archer who only wants their scores on two devices never becomes
discoverable.

Handle rules are database constraints, not client validation: charset, length, case insensitive
uniqueness, and a reserved list so nobody registers `@admin`. A handle can be changed, and the old
one is retired for a period rather than immediately reusable, or somebody takes the handle you just
left and inherits the confusion.

### Following, privacy, blocking

Following is one directional. A public profile can be followed by anyone without approval, and its
shared activities are readable while browsing it. A private profile approves each follower, and only
approved followers see anything. Switching to private is retroactive and immediate: people who could
see a shared activity a minute ago cannot now.

Everyone can list who follows them and remove a follower.

A block is indistinguishable from privacy from the outside. The blocked account sees the profile
exactly as it would see a private one, can send follow requests that are silently discarded and
never reach the pending list, and never learns it was blocked. This has to hold in the policy itself,
because a different error message, a different row count or a different response time leaks it.

### Sharing

Sharing is a flag on the activity, not a row per viewer. Shared or not shared, and when shared it is
visible to whoever the profile rules already allow. Unsharing revokes, because nothing was ever
copied. Shares are read only for everybody except the owner, always: no follower can edit somebody
else's scores.

What travels is the activity, its ends and its shots. Not location, not weather, not the bow.
Conditions are private by architecture.md section 6.1 and stay that way.

### The profile card

Badges and statistics stay local derived state, so the server cannot compute them. Instead the
device computes a small card and **publishes** it: a one way overwrite on each push, never read back,
never merged, and never a source the local database trusts. It can be stale. That is acceptable for
a display of somebody else's badge count and unacceptable for anything the app reasons about, which
is why the two are separate systems rather than one.

### Offline

Followed profiles and the activities they shared are pulled into local SQLite so they are readable
at the range. Changing anything social, following, sharing, blocking, needs a connection and says so
clearly rather than queueing something that sits unsent for days.

## 7. Security work, as its own step

Not a review at the end. Each of these is a task:

- RLS forced on every table, verified by a test that fails on any table without it.
- Policy tests per table: a second account must fail to read, update or delete the first account's
  rows, and the failure must look identical to the row not existing.
- Block tests: a blocked account's view of a public profile is byte identical to its view of a
  private one.
- Handle enumeration: search is rate limited and returns nothing that a directory scrape could walk.
- Storage buckets, when bow photos eventually sync, keyed by user id with their own policies.
- No service role key in the client, ever, on any platform.

## 8. Order of work

Steps 1 to 3 are independently shippable and useless alone. Steps 4 to 6 are the feature.

1. Supabase project, mirrored schema, RLS, and the phase 3.1 social tables and policies alongside.
2. Client migration adding nullable `user_id` to every user table.
3. Auth: magic link, optional, skippable, with the settings account section.
4. Push over the change log.
5. Pull with the cursor.
6. Conflict resolution, as pure functions over two row sets so they test without a network.
7. Wipe, restore and import made sync safe.
8. Orchestration, triggers and sync state UI.
9. Security tests and policy tests.
10. Phase 3.1 client: handle claim, profile pages, follow and block, share toggle, offline cache.
