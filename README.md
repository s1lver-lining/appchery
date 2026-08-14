# Appchery

Archery session tracking, scoring, and bow tuning — offline-first, on mobile and in the browser.

- **Sessions hold activities.** One outing, many things done in it: score a round, then tune.
- **Score on a sheet** that reads like paper, with every arrow editable after the fact.
- **Custom rounds** by entering ends, arrows, face size, and distance.
- **Document your bows** and launch tuning procedures against them.
- **Live camera scoring** (planned): sweep the camera over the target and confirm what it found.

Design and rationale live in [doc/architecture.md](doc/architecture.md) and
[doc/data-model.md](doc/data-model.md). Read those before making structural changes.

## Stack

SvelteKit (SPA, `adapter-static`) + Capacitor for iOS/Android, with SQLite as the local source of
truth — WASM/OPFS in the browser, native SQLite on device — accessed through Drizzle.

## Getting started

```bash
npm install
./scripts/dev.sh     # dev server with hot reload, exposed on the LAN
./scripts/run.sh     # build and serve the production bundle
npm test             # domain and scoring unit tests
```

`dev.sh` and `run.sh` both bind to the LAN, so the same server opens on a phone. Set `PORT` to
change the port.

### Deploying the web build

The browser build **must be served with these two headers**:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without them the page is not cross-origin isolated, SQLite cannot use OPFS, and the app falls back
to an in-memory database that loses everything on reload. It degrades loudly rather than silently —
a banner appears and Settings shows the active storage mode — but it is not a usable deployment.
The dev and preview servers set these via a plugin in `vite.config.ts`; production is your host's
configuration (`_headers`, nginx, Cloudflare rule).

Native builds are unaffected: they use platform SQLite, not OPFS.

#### Cloudflare Pages

`static/_headers` carries those headers and `static/_redirects` routes unknown paths back to the
SPA shell; both are copied into `build/` and read by Pages from the deployment root. GitHub Pages is
not an option here — it serves fixed headers, so the app would run without OPFS.

```bash
npm run deploy:preprod   # → appchery-preprod
npm run deploy:prod      # → appchery, asks for confirmation
./scripts/deploy.sh preprod --dry-run
```

Two separate Pages projects rather than one project with preview branches: preview deployments get
a fresh hostname each time, and OPFS databases are per-origin, so preprod would start empty on
every deploy. Override the project names with `APPCHERY_PAGES_PREPROD` and `APPCHERY_PAGES_PROD`.

First run needs `npx wrangler login`; in CI, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
instead, and the production confirmation prompt is skipped when `CI=true`. Create the two projects
once with `npx wrangler pages project create <name> --production-branch main`, then attach custom
domains from the Pages dashboard.

### Installing on a phone

```bash
./scripts/adb_install.sh   # build, sync, assemble the debug APK, install over adb
```

It expects an SDK at `$ANDROID_HOME` (defaulting to `~/Android/Sdk`) with platform 36 and
build-tools 36, a device with USB debugging enabled, and a JDK Gradle supports. Set `JAVA_HOME` if
21 is not where the script looks.

iOS needs Xcode:

```bash
npx cap add ios
npm run cap:sync
npx cap open ios
```

### Installing as a web app

The build ships a manifest and a service worker that precaches the whole app, so it installs from
the browser and runs with no network. Installation needs HTTPS: a plain LAN address will run the
app but will not offer to install it.

## Project layout

```
src/lib/domain/    pure scoring, round, tuning and unit logic, no I/O, fully unit-tested
src/lib/db/        schema, bundled migrations, platform drivers, repository
src/lib/i18n/      en (reference) and fr dictionaries
src/lib/ui/        shared components
src/routes/        pages
doc/               architecture, data model, development guidelines
```

The `domain/` layer imports nothing from the database or the UI. Scoring rules are the part that
must not be wrong, so they stay testable without a browser or a device.

## Contributing

Three things to know before opening a PR:

1. **Scoring data is rules data.** Round definitions and zone maps must be verified against the
   current published rulebook of the governing body concerned. Field, IFAA, IBO and ASA score sets
   ship flagged as unverified and the app warns on them: see
   [doc/scoring-verification.md](doc/scoring-verification.md) for what must be checked before a flag
   is removed.
2. **Read [doc/dev_guidelines.md](doc/dev_guidelines.md)** for commit, comment, and prose rules.
3. **English is the reference locale.** Add keys to `src/lib/i18n/en.ts` first; other locales are
   type-checked against it, so the build fails until each one is translated.

Contributions require signing a CLA — see below.

## Licence

[AGPL-3.0-only](LICENSE), plus a Contributor License Agreement.

AGPL keeps modifications open, including for anyone running this as a hosted service. The CLA keeps
the option of a future commercial offering open for the project owner. If you would rather not sign
a CLA, that is a legitimate position — please say so in your issue or PR and we can discuss.
