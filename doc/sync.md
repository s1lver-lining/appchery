# Appchery — Sync and social

How syncing and the social side work, as built. Companion to [architecture.md](./architecture.md)
and [data-model.md](./data-model.md); deployment is [deploy.md](./deploy.md) and schema changes are
[migration.md](./migration.md).

The first rule of the app is unchanged: the local SQLite database is the source of truth, and
everything works forever with the server switched off. Sync is additive, and an archer who never
signs in cannot tell it exists.

## 1. What the app does, in one place

The rules an archer could observe, stated plainly. Everything after this section explains why.

**Without an account.** Everything works, forever. Nothing is uploaded, no network is required, and
the sync module is never even loaded. This is the app; the rest is additive.

**Signing in.** Optional, from the settings data tab, with an email and a password. Every row already
on the device is claimed by that account, so a history shot years before the account existed becomes
the account's history. Signing out changes nothing on the device.

**What travels.** The shooting record and the equipment behind it: sessions, activities, ends, shots,
bows, revisions, arrow sets, sight marks, plans and favourites. Nothing else.

**What never travels.** Badges, experience, personal bests, preferences, theme, celebration state,
and bow photos. The first five are recomputed on each device from the record itself. Photos are an
artefact of an older build that nothing can create any more, so the column is simply left where it
is.

**When it happens.** On signing in, when the app comes back to the front, when the network returns,
and on the button in the settings account card. Never on a timer, and never mid round.

**When there is no signal.** Everything carries on. Changes queue in the change log, the account card
says how many are waiting and when the last exchange was, and they go up at the next trigger. A
failed exchange is silent: at a range, offline is the normal case rather than an error.

**Two devices at once.** Each row is decided by whichever copy was edited last, ties broken by device
id so both devices reach the same answer. A session is never merged: the copy created first wins
whole. A delete beats an edit of exactly the same age, because a resurrected session is worse than a
lost correction to something being thrown away.

**Erasing.** Wiping the device asks you to sign out first, and deleting the account's server data is
a separate action that never touches the phone. Restoring a backup queues everything in it to be
sent, tombstones included.

**Handles.** Optional and asked for late: the friends screen asks the first time it is opened, so an
archer who only wants two devices in step never becomes findable. Reserved names cannot be taken and
a handle just left is held for thirty days before anybody else may have it.

**Following.** One directional. A public profile can be followed by anyone; a private one approves
each follower. You can see who follows you and remove any of them.

**Sharing.** A switch on one activity. Shared, it is visible to whoever your profile already allows;
unshared, it is gone from everywhere, because nothing was ever copied. What travels is the activity,
its ends and its shots. Never the session, so the place, the weather and the bow stay private. A
deleted activity stops being shared even if it was.

**Blocking.** The blocked account sees exactly what a private profile shows. It can still send follow
requests, which go nowhere and never reach your list, and it is never told.

**What a follower sees offline.** Whatever was cached at the last exchange. Following, sharing and
blocking need a connection and say so rather than queueing silently.

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

**Published, not synced.** The profile card: arrows, outings, badges and level, computed on the device
and overwritten on the server at the end of every exchange. See section 6.

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

## 4. Push and pull

### Push

Read `change_log` where `synced_at` is null, ordered by id. Chunk it, dedupe to the latest operation
per table and row, read those rows from SQLite, upsert one call per table, then stamp `synced_at` on
the log ids whose row actually reached the server and advance `last_push_cursor`. Only those: a row
carrying another account is not this archer's to send, and stamping it sent would throw the other
archer's change away the moment they sign back in on the same phone. The walk is by log id rather
than by what is still pending, so an entry that cannot be sent is stepped over for this run instead
of holding every entry behind it. A tombstone is an ordinary upsert of a row with
`deleted_at` set. A failed chunk leaves everything after it pending, so a retry resumes rather than
restarts, which is what makes a bulk import of thousands of rows survivable.

