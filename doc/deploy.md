# Deploying

Pick the job you are doing.

| I want to… | Go to |
|---|---|
| Ship a code change, no schema change | [1. Ship the app](#1-ship-the-app) |
| Ship a change that adds or alters a column | [2. Ship a model change](#2-ship-a-model-change) |
| Check everything before shipping | [3. The four checks](#3-the-four-checks) |
| Set up a new environment from scratch | [4. New environment](#4-new-environment) |
| Ship the phone apps | [5. Native](#5-native) |
| Undo a bad deploy | [6. Rollback](#6-rollback) |

Two environments, each with its own Supabase project and its own Pages project:

| | Web | Database | Env file |
|---|---|---|---|
| preprod | `appchery-preprod`, branch `preprod` | ref in `APPCHERY_SUPABASE_PREPROD` | `.env.preprod` |
| prod | `appchery`, branch `main` | ref in `APPCHERY_SUPABASE_PROD` | `.env.production` |

Both env files are gitignored and hold two public values, copied from `.env.example`:

```
PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon or publishable key>
```

The anon key is meant to ship and Row Level Security is what protects the data. A service role key
never belongs in these files, in the repository, or in a bundle. Without an env file the app builds
and works with sync switched off, and `deploy.sh` says so and carries on.

The project refs are not stored anywhere, so export them in the shell you deploy from, or
`db:push:*` fails with `Missing value for flag --project-ref`:

```bash
export APPCHERY_SUPABASE_PREPROD=<preprod ref>
export APPCHERY_SUPABASE_PROD=<prod ref>
```

## 1. Ship the app

No schema change: the database is untouched and only the bundle moves.

```bash
npm test && npm run check      # unit tests and types
npm run deploy:preprod         # → https://appchery-preprod.pages.dev
npm run deploy:prod            # asks for confirmation
```

## 2. Ship a model change

A column added on the device is a column added on the server, in the same commit. **The database
goes first and the app second**, in both environments: a client that pushes a column the server has
never heard of gets an error, while a server holding a column no client sends yet is harmless.

```bash
# 1. Write both migrations. Never edit one that has been pushed.
npx supabase migration new add_whatever      # server: supabase/migrations/
$EDITOR src/lib/db/migrations.ts             # client: append a group, mirror it in schema.ts

# 2. Prove them
npm run db:check                             # policies still hold, RLS still forced
npm test                                     # client migrations still apply

# 3. Preprod: database, then app
npm run db:push:preprod
npm run server:check                         # the deployed policies, through a real auth flow
npm run deploy:preprod

# 4. Production: database, then app
npm run db:push:prod
npm run deploy:prod
```

The rules that keep this safe are in [migration.md](./migration.md). The two that bite hardest:
never edit a migration that has been pushed anywhere, and every new server table needs forced RLS
and a policy or `db:check` fails.

## 3. The four checks

Each covers what the one before it cannot.

```bash
npm test              # domain logic, merges, migrations, against a real SQLite
npm run check         # types, and every locale against the reference dictionary
npm run db:check      # server migrations and every policy, on a throwaway Postgres in Docker
npm run server:check  # the same policies through GoTrue and PostgREST on a real deployment
```

And, when sync itself changed, the app driven as an archer drives it:

```bash
npm run build:preprod && npx vite preview --port 4174 &
npm run browser:check -- http://127.0.0.1:4174
```

Two browser contexts are two devices with two databases and two signed in sessions. It proves an
outing recorded on one reaches the other, that an edit travels back, and that the app keeps working
with the network off. It needs the **built** app rather than the dev server, because offline support
is the service worker's job and a dev server has none.

`server:check` and `browser:check` write real rows under fixed test accounts and clear them again,
so they belong on preprod. `server:check` refuses production outright.

## 4. New environment

### The database

Create the project on supabase.com, then:

```bash
npx supabase login
npx supabase link --project-ref "$APPCHERY_SUPABASE_PREPROD"
npm run db:push:preprod
npm run server:check
```

Three settings the migrations cannot carry, in the project dashboard:

- **Auth → Providers → Email**: confirmations off for preprod so sign up returns a session at once,
  on for production. The account card handles both.
- **Auth → SMTP**: a real provider for production. The built in sender allows a handful of messages
  an hour, so password resets fail without it.
- **Auth → URL Configuration**: that environment's Pages hostname.

Nothing else: every RPC is a SQL function in a migration, so there are no Edge Functions to deploy
and no server code of ours to run.

### The web project

```bash
npx wrangler login
npx wrangler pages project create appchery --production-branch main
npx wrangler pages project create appchery-preprod --production-branch preprod
```

Each project's production branch must match the branch `deploy.sh` sends it, or Cloudflare serves a
preview on a fresh hostname. OPFS databases are per origin, so a moving hostname is an empty
database. In CI, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; `CI=true` skips the
production prompt.

**The build must be served with these headers**, which `static/_headers` carries:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without them there is no OPFS, the app runs on an in-memory database, and a reload loses everything.
It says so on screen rather than failing silently, but it is not a usable deployment. `deploy.sh`
refuses to deploy a build whose `_headers` lost them.

### Moving off supabase.com later

The migrations are plain SQL against plain Postgres and the app reaches the server through a URL and
an anon key. Self-hosting is the `supabase/docker` stack, the same migrations applied to it, and two
changed values in the env file. Individual installs can also be pointed elsewhere without a rebuild,
through the `sync_state.endpoint` override in [sync.md](./sync.md).

## 5. Native

```bash
npm run cap:sync          # build the web app and copy it into ios/ and android/
npx cap open ios          # archive and upload from Xcode
npx cap open android      # build the bundle from Android Studio
```

Native builds use platform SQLite, so the isolation headers do not apply to them. They read the same
`.env.production` as the production web build.

## 6. Rollback

```bash
npx wrangler pages deployment list --project-name appchery
```

Promote the previous deployment from the Cloudflare dashboard. **The database does not roll back.**
Migrations are additive and older app versions keep working against a newer schema, which is exactly
why that rule exists.
