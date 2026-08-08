# Field, 3D and IFAA score sets — not yet shipped

These are intentionally absent from `seed.ts`.

Field, IFAA, IBO and ASA scoring differ from each other, and their point values and ring counts have
been revised between rulebook editions. Encoding them from memory would produce an app that scores
confidently and wrongly — the worst possible failure mode for a scorecard, because nothing looks
broken until a competition result is disputed.

## What is needed before adding them

For each governing body, from the **current published rulebook**:

1. Point values per ring, outermost to innermost.
2. Ring radii as a fraction of face diameter (the engine uses normalised coordinates, so physical
   face sizes do not need encoding — only proportions).
3. Whether an inner ring exists for tiebreaks, and how ties are actually broken.
4. Face sizes used per distance class, and the marked/unmarked distance rules.
5. For 3D: the vitals/kill/wound outlines. These are **not concentric circles** — they are offset,
   animal-specific shapes, which is why `ZoneShape` already carries a `path` variant.

## Engine work still required

- `containsPoint` currently throws for `{ kind: 'path' }` zones. Implementing it needs `Path2D`
  hit-testing (browser) or a point-in-polygon routine (to keep the domain layer pure and testable
  outside a browser — the preferable option).
- `RoundStage.distance` already supports `null` for unmarked courses; the scoring UI needs a way to
  record the distance the archer estimated versus the actual peg distance, which is itself useful
  training data for field archers.