Ownership is stamped here rather than in the repository. `src/lib/db/repository.ts` knows nothing
about accounts and is better for it: the local database has one archer and is the source of truth,
so who owns a row is a fact about syncing. Push claims every ownerless row before it sends anything,
which is also what makes signing in adopt a history shot years earlier.

Adoption never touches `updated_at`. It changes who owns a row, not what it says, and bumping the
timestamp would let a device that has been offline for a month outrank a genuinely newer copy.

### Pull

The cursor is `server_updated_at`, a column the server maintains by trigger and no client can write.
The client's own `updated_at` cannot serve: it is a device clock, and one phone set a year ahead
would drag the cursor forward and hide every other device's rows until the real world caught up.
`updated_at` stays what it always was, the field last writer wins compares.

The cursor is kept **per table**, and each only ever moves to a row that table's walk actually read.
The tables are walked one after another, so a row another device writes into an already walked table
is older than anything the later walks bring back: one mark taken across all of them would step over
that row and never come back for it. Older installs stored a single stamp, and every table starts
from it. Rows arrive parent before child. Pulled rows do not re-enter `change_log`, or two devices would
push each other's rows to each other for ever, with one exception: when the local copy wins the merge
and genuinely differs from the server's, an entry is queued so the next push carries the winner up.
Without that a row pushed and then overwritten by a device with a slow clock would leave the two
sides disagreeing for good. `dataChanged()` fires after a pull that wrote anything, or the mounted
pages go on showing what they read on load.

Nothing in `src/lib/sync` opens a transaction, and that is deliberate. There is one connection, so a
write the archer makes while a transaction is open joins it, and a rollback in background work would
discard the arrow they entered a second ago. Applying a row is idempotent and the cursor only moves
at the end, so a pull that stops halfway is simply done again.

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

Restoring a backup drops the log and the cursors the file was carrying, because they describe a sync
that happened on another device, and re-enqueues every restored row as pending instead. Tombstones
are enqueued with the rest: a delete that reached the file has to reach the server too, or the next
pull brings the deleted session back.

The wipe guard lives in the settings screen rather than in the repository, and that is a data safety
measure, not a security one. It is the same device and the same archer either way; the point is that
an irreversible act asks a question first.

## 5. Orchestration

`syncNow()` pushes, pulls, then refreshes the social cache, guarded so only one exchange runs at a
time: a second caller waits for the first rather than uploading the same rows twice. It runs on sign
in, on app resume, on regaining connectivity, and on the manual button. Never on a timer, and never
mid round: the change log keeps what is owed, so an exchange can always wait for a natural pause.

There is no "after a session closes" trigger because there is no such moment in the app: a session is
never finished, it simply stops being added to.

An exchange belongs to the account that started it, and is abandoned if that changes underneath it.
Push claims every ownerless row for the account it was handed, so an exchange carrying on through a
sign out would file whatever is shot next under the archer who just left. Abandoning still leaves the
state readable, or the button would stay disabled for good.

Ordering is what makes a failure safe: rows are uploaded first and marked as sent afterwards. A run
that dies in between uploads them again, and an upsert of a row the server already has changes
nothing. The opposite order would mark work as sent that never left the device.

Failures are silent and retried: being offline at a range is the normal case, not an error. Sync is
absent from the boot path entirely, so a broken sync can never stop somebody scoring. `watchSync()`
returns without loading anything unless a server is configured and a session is already stored, so a
device that never signs in never fetches the client library at all.

The settings account section shows, signed out, that sync is optional and everything works without
it. Signed in it shows the account, when the last exchange was, how much is waiting, and sign out.
An exchange attempted with no connection says so rather than appearing to do nothing.

Signing out keeps this device's shooting untouched and takes the social cache with it: profiles and
shared activities belong to other people, and a shared phone must not show one archer the friends and
scores of the one before them. It takes the cursors too, because they describe the account that just
left: whoever signs in next starts from nothing rather than from somebody else's last exchange.

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

Badges and statistics stay local derived state, so the server cannot compute them. The device
computes a small card instead, in `src/lib/sync/card.ts`, and **publishes** it: arrows shot, outings,
badges and level, overwritten whole at the end of every exchange.

