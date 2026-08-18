# Appchery — Data Model

Companion to [architecture.md](./architecture.md). SQLite (local, source of truth), mirrored later
to Postgres for sync.

## Conventions

Every user-owned table carries:

| Column | Type | Purpose |
|---|---|---|
| `id` | TEXT (UUIDv7) | Time-sortable, collision-free across devices — no autoincrement anywhere |
| `created_at` | INTEGER (epoch ms) | |
| `updated_at` | INTEGER (epoch ms) | Sync ordering, LWW resolution |
| `deleted_at` | INTEGER, nullable | Soft delete — a hard delete cannot be synced |
| `device_id` | TEXT | Origin device, for debugging and conflict attribution |

`user_id` is deliberately **absent in phase 1** and added by the phase-3 migration. Locally there is
exactly one archer; inventing accounts before they exist is speculative complexity.

---

## Equipment

### `bow`

| Column | Type | Notes |
|---|---|---|
| `name` | TEXT | "Blue riser", "Hoyt indoor" |
| `type` | TEXT | `recurve` \| `compound` \| `barebow` \| `longbow` |
| `is_active` | INTEGER | Retired bows stay for history |
| `notes` | TEXT | |

### `bow_revision`

Immutable. A settings change appends a row; it never updates one.

| Column | Type | Notes |
|---|---|---|
| `bow_id` | TEXT FK | |
| `revision_no` | INTEGER | Monotonic per bow |
| `settings` | TEXT (JSON) | Validated against the schema for `bow.type` |
| `arrow_set_id` | TEXT FK, nullable | Arrows in use at this revision |
| `reason` | TEXT | Why the change was made — free text, surprisingly valuable later |
| `effective_from` | INTEGER | Usually = `created_at`, editable for backfilled history |

> Rationale: sessions and tuning runs both point at a revision, so any score can be traced to the
> exact configuration that produced it. Mutating settings in place would destroy that link
> retroactively and silently.

### `arrow_set`

| Column | Type | Notes |
|---|---|---|
| `label` | TEXT | |
| `spine` | INTEGER | |
| `length_mm` | INTEGER | Canonical metric; display converts |
| `point_grain` | INTEGER | |
| `fletching` | TEXT (JSON) | type, length, offset/helical |
| `nock` | TEXT | |
| `total_grain` | REAL, nullable | Measured, not derived |
| `count` | INTEGER | |

Individual arrow numbering is a phase-2 nicety (`arrow` table, FK to `arrow_set`) that unlocks
per-arrow grouping analysis — "arrow 3 always drifts left" is a real and common finding.

---

## Rounds & scoring

### Round definitions

Round definitions are **code, not rows**: built-in rounds live in `src/lib/domain/rounds/seed.ts` and
custom ones are built at creation time. Each activity stores its own JSON snapshot, so there is no
definitions table to keep in sync and no way for an edit to rewrite history.

### `score_set` / zone geometry

| Column | Type | Notes |
|---|---|---|
| `name` | TEXT | "WA 10-ring", "WA field 6-zone", "IBO 3D" |
| `zones` | TEXT (JSON) | `Zone[]`, outermost → innermost |

`Zone` shape (normalised face coordinates, face radius = 1.0):

```jsonc
{
  "value": 10,
  "label": "10",
  "shape": { "kind": "circle", "r": 0.1 },   // or { "kind": "path", "d": "M..." } for 3D vitals
  "isInner": false,
  "countsAsHit": true
}
```

One geometry definition serves three consumers: the SVG renderer, the tap hit-test, and
score-from-coordinates. They cannot disagree, because there is nothing to disagree with.

> ⚠️ Zone values for field, IFAA and 3D organisations differ and are revised between rulebook
> editions. Seed data must be checked against the current published rulebook before release.

### `session`

One outing. Holds the bow, the place, and the conditions. Activities hang off it.

| Column | Type | Notes |
|---|---|---|
| `label` | TEXT, nullable | |
| `started_at` / `ended_at` | INTEGER | |
| `kind` | TEXT | `practice` \| `competition` \| `qualification` |
| `bow_id` | TEXT FK, nullable | Set when shooting a recorded bow |
| `bow_type` | TEXT, nullable | Set instead of `bow_id` for a generic bow type |
| `bow_revision_id` | TEXT FK, nullable | The configuration actually shot |
| `location` | TEXT, nullable | |
| `latitude` / `longitude` | REAL, nullable | Captured only when the archer opts in |
| `conditions` | TEXT (JSON), nullable | Weather snapshot, taken once and never refreshed |
| `notes` | TEXT | |

> Rationale: the bow sits on the session because an archer does not swap bows mid-outing, so every
> activity inherits it. The weather snapshot is never refreshed because it records the conditions the
> arrows were shot in: a later refresh would falsify the record rather than update it.

### `activity`

One thing done inside a session: a scored round, or a tuning procedure.

| Column | Type | Notes |
|---|---|---|
| `session_id` | TEXT FK | |
| `kind` | TEXT | `scoring` \| `tuning` |
| `round_definition_id` | TEXT, nullable | Set for built-in rounds, null for custom ones |
| `round_definition` | TEXT (JSON) | **Full snapshot** of the round as shot |
| `template_key` | TEXT, nullable | Set for tuning activities |
| `observations` / `conclusion` / `adjustment_made` | TEXT, nullable | Tuning outcome |
| `resulting_revision_id` | TEXT FK, nullable | The revision this tuning run produced |
| `total_score` | INTEGER | Denormalised, recomputed on any end change |
| `count_10s` / `count_x` | INTEGER | Tiebreak columns |
| `arrows_shot` | INTEGER | |
| `status` | TEXT | `in_progress` \| `complete` \| `abandoned` |

