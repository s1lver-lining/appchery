# Deploying

Four things ship separately: the web app, the two Supabase databases, and the native builds. The web
app and the database are versioned together, so the order matters: **database first, app second.**

## Environments

| | Web | Database |
|---|---|---|
| preprod | Cloudflare Pages `appchery-preprod`, branch `preprod` | Supabase project, ref in `APPCHERY_SUPABASE_PREPROD` |
| prod | Cloudflare Pages `appchery`, branch `main` | Supabase project, ref in `APPCHERY_SUPABASE_PROD` |

Each web build bakes in its own database. `.env.preprod` and `.env.production`, both gitignored,
both copied from `.env.example`:

```
PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

The anon key is public by design and Row Level Security is what protects the data. A service role key
never belongs in these files, in the repository, or in the bundle.

Without an env file the app builds and works, with sync switched off. `deploy.sh` says so and
continues.

## Release

```bash
npm test && npm run check && npm run db:check   # all three must pass

npm run db:push:preprod                          # 1. database
npm run deploy:preprod                           # 2. app  → https://appchery-preprod.pages.dev

npm run db:push:prod                             # 3. database
npm run deploy:prod                              # 4. app, asks for confirmation
```

`deploy.sh` builds in the matching Vite mode, refuses to deploy if `build/_headers` lost the
cross-origin isolation headers, and warns on a dirty tree.

## Web, first time

```bash
npx wrangler login
npx wrangler pages project create appchery --production-branch main
npx wrangler pages project create appchery-preprod --production-branch preprod
```

Each project's production branch must match the branch `deploy.sh` sends it, or Cloudflare serves the
deployment as a preview on a fresh hostname. OPFS databases are per origin, so a moving hostname is
an empty database.

In CI, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; `CI=true` skips the production prompt.

**The build must be served with these headers**, which `static/_headers` carries:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without them there is no OPFS, the app runs on an in-memory database, and a reload loses everything.
It says so on screen rather than failing silently, but it is not a usable deployment.

## Database, first time

Create the project on supabase.com, then:

```bash
export APPCHERY_SUPABASE_PREPROD=<ref>
npm run db:push:preprod
```

Then, in the project dashboard:

- **Auth → Email**: turn confirmations on for prod.
- **Auth → SMTP**: point it at a real provider. The built-in sender allows a handful of messages an
  hour and is for testing only, so password resets fail without this.
- **Auth → URL configuration**: the site URL for that environment's Pages hostname.

Nothing else needs configuring: every RPC is a SQL function in a migration, so there are no Edge
Functions to deploy and no server code of ours to run.

### Moving off supabase.com later

The migrations in `supabase/migrations/` are plain SQL against plain Postgres, and the app reaches the
server through the URL and anon key alone. Self-hosting means running the `supabase/docker` stack,
applying the same migrations to it, and changing the two values in the env file. Individual installs
can also be pointed elsewhere without a rebuild, through the `sync_state.endpoint` override described
in [sync.md](./sync.md).

## Native

```bash
npm run cap:sync          # build the web app and copy it into ios/ and android/
npx cap open ios          # archive and upload from Xcode
npx cap open android      # build the bundle from Android Studio
```

Native builds use platform SQLite, so the isolation headers do not apply to them. They read the same
`.env.production` as the production web build.

## Rollback

```bash
npx wrangler pages deployment list --project-name appchery   # find the previous deployment
```

Promote it from the Cloudflare dashboard. The database does not roll back: migrations are additive
and older app versions keep working against a newer schema, which is the reason for that rule.
