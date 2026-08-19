# Appchery — Architecture

> Status: phase 2 essentially complete. Sessions, activities, scoring, custom rounds, tuning
> templates that write bow revisions, versioned bow settings, plotting, statistics, field and 3D
> rounds, theming, and i18n are working. See doc/dev_guidelines.md for conventions.

## 1. What this is

An open-source archery companion app:

- **Session & score tracking** — record practice and competition rounds, per-arrow.
- **Bow setup documentation** — the current configuration of every bow you own, versioned over time.
- **Tuning activities** — guided procedures (bare shaft, paper, walk-back, crawl calibration) that
  produce recorded outcomes linked to the bow revision they were performed against.
- **Photo scoring (later phase)** — point the camera at a shot target face, get arrow positions.

Primary platform is mobile; the browser is a first-class secondary target.

## 2. Constraints that drive the design

| Constraint | Consequence |
|---|---|
| Scoring happens outdoors, often with no signal | **Local-first.** The device is the source of truth. Network is an enhancement, never a prerequisite. |
| Login/sync is explicitly *not* a priority | Ship with **zero auth**, but make the schema sync-ready from commit one so sync is additive, not a rewrite. |
| Target, field, 3D *and* custom rounds | Rounds must be **data, not code**. A generic round-definition engine drives scoring UI, stats and records. |
| Four bow types, multiple bows per archer | Bow settings are a **schema per bow type**, not fixed columns. |
| Open source, with commercial use kept open later | **AGPL-3.0 + a CLA** (see §10). Prefer self-hostable dependencies; Supabase chosen partly because it can be self-hosted. |
| Multilingual, English default | i18n from the first screen. English is the reference dictionary and every other locale is type-checked against it, so a missing key fails the build rather than shipping a blank label. |
| Conditions are useful but private | Location and weather capture is opt-in, off by default, and asks for permission at the moment the archer enables it. See section 6.1. |
| Developer knows web + Python | TypeScript/Svelte for the app, Python for the CV training pipeline. |

## 3. Stack

### Application — SvelteKit + Capacitor

One codebase, three targets: browser (static SPA), iOS, Android.

```
┌──────────────────────────────────────────────┐
│  SvelteKit app  (Svelte 5 runes, TypeScript) │
│  adapter-static → pure client-side SPA       │
└───────────────┬──────────────────────────────┘
                │
    ┌───────────┴────────────┐
    │                        │
┌───▼─────────┐    ┌─────────▼──────────────────┐
│  Browser    │    │  Capacitor native shell     │
│  OPFS/WASM  │    │  iOS (WKWebView)            │
│  SQLite     │    │  Android (WebView)          │
│             │    │  native SQLite, camera, FS  │
└─────────────┘    └─────────────────────────────┘
```

**Why not React Native / Expo:** it would mean React, and Svelte is the stated preference. RN's
native-widget advantage is small for an app that is forms, lists and one canvas — and RN's web story
is a compatibility layer, whereas Capacitor's *is* the web.

**Why not a plain PWA:** iOS PWAs still suffer storage eviction, weak install UX and no reliable
background work. Capacitor is a thin wrapper around the same code that removes those problems and
opens the app stores. The browser build remains a genuine PWA regardless.

**The cost, stated plainly:** the UI runs in a webview. For this app that is fine, with one
exception: live on-device inference (section 7) is not viable in WASM and will need a native plugin.

