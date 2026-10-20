# Scorer versions

The arrow scorer is versioned so a result can always be compared with an older one. The archer picks a
version in Settings, the labelling page picks one for its scorecard and its player, and the harnesses
take `--scorer <id>`.

| Version | Kind | What it is |
| --- | --- | --- |
| Aphaia 1.0 | classical | The written detector as of October 2026, with gravity for which way is up. |
| Aphaia ML 1.0 | learned | The same scanner with arrows proposed by `scorers/aphaia-ml-1.0.json`. |

## The interface

A version is an entry in `src/lib/vision/scorers.ts`: an id, a name, the scanner options it runs with
(`settings`) and, for a learned one, a weights file in `src/lib/vision/scorers/`. Everything that runs
a scorer loads it into the same `LoadedScorer`, `{ id, model, settings }`, and hands that to the scanner:
the app through `scorer-load.ts`, the scripts through `scripts/lib/scorers.mjs`.

## Adding one

1. Put new behaviour behind a scanner option whose default is the old behaviour, so the shipped versions
   keep doing what they did. A change to the default is a change to every version at once.
2. Train new weights into `src/lib/vision/scorers/next.json` (the default output of `train-arrows.py`),
   then rename the file after the version.
3. Add the entry to `SCORERS` and measure it against the one it replaces:
   `node scripts/eval-arrows-video.mjs --slower 0 --scorer <id>`.
4. Change `DEFAULT_SCORER` only once it measures better.

A shipped version is never edited. Fixing one is a new version.
