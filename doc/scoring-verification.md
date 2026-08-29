# Scoring data that still needs verification

> **Status: partly done.** IFAA field is transcribed from the rulebook and its flag is off. WA field
> is corrected but still flagged, and the two 3D sets are untouched. The app focuses on target
> archery, where the WA score sets are straightforward and already correct.

A score set carrying `needsVerification: true` in `src/lib/domain/rounds/field.ts` was written from
general knowledge of the discipline, **not transcribed from a rulebook**, and the organisations
revise them between editions.

The app shows a warning banner on any round whose score set carries the flag, and the round picker
labels those rounds "Unverified" instead of showing a maximum score. Nothing is hidden from the
archer.

Removing the flag for a score set means checking every item below against the **current published
rulebook** and correcting the file. Do not remove a flag because the numbers look familiar.

## IFAA field (`ifaa-field-5`) — verified

Read from the **IFAA Book of Rules 2019-2020, Article V.A**, checked 12 August 2026.

- [x] Point values: five for the spot, four for the inner ring, three for the outer ring. No finer
      zone exists, so the inner spot the file used to carry for tie breaks was removed.
- [x] Ring proportions. The rulebook publishes diameters per face size: 4/12/20 cm, 7/21/35 cm,
      10/30/50 cm and 13/39/65 cm. All four reduce to the same fractions of the face, 0.2 and 0.6,
      which is what the file holds.
- [x] Colours: a black spot, a white inner ring and a black outer ring. The file had a white spot.
- [x] Round shape: a standard unit is fourteen targets and a round is two units, four arrows at each
      target, so 112 arrows and a maximum of 560. The file said three arrows.
- [x] The hunter face is the same layout in other colours, so one set serves both.
- [ ] The **animal round** scores by arrow number over two zones, which the engine does not model at
      all. No animal round is shipped, so nothing in the app is wrong; adding one needs engine work.

## WA field (`wa-field-6`) — corrected, still flagged

Checked against **World Archery Book 4, edition effective 27 January 2026**, and the World Archery
field archery discipline page, on 12 August 2026.

- [x] Point values, outermost to innermost: 1 to 6.
- [x] Colours: the two yellow rings score six and five, the four black rings four down to one. The
      file painted the 4 ring yellow and has been corrected.
- [ ] **Ring diameters.** Book 4 Appendix 1 publishes the face as an image, not as a table, and the
      2026 books carry no dimensions in their text at all. The file still assumes six equal width
      rings, which is an assumption, not a reading. This is the one item keeping the flag on.
- [ ] Whether the inner spot the file draws exists on the face, and what it is used for. Field ties
      are decided by closest to centre, which does not need an inner ring at all.
- [ ] Face sizes per peg distance (80, 60, 40 and 20 cm are known), and the marked and unmarked
      distance rules.

## IBO 3D (`ibo-3d`) and ASA 3D (`asa-3d`) — untouched

Point values are corroborated by secondary sources but nothing here has been read out of the IBO or
ASA rulebooks, so both stay flagged.

- [ ] Point values. IBO 11-10-8-5 and ASA 12-10-8-5 match what the file holds, per ASA's published
      scoring pages, but ASA also has a **second 12 ring** the shooter may call, and a **14 ring**
      used in professional shoot-offs. The file models neither.
- [ ] The position and size of each scoring ring relative to the animal. The current ellipses are
      **placeholders chosen to be plausible**, not measured from a real target. They are at least
      self consistent now: the 11 and the 12 used to be offset far enough to reach past the ten and
      into the eight, so an arrow scored eleven where the same file scored eight. Both are pulled
      back inside the ten, and `field.test.ts` pins the rule that an inner ring sits wholly in one
      band. The offset that remains is still a guess.
- [ ] Whether a hit outside the vitals but on the animal always scores 5, and what a non-scoring hit
      on a leg or horn does.
- [ ] Per-animal variation: real 3D targets differ by species, which the single silhouette in the
      file cannot capture. This is the item that makes 3D hard rather than tedious.

## Engine gaps that go with these

- Unmarked courses record no distance. The archer's estimated distance versus the real peg distance
  is useful training data for field archers and is not captured yet.
- Face size varies per peg on a real course. `RoundStage.faceSize` holds one reference size for the
  whole round, and a marked course stores a zero distance to mean "one per peg", which the UI reads
  as "say nothing" rather than printing 0m.
- 3D targets vary by animal, so a single polygon cannot represent a real course.

## When a set is verified

1. Correct the values in `field.ts`.
2. Delete `needsVerification` from that score set.
3. Tick the boxes here and note which rulebook edition was used, with its date.
4. Add a test in `field.test.ts` pinning the corrected point values, so a later edit cannot silently
   change them back.