**One deployment requirement:** the browser build must be served with `Cross-Origin-Opener-Policy:
same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Without cross-origin isolation SQLite
cannot use OPFS, and the app degrades to an in-memory database that loses everything on reload. It
fails loudly rather than silently, but it is not a usable deployment.

### Chosen libraries

| Concern | Choice | Note |
|---|---|---|
| Framework | Svelte 5 + SvelteKit, `adapter-static` | No SSR — the app must boot offline |
| Native shell | Capacitor 6 | `@capacitor-community/sqlite`, Camera, Filesystem, Preferences |
| Database | SQLite | native on device, official `sqlite-wasm` in a Worker over OPFS in the browser |
| ORM & migrations | Drizzle ORM | TS-first, tiny, real migration files, works over both drivers |
| State | Svelte 5 runes + stores | No Redux-alikes needed; the DB is the state |
| Charts | LayerChart or hand-rolled SVG | Group plots are custom SVG anyway |
| Target face rendering | SVG (not canvas) | Faces are concentric circles — SVG is declarative, hit-testable, scales, and is trivially themeable |
| Validation | Zod / Valibot | Also generates the dynamic bow-setting forms |
| Tests | Vitest + Playwright | Scoring rules deserve heavy unit coverage |
| i18n | Typed dictionaries in `src/lib/i18n` | English is the reference, other locales are typed against it so a missing key fails the build |

### Backend (deferred)

**Supabase**, self-hostable. Postgres + Auth + Row-Level Security + Storage. Not built in phase 1.
The app must be fully usable, forever, with the backend switched off.

### CV pipeline (deferred)

Python: OpenCV + PyTorch, exported to ONNX, executed in-app via `onnxruntime-web`. Training
notebooks and the export script live in a separate `ml/` workspace, not shipped to the client.

## 4. Module structure

```
src/lib/
  db/            schema.ts, migrations/, client adapters (native | wasm)
  domain/
    rounds/      round definitions, zone maps, scoring engine, custom rounds  <- pure, no I/O
    tuning/      activity templates, outcome interpretation
    equipment/   bow-type setting schemas and revision diffing
    stats.ts     personal bests, averages, trends
  i18n/          reference dictionary and locales
  sync/          change log, push/pull, conflict resolution      <- see sync.md
  vision/        face fit, arrow proposals, viewpoint agreement   <- see camera-scoring.md
  ui/            components
routes/
  sessions/[id]/  activities/[id]/  equipment/[id]/  stats/  settings/
```

The `domain/` layer is **pure TypeScript with no database or UI imports**. Scoring rules, zone
geometry and tuning interpretation are all testable without a device. This is the part worth being
strict about — everything else is replaceable.

## 5. Core domain model

Detailed tables in [data-model.md](./data-model.md). The three ideas that matter:

### 5.0 A session holds activities

A **session** is one outing: a date, a place, the weather, and the bow being used. An **activity**
is one thing done inside it, either a scored round or a tuning procedure. A session holds many
activities, which is what makes a realistic afternoon expressible: sight in, shoot a 720, bare shaft
tune, shoot another 720.

The bow lives on the session rather than the activity, because an archer does not swap bows halfway
through an outing, and putting it on the session means every activity inherits it for free. It is
set either to a bow the archer has recorded, or to a generic bow type for someone who has not
entered their equipment yet. The generic option exists so a first-time user can score immediately
without filling in an equipment form.

Tuning is an activity, not a separate area of the app. This is why there is no tuning tab: tuning
procedures are launched from a bow in Equipment, or added to the session in progress.

### 5.1 A round is a data structure

```ts
type RoundDefinition = {
  id: string;                    // 'wa720-70m', 'wa-field-24-marked', custom uuid
  name: string;
  discipline: 'target' | 'field' | '3d' | 'clout' | 'custom';
  stages: RoundStage[];          // most rounds have one; WA1440 has four
  scoreSet: ScoreSetId;          // which zone map applies
  maxScore: number;              // derived, cached
};

type RoundStage = {
  distance: { value: number; unit: 'm' | 'yd' } | 'unmarked';
  faceSize: number;              // cm
  ends: number;
  arrowsPerEnd: number;
};

type ScoreSet = {
  id: ScoreSetId;
  zones: Zone[];                 // outermost → innermost
};

