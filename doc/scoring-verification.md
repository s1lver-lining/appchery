# Scoring data that still needs verification

Every score set in `src/lib/domain/rounds/field.ts` carries `needsVerification: true`. Those values
were written from general knowledge of the disciplines, **not transcribed from a rulebook**, and the
organisations revise them between editions.

The app shows a warning banner on any round whose score set carries the flag, and the round picker
labels them "Unverified" instead of showing a maximum score. Nothing is hidden from the archer.

Removing the flag for a score set means checking every item below against the **current published
rulebook** and correcting the file. Do not remove a flag because the numbers look familiar.

## WA field (`wa-field-6`)

- [ ] Point values per ring, outermost to innermost. The file currently assumes 1 to 6.
- [ ] Ring radii as a fraction of face diameter. The file currently assumes six equal-width rings.
- [ ] Whether the inner spot scores the same as the ring around it, and how ties are broken.
- [ ] Face sizes per peg distance, and the marked and unmarked distance rules.

## IFAA field (`ifaa-field-5`)

- [ ] Point values. The file currently assumes 5-4-3 with an inner spot for ties.
- [ ] Ring proportions, which differ between the field, hunter and animal faces. The file uses one
      layout for all three, which is almost certainly wrong for at least one of them.
- [ ] Whether animal rounds score by arrow number rather than by ring, which the engine does not
      model at all today.

## IBO 3D (`ibo-3d`) and ASA 3D (`asa-3d`)

- [ ] Point values. The file assumes 11-10-8-5 for IBO and 12-10-8-5 for ASA.
- [ ] The position and size of each scoring ring relative to the animal. The current ellipses are
      **placeholders chosen to be plausible**, not measured from a real target.
- [ ] Whether a hit outside the vitals but on the animal always scores 5, and what a non-scoring
      hit on a leg or horn does.
- [ ] Per-animal variation: real 3D targets differ by species, which the current single silhouette
      does not capture.

## Engine gaps that go with these

- Unmarked courses record no distance. The archer's estimated distance versus the real peg distance
  is useful training data for field archers and is not captured yet.
- Face size varies per peg on a real course. `RoundStage.faceSize` holds one reference size for the
  whole round.
- 3D targets vary by animal, so a single polygon cannot represent a real course.

## When a set is verified

1. Correct the values in `field.ts`.
2. Delete `needsVerification` from that score set.
3. Tick the boxes here and note which rulebook edition was used, with its date.
4. Add a test in `field.test.ts` pinning the corrected point values, so a later edit cannot silently
   change them back.