> Rationale: the round is stored as a **snapshot**, not a reference. Editing or deleting a definition
> later must not rewrite the history of a round already shot under the old one. This is also what
> lets custom rounds be first-class without a separate table.

Kinds in use today are `scoring`, `match`, `tuning` and `training`. Strength work and running are
coming as `strength` and `running`, and neither shoots an arrow. Every figure that counts arrows
reads them through `shootsArrows` in `src/lib/domain/stats.ts`: `toVolume`, the badge history and
the experience arrow rate all filter on it, and a kind it has never heard of counts as shooting
nothing. Adding a kind that does shoot has to be added to that list; adding one that does not needs
no change anywhere.

### Exercises

Exercise definitions are **code, not rows**, the same as round definitions:
`src/lib/domain/exercises/seed.ts` holds what each one works, the parameters a routine starts from,
and the poses its movement diagram is drawn through. A routine will store what the archer actually
did, so an exercise corrected in a later version fixes the instructions without rewriting the sets
already done.

### `round_end`

Named `round_end` in SQL because `end` is a reserved keyword.

| Column | Type | Notes |
|---|---|---|
| `activity_id` | TEXT FK | |
| `stage_index` | INTEGER | Which `RoundStage` |
| `end_no` | INTEGER | Within the stage |
| `subtotal` | INTEGER | |

### `shot`

| Column | Type | Notes |
|---|---|---|
| `end_id` | TEXT FK | |
| `ordinal` | INTEGER | Order within the end |
| `value` | INTEGER | Points scored |
| `zone_label` | TEXT | `10`, `X`, `M`, `vital` — the semantic result |
| `x` / `y` | REAL, nullable | Normalised face coords, centre = (0,0), radius = 1.0. **Null when score-only.** |
| `source` | TEXT | `manual` \| `plotted` \| `vision` — provenance matters for trusting stats |
| `arrow_id` | TEXT FK, nullable | For per-arrow analysis |

The default entry mode is numeric; `x`/`y` are populated only when plotted or vision-derived. When
present, `value` is **derived** from position via the zone geometry rather than entered — one input,
not two that can contradict.

---

## Tuning

### `tuning_template`

Seeded, versioned with the app. Not user data in phase 2.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | `bare-shaft`, `paper`, `walk-back`, `crawl-calibration`, `cam-timing`, `nock-height` |
| `applies_to` | TEXT (JSON) | Bow types this is valid for |
| `steps` | TEXT (JSON) | Ordered instructions, each with optional input capture |
| `interpretation` | TEXT (JSON) | observation → likely cause → suggested adjustment |

### `tuning_run`

| Column | Type | Notes |
|---|---|---|
| `template_key` | TEXT | |
| `bow_revision_id` | TEXT FK | Configuration under test |
| `observations` | TEXT (JSON) | Captured inputs — tear direction, bare-shaft offset, crawl marks |
| `conclusion` | TEXT | Which interpretation branch matched |
| `adjustment_made` | TEXT | |
| `resulting_revision_id` | TEXT FK, nullable | The revision this run caused — closes the loop |
| `photos` | TEXT (JSON), nullable | Local file references (paper tears, group photos) |

`resulting_revision_id` is what turns a pile of notes into a causal chain: setup → test →
observation → change → new setup → subsequent scores.

---

## Badges

### `badge`

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | Names a rule in the catalogue, see `src/lib/domain/badges.ts` |
| `earned_at` | INTEGER | When the shooting that won it happened, not when the row was written |

The one place a derived figure is stored on purpose. A personal best is a query because editing an
arrow must move it; a badge is a row because editing an arrow must **not** take it away. The rules
are still evaluated on every visit, but only to award what is missing and to measure progress
towards what is not held yet.

The recheck in the settings data tab is the only thing that deletes a badge, for the case the
storage creates: shooting that has since been deleted. A badge that survives a recheck keeps its
original `earned_at`. See doc/badges.md for the catalogue and the rules data behind it.

---

## Sync scaffolding (written from phase 1, consumed in phase 3)

### `change_log`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | Local ordering only, never synced |
| `table_name` / `row_id` | TEXT | |
| `op` | TEXT | `insert` \| `update` \| `delete` |
| `changed_at` | INTEGER | |
| `synced_at` | INTEGER, nullable | Null = pending |

### `sync_state`

Single row: last successful pull cursor, last push cursor, `device_id`, endpoint URL.

Writing this log from day one costs a trigger and some disk. Adding it later means reconciling
history that was never recorded — which is to say, not doing it.

---

## Derived / query notes

- **Personal bests** are a query over `activity`, not a stored table, filtered by
  `round_definition_id` and the parent session's `kind`, so there is no denormalised state to invalidate.
- **Group metrics** (mean radius, group centre offset, horizontal/vertical spread) computed from
  `shot.x/y` where non-null. Group centre offset is the number that matters for sight and tuning
  decisions; raw spread is the one that measures the archer.
- **Round progress charts** join activities on `round_definition_id` over time, optionally split by
  the session's `bow_revision_id` to visualise the effect of an equipment change.
- Index at minimum: `round_end(activity_id)`, `shot(end_id)`, `activity(session_id, started_at)`,
  `bow_revision(bow_id, revision_no)`, `change_log(synced_at)`.