One way, always. Nothing reads its own card back, and somebody else's is read straight onto the
screen and never into the database. A figure that came back down would become something the app
reasons about, and a stale badge count is a bug there where on a profile page it is merely yesterday's
news. The profile page says as much: the figures are as that archer's last sync left them.

It is readable by whoever may already see what that archer shares, through the same `can_view` the
shared activities use, so a card can never show what a shared round would not.

### Offline

Followed profiles and the activities they shared are cached in `social_profile` and `social_activity`
so the friends screen opens at a range with no signal. Both are caches and never sources: nothing in
them is pushed, and a shared activity is held whole as JSON rather than in the archer's own tables,
because somebody else's arrows must never reach these averages, records or badges.

For the same reason pull filters every table to `user_id = auth.uid()`. The policies deliberately
make a followed archer's shared activities readable, and an unfiltered pull would quietly file them
among this archer's own rows.

Changing anything social, following, sharing, blocking, needs a connection and says so clearly
rather than queueing something that sits unsent for days. Sharing is the exception: it is a flag on a
row the archer already owns, so it is written locally and travels with the next exchange like any
other edit.

## 7. Bugs found and closed

Four holes, each proved against the deployment before being fixed, and each the same mistake: a rule
enforced in a function with the table left writable underneath it. Migration 0004 closes them.

- **Any archer could take `@admin`.** `claim_handle` checked the reserved and retired lists, but
  `grant update on profile` let a client write the column directly. The grant is now column scoped and
  a trigger enforces the lists whatever the grants say.
- **A deleted activity stayed shared.** The shared policies never looked at `deleted_at`, so an
  archer who deleted a shared round went on showing it. Deleting is the one action whose failure the
  person who took it cannot see.
- **A followee could rewrite `follower_id`**, turning one archer's pending request into an approved
  follow for an account that never asked. Approving may now set the status and nothing else.
- **The pull cursor was not a total order.** `now()` is the transaction clock, so every row of one
  upsert shared a `server_updated_at`, and a page boundary landing inside such a group stepped over
  the rest of it. `clock_timestamp()` ticks per row.

Six client bugs went with them:

- **Pull could lose a row.** The cursor was read after the pull rather than before it, so a row
  another device wrote while the pull was running was stepped over and never fetched again.
- **A local winner never reached the server.** When the local copy won the merge, pull skipped it and
  left nothing behind to push, so a row edited on a device with a slow clock could hold the server on
  an older version for good. Pull now queues the winner, but only when the two genuinely differ:
  queueing the rows a pull reads back from its own push would loop for ever.
- **The friends list kept the people who left.** The social refresh wrote the accounts it found and
  never reset the ones it stopped finding, so somebody who unfollowed, or who blocked this archer,
  stayed in the list as followed.
- **Adoption could not carry a large history.** Signing in wrote one log entry per adopted row in a
  single statement, which exceeds SQLite's parameter limit for anybody who had imported years of
  shooting: the sign in that was meant to claim everything would have failed outright.
- **Signing out left another archer's data on the device.** The shooting record staying is the point,
  but the cached profiles and shared activities belong to other people, and a shared device would
  have shown one archer the friends and scores of the one before them.
- **Erasing everything spared the social cache.** `deleteEverything` listed the tables by hand and
  the two cache tables were added after it.

A later pass over the social screens and the orchestration found six more:

- **The followers list could never be built.** The refresh read the `profile` table directly, but the
  only select policy was `profile_select_own`, so it came back empty: a follower whose handle had
  never been typed in was invisible, and pending requests with them. Reading is now granted along the
  edges of the graph, and a block removes the edge.
- **A public profile showed nothing it had shared.** The background refresh only fetches for accounts
  this archer follows, so browsing a public profile without following it showed an empty page. The
  profile page now asks for that archer's shared activities itself.
- **A handle lookup dropped somebody out of the followers list.** It cached the profile with
  `follows_us: none`, which it has no way of knowing, overwriting the real answer.