type Zone = {
  value: number;                 // points
  label: string;                 // '10', 'X', 'vital', 'M'
  radius: number;                // fraction of face radius, 0..1 — geometry for hit-testing
  isInner?: boolean;             // X-ring / inner-10 tiebreak
  countsAsHit: boolean;          // miss = false
};
```

Because zones carry **normalised radii**, the same definition drives the SVG face, the tap-to-plot
hit test, and the score-from-(x,y) function. One source of truth, no drift between what is drawn
and what is scored.

3D and field faces need one extension: non-concentric or non-circular zones (an animal's vitals are
offset from the face centre). `Zone.radius` therefore generalises to a `shape` union —
`{ kind: 'circle', r, cx?, cy? }` or `{ kind: 'path', d }` in normalised face coordinates.

Zones are shapes, not radii, because 3D vitals are offset ellipses rather than concentric rings and
field faces are not all the same layout. Hit testing covers circles, ellipses and polygons, with
ray casting written in the domain layer rather than using `Path2D`, so scoring stays testable
outside a browser.

> ⚠️ Field, IFAA, IBO and ASA point values differ and change between rulebook editions. Those score
> sets ship with `needsVerification: true`: the app shows a warning banner on any round that uses
> one, and the picker labels them Unverified rather than showing a maximum. See
> [scoring-verification.md](./scoring-verification.md) for the checklist that must be completed
> before a flag is removed. **Deferred:** the app focuses on target archery for now.

Camera scoring finds the face with classical computer vision, because a target face is a specified
object with published geometry and needs no training set. The arrows are proposed by shape and
confirmed by agreeing with themselves across the viewpoints of a sweep. A learned detector exists
beside the written one and is not the default: it is worse on the recordings measured so far, and
what limits it is the number of ends recorded rather than the method. See
[camera-scoring.md](./camera-scoring.md).

### 5.2 Bow configuration is versioned

A `Bow` has many `BowRevision` rows. Any settings change creates a new revision; revisions are
immutable. A `Session` references the revision it was shot under, as does every `TuningActivity`.

This makes the app's central question answerable: *"my groups got worse — what changed?"* becomes a
diff between two revisions plus the sessions on either side of it.

Settings are stored as JSON validated against a **per-bow-type schema**:

| Bow type | Representative fields |
|---|---|
| Recurve | brace height, tiller (upper/lower), nocking point, plunger tension/position, clicker position, limb alignment, draw weight on fingers |
| Compound | draw length, peak weight, let-off, ATA, cam timing/sync, peep height, D-loop length, rest position, sight housing/level |
| Barebow | brace height, crawl table (distance → crawl mark), tiller, plunger, weight system |
| Longbow | brace height, string material/strands, nocking point, arrow spine & length |

Shared across all: arrow spec (spine, length, point weight, fletching, nock), string, limbs/riser,
total mass. The schema drives both the edit form and the validation — adding a bow type means
adding a schema file, not touching UI code.

### 5.3 Tuning activities are procedures with outcomes

Not articles. A `TuningActivityTemplate` declares ordered steps, the inputs to capture, and an
interpretation table mapping observation → likely cause → suggested adjustment. Running one produces
a `TuningActivityRun` bound to a bow revision, with the observation, the adjustment made, and
(crucially) a link to the *next* revision if an adjustment followed.

That yields a tuning history: what you tried, what you observed, what you changed, and whether
scores moved afterwards. This is the feature that distinguishes the app from a scorecard.

### 5.2b The tuning loop closes

A tuning activity is not just notes. Once the archer records what they observed, the activity offers
the bow's own setting fields; changing the ones they actually adjusted and saving writes a **new bow
revision** and stores its id on the activity as `resultingRevisionId`.

That is the chain the app exists to capture: setup, test, observation, change, new setup, and the
scores that follow. Without the link the tuning notes and the equipment history are two unrelated
piles.

### 5.3 Bow settings are a schema per bow type

`src/lib/domain/equipment/schemas.ts` declares the fields for each bow type: cam timing and peep
height for a compound, crawl marks and a weight system for a barebow. The schema drives the form,
the validation, and the revision diff alike, so adding a bow type means adding a schema file rather
than touching any UI.

Length fields store millimetres and display inches. The conversion lives only at the display
boundary, so changing a preference can never touch stored data.

Saving does not update settings in place: it appends a **revision**, and the pending diff is shown
before saving alongside a free text reason. The history tab then reads as a sequence of changes with
their justifications, which is what makes "my groups got worse, what changed" answerable.

### 5.4 Custom rounds are ordinary rounds

The built-in list stays short on purpose. Anything else is entered directly as ends, arrows per end,
face diameter, and distance, which produces a normal `RoundDefinition` that the scoring engine,
statistics, and target rendering treat exactly like a built-in one.

Every activity stores a **full snapshot** of the round it was shot under, not just a reference, so
editing or removing a definition later cannot rewrite the history of a round already shot.

## 6. Data flow & offline model

- **The local SQLite database is the source of truth.** All reads and writes are local and
  synchronous-feeling. No loading spinners for your own data.
- Every mutable row carries `id` (UUIDv7), `created_at`, `updated_at`, `deleted_at` (soft delete)
  and `device_id`. This is the price of admission for later sync; it costs nothing now.
- A `change_log` table records mutations from phase 1 onward, even though nothing consumes it yet.
  Retro-fitting a change log over existing user data is far worse than writing to one unused.
- **Conflict policy: last-writer-wins per row, except sessions, which are append-only and never
  merged.** Two devices editing one session is a pathological case; a session belongs to the device
  that shot it.

### 6.1 Location and weather

Two separate opt-ins, both off by default. Location comes first, and weather only appears once
location is on, because weather is looked up **from** coordinates and cannot be recorded without
them. Turning location off turns weather off with it.

Enabling location requests permission immediately: a setting that appears enabled but silently fails
at the range is worse than one that was never offered. If permission is refused the setting stays
off and says why.

Capture happens on the session page after it opens, never before. An earlier version fetched
conditions before creating the session, which left the new session button sitting on a spinner
behind a permission prompt the archer could not see.

When enabled, opening a session captures coordinates once and looks up the weather for them.
Weather comes from Open-Meteo, which needs no API key and no account, so the app stays installable
and self-hostable. The snapshot is taken once and never refreshed: it records the conditions the
arrows were actually shot in, so a later refresh would be a falsification rather than an update.

A failed weather lookup keeps the recorded position, and a refused permission never blocks starting
a session. Being offline at a range is the normal case, not an error.

## 7. Live camera scoring (phase 4)

Deliberately last. It is roughly as much work as everything above it, and it depends on data the
app itself will generate.

### Why live video rather than a single photo

A single frame cannot reliably disambiguate arrows: shafts occlude the face and each other, a
robin-hooded pair looks like one hole, and glare or a shallow angle hides an entire quadrant. Video
turns this from a detection problem into an **accumulation** problem — the archer sweeps the camera,
detections are confirmed across frames, and gaps become visible and fixable in the moment.

### Pipeline

1. **Per-frame rectification** — locate the face, compute a homography, and maintain it as the
   camera moves. Classical OpenCV (ellipse fitting on the outer ring plus colour-band priors) is
   likely sufficient and needs no training data.
2. **Detection** — arrow tips/holes per frame. The genuinely hard step: worn faces, overlapping
   holes, protruding shafts, shadows, patched holes.
3. **Accumulation in face coordinates.** Detections register into the **target's** normalised
   coordinate frame, never screen coordinates. This is the design decision that makes the whole
   interaction work: moving closer to a missed corner *adds to the same arrow set* rather than
   restarting it, and an arrow confirmed in early frames stays confirmed once it leaves view. Each
   candidate carries a confidence that rises with corroborating observations.
4. **Live overlay** — recognised arrows are drawn over the camera feed as they are confirmed, with
   a running count against the expected arrows-per-end. The archer sees "5 of 6 found" and knows to
   move closer to the sparse area. Maximising first-frame recall stays the goal; the sweep is the
   fallback, not the intended path.
5. **Score assignment** — trivial once the above succeeds: reuse the *same* zone geometry the manual
   plotter uses.
6. **Human confirmation, always.** Output is a pre-filled end the archer verifies. It never silently
   writes a score. Corrections are the training signal.

### Architectural consequence

This is the one part of the app that will **not** be pure TypeScript. Per-frame inference through
ONNX/WASM in a webview is very unlikely to sustain an acceptable frame rate. Expect a native
Capacitor plugin owning the camera pipeline — Core ML on iOS, NNAPI/TFLite on Android — with the
webview rendering only the overlay and the confirmation UI. Budget for platform-specific work here;
everything before phase 4 avoids it entirely.

A degraded still-photo path should remain available as a fallback for the browser build, where no
native plugin exists.

### Training data strategy

The manual tap-to-plot mode already yields ground-truth arrow positions. Prompt users (opt-in,
explicit) to attach a face photo when plotting. That produces a labelled corpus as a by-product of
normal use — the only realistic path to enough data for an open-source project.

All inference runs on-device. No frame leaves the phone. For an open-source app holding a live
camera on people at a shooting line, this is worth treating as non-negotiable.

## 8. Phasing

| Phase | Content | Ends when |
|---|---|---|
| **1 — Foundation** (done) | DB and migrations, round engine, zone geometry, score sheet with editable arrows, sessions holding activities, custom rounds, tuning templates, bows, theming, i18n, opt-in conditions | You can shoot a round and see the score |
| **2 — Depth** (done, pending verification) | Tap-to-plot with a magnifying face and group metrics, versioned bow revisions with per-type setting schemas, tuning runs that write their resulting revision, personal bests and trends, bow photos, field and 3D rounds | The app is genuinely useful solo, offline, forever |
| **3 — Sync** | Supabase schema, auth, RLS, push/pull over the change log, multi-device | Optional login syncs cleanly and is skippable |
| **3.1 — Social** | Handles, public and private profiles, following, blocking, shared activities, published profile card | You can follow an archer and read what they chose to share |
| **4 — Vision** | Rectification, hole detection, opt-in photo capture, on-device inference | A photo produces a correct, confirmable end |

Phases 1 and 2 have no server dependency at all. That is the point.

Phase 3 has no publicly readable row anywhere: every policy is `user_id = auth.uid()`. Phase 3.1
opens the app's first public surface, so its tables and policies are designed and migrated with
phase 3 while no client screen reads them until later. See [sync.md](./sync.md) for both.

## 9. Decisions taken

- **Round definitions**: ship a curated built-in set. Community contribution is a later question.
- **Units**: store canonical metric, display whatever archers actually say — arrow length and brace
  height in inches, target distance in metres (or yards where the round is defined that way), mass
  in grains, draw weight in pounds. The conversion lives at the display boundary only, so a
  preference change can never touch stored data.
- **Languages**: English (default) and French, with the structure to add more.
- **Tuning content**: built-in templates only for now, launched per bow from Equipment. User
  contributed activities are deferred: they turn the app into a small CMS and deserve their own
  design pass.
- **Built-in rounds**: only WA 720 (70m) and WA Indoor 600 (18m) ship as presets. Everything else is a
  custom round, which keeps the preset list honest and avoids shipping unverified rules data.
- **Theme**: light, dark, and system, with light as the base palette. The palette is drawn from
  target faces and outdoor ranges rather than generic greys, and the regulated face colours stay
  identical in both themes because the rules define them.

## 10. Licensing

**AGPL-3.0-only, plus a Contributor License Agreement.**

- **AGPL** is the strongest copyleft available and closes the SaaS loophole: nobody can run a hosted
  service on this code without publishing their own modifications.
- **The CLA** assigns you rights over contributions, which is what preserves your ability to
  relicense the codebase commercially later. AGPL alone would not — once third-party contributions
  land under AGPL, you cannot unilaterally offer the whole under different terms.

The trade-off is real and worth stating: requiring a CLA deters some contributors, who reasonably
dislike granting one party rights they do not themselves hold. MIT would attract more contributors
but lets anyone commercialise the work, including in competition with you.

> Not legal advice. Have the CLA reviewed by a lawyer before monetising, and note that the licence
> choice must be made **before** accepting outside contributions — relicensing afterwards requires
> the agreement of every contributor.

## 11. Open questions

- Whether round definitions should eventually be community-contributed and fetched on demand.
- How user-contributed tuning activities would be reviewed, given they give advice about equipment.
