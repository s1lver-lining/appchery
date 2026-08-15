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
| **Match** | An activity shot head to head against somebody, scored end by end rather than as a round. |
| **Set** | One end of a match under the set system, worth two points to whoever wins it. |
| **Set point** | What winning or drawing a set is worth. A match is won on set points, not on score. |
| **Shoot-off** | The single arrow each side shoots to separate a level match. |
| **Our side / opponent** | The two sides of a match. Our side is the archer unless the card says otherwise. |

A session holds many activities. Never call an activity a session.

A match is an activity, so it lives in a session like a round does. A match is won or lost, never
scored: the number it carries is its set points, and it is deliberately kept out of personal bests
and round averages. Its arrows still count as arrows shot, unless the card is being kept for
somebody else.

## Layering

`src/lib/domain/` imports nothing from the database or the UI. Scoring rules must stay testable
without a browser or a device, because a wrong score is a silently corrupted record.

## Scoring data

Round definitions and zone maps are rules data. Verify every value against the governing body's
current published rulebook before adding it. Shipping a wrong zone map corrupts scores in a way
nobody notices until a result is disputed.


## Tricks

When a feature is implemented in a way that is not obvious, add a comment explaining the trick in /home/u/scripts/appchery/doc/tricks.md.

This is a good example of a trick, describing a feature that is not obvious to the user:
**Change what the two figures count.** Press and hold either figure in the header, or right click it,
and pick from several options.

This one is also good because it describes a non-obvious but necessary behaviour:
**Once earned, kept.** Deleting a session never takes a badge back. If you want the list to match
the history exactly, the recheck in the settings data tab is the button that does it, and it is the
only thing in the app that can take a badge away.

This is a bad exemple of a trick, it's an obvious feature about which the user don't need to be informed (and it's about the code, not the user):
**Chart colours are declared outside `@theme`.** Tailwind only emits the theme variables its
generated classes mention, and a chart paints its colours through an inline style, so the chart hues
live on `:root` as `--c-kind-*` and `--c-medal-*` rather than as theme tokens that would be dropped
from the build.

This one is a bad exemple as it's too obvious too:
**Locked ones show their progress.** A badge you have not earned still says what it wants and how
far along you are, because 840 arrows of a thousand is worth knowing.