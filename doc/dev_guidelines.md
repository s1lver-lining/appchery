# Development guidelines

## Commits

One commit per atomic change. Single line message, no body, no co-authors.

```
Add custom round builder to the activity creation page
```

Write what the change does, not what files it touches.

## Comments

One line. Two only when a single line genuinely cannot carry the meaning. No block comments, no
banner headers above every function.

Explain **why**, never **how**. The code already says how, and a comment restating it goes stale the
moment the code changes.

```ts
// Wrong: iterate the zones from the end
for (let i = zones.length - 1; i >= 0; i--) {

// Right: innermost zone wins so overlapping rings resolve to the higher score
for (let i = zones.length - 1; i >= 0; i--) {
```

If a piece of code needs several paragraphs to justify, it belongs in `doc/`, and the comment
points there.

## Prose

No hyphens or dashes as punctuation. Use commas, colons, or a new sentence.

```
Wrong: The database is local first, so the app works offline - no network needed.
Right:  The database is local first, so the app works offline: no network needed.
```

Hyphens inside real compound words stay: `local-first`, `built-in`, `opt-in`.

Applies to comments, commit messages, documentation, and user facing strings.

## Domain vocabulary

Use these words consistently in code, UI, and documentation.

| Term | Meaning |
| --- | --- |
| **Session** | One outing. Carries date, location, weather, and the bow being used. |
| **Activity** | One thing done inside a session: a scored round, or a tuning procedure. |
| **End** | One group of arrows shot before scoring, inside a scoring activity. |
| **Shot** | One arrow. |
| **Round** | The definition of what to shoot: distances, faces, ends, arrows. |
| **Bow revision** | An immutable snapshot of a bow's settings at a point in time. |

A session holds many activities. Never call an activity a session.

## Layering

`src/lib/domain/` imports nothing from the database or the UI. Scoring rules must stay testable
without a browser or a device, because a wrong score is a silently corrupted record.

## Scoring data

Round definitions and zone maps are rules data. Verify every value against the governing body's
current published rulebook before adding it. Shipping a wrong zone map corrupts scores in a way
nobody notices until a result is disputed.
