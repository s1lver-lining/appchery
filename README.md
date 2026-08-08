# Appchery

Archery session tracking, scoring, and bow tuning — offline-first, on mobile and in the browser.

- **Score sessions** for target rounds, per arrow, with no network connection.
- **Document your bows**, with every settings change kept as an immutable revision.
- **Run tuning activities** whose outcomes link back to the exact bow setup they were performed on.
- **Live camera scoring** (planned) — sweep the camera over the target and confirm what it found.

Design and rationale live in [doc/architecture.md](doc/architecture.md) and
[doc/data-model.md](doc/data-model.md). Read those before making structural changes.

## Stack

SvelteKit (SPA, `adapter-static`) + Capacitor for iOS/Android, with SQLite as the local source of
truth — WASM/OPFS in the browser, native SQLite on device — accessed through Drizzle.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # domain/scoring unit tests
npm run build        # static build into ./build
```

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

### Native platforms

```bash
npx cap add ios      # requires Xcode
npx cap add android  # requires Android Studio
npm run cap:sync     # build the web app and copy it into the native projects
```

## Project layout

```
src/lib/domain/    pure scoring, round and unit logic — no I/O, fully unit-tested
src/lib/db/        schema, bundled migrations, platform drivers, repository
src/lib/i18n/      en (reference) + fr dictionaries
src/lib/ui/        shared components
src/routes/        pages
doc/               architecture and data model
```

The `domain/` layer imports nothing from the database or the UI. Scoring rules are the part that
must not be wrong, so they stay testable without a browser or a device.

## Contributing

Two things to know before opening a PR:

1. **Scoring data is rules data.** Round definitions and zone maps must be verified against the
   current published rulebook of the governing body concerned. Field, IFAA, IBO and ASA score sets
   are deliberately absent for this reason — see
   [src/lib/domain/rounds/field.todo.md](src/lib/domain/rounds/field.todo.md).
2. **English is the reference locale.** Add keys to `src/lib/i18n/en.ts` first; other locales are
   type-checked against it, so the build fails until each one is translated.

Contributions require signing a CLA — see below.

## Licence

[AGPL-3.0-only](LICENSE), plus a Contributor License Agreement.

AGPL keeps modifications open, including for anyone running this as a hosted service. The CLA keeps
the option of a future commercial offering open for the project owner. If you would rather not sign
a CLA, that is a legitimate position — please say so in your issue or PR and we can discuss.