- **Background work could roll back the archer's own writes.** Pull and adoption ran inside
  transactions, and with one connection a write made while one is open joins it: a failed pull would
  have discarded an arrow entered a moment earlier. Nothing in sync opens a transaction now.
- **An exchange survived the account changing under it**, so a sign out mid sync could file the next
  archer's shooting under the last one's name.
- **Sharing a match published somebody else's name.** A match card carries the opponent and their
  arrows, and they never agreed to either. Matches are not offered for sharing.

A last pass over the whole phase found four more:

- **Removing imported sessions resurrected them.** The button hard deleted the rows, leaving the
  server holding what the device no longer had, so the next pull brought every one of them back. It
  tombstones them now, like any other deletion an archer makes.
- **A failed read emptied the friends screen.** The refresh replaces what it cached, and neither the
  graph query nor the shared activity query checked for an error: a request that timed out was read
  as "you follow nobody", and the cache was cleared to match. Both bail instead.
- **A first sign in registered no triggers.** The watcher looks for a stored session at boot, so an
  archer who signed in during that run got no resume and no reconnect exchange until they restarted
  the app. Signing in now registers them.

Driving the social screens in a browser found one more:

- **The friends screen only ever showed what the last exchange had cached.** A follow request sent
  while the page was shut appeared nowhere until a sync happened to run, which is a screen that looks
  wrong for no reason the archer can see. It now paints from the cache and refreshes behind that.

## 8. Where the security rests

Not a review at the end. Each of these is a task:

- RLS forced on every table, verified by a test that fails on any table without it.
- Policy tests per table: a second account must fail to read, update or delete the first account's
  rows, and the failure must look identical to the row not existing.
- Block tests: a blocked account's view of a public profile is byte identical to its view of a
  private one.
- Handle enumeration: search is rate limited and returns nothing that a directory scrape could walk.
- Storage has no bucket, because nothing is stored: the one binary the app ever held was a bow photo
  from an older build, which nothing can create any more.
- No service role key in the client, ever, on any platform.

## 9. Configuration and checks

### Where the server comes from

`PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` at build time, read through `import.meta.env`
rather than SvelteKit's `$env/static/public`, which fails the build when a variable is missing.
Missing is the normal case: a build with no server is the offline app, which is the app.

A self hoster overrides both per install through `sync_state.endpoint`, stored as `url|anonKey`.
Anything malformed there is ignored rather than obeyed, so a typo cannot take the built-in server
away from an archer who never touched the setting.

### What proves it still works

```bash
npm test              # merges, migrations, push and pull against a real SQLite
npm run db:check      # every policy, on a throwaway Postgres
npm run server:check  # the same policies through GoTrue and PostgREST, on a deployment
npm run browser:check # two browser devices, one archer, through the real screens
```

The last two need a project to talk to and belong on preprod. See [deploy.md](./deploy.md).

A pass over push and pull found two more:

- **A refused change was marked as sent.** Push stamped `synced_at` on every log entry below the
  chunk it had just uploaded, and one already given up on sits below it: the archer's retry button
  cleared the refusal and found nothing left to send.
- **The sync button did nothing when a sync was already running.** It was answered with the exchange
  in progress, which had read the queue before the press: the refused changes the button exists to
  retry stayed refused. A press now waits for the run in progress and then has its own.
- **Signing in as somebody else inherited the last archer's cursor**, so the second account's pull
  asked only for rows newer than the first account's last exchange and the rest of its history never
  came down. Signing out clears the cursors.
- **Erasing the device left the cursors behind.** Wiping cleared every row but not `sync_state`, so
  signing back in asked the server only for what had changed since the last exchange and the history
  it still held never came back down. The endpoint stays: where the server is is a setting.
- **The pull cursor was shared across tables.** One mark was taken across every table, so a row
  another device wrote into a table the pull had already walked was older than the mark by the time
  it was written, and no later pull ever asked for it. Each table carries its own cursor now.
