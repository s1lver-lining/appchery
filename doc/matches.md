# Matches

A match is shot against somebody rather than against a round. That one difference decides everything
else here: a match has no maximum, its result is not a score, and two matches are not comparable the
way two 720s are. A 27 that beats a 26 is worth exactly as much as a 30 that beats a 20.

## What a match is made of

A match is an `activity` with `kind = 'match'`, so it lives in a session beside the rounds shot the
same day. It carries no round definition. Instead it carries a `match_config` JSON blob holding the
rules, read and written through `parseConfig` in `src/lib/domain/matches.ts`:

| Field | Meaning |
| --- | --- |
| `format` | individual, team, mixedTeam or custom. Names the preset, nothing more. |
| `system` | `set` (two points a set, first to `setPointsToWin`) or `cumulative` (highest total). |
| `arrowsPerEnd` | Arrows one side shoots in one end: 3 individually, 6 as a team, 4 mixed. |
| `maxEnds` | Ends shot before a level match goes to a shoot-off. |
| `setPointsToWin` | Ignored under the cumulative system. |
| `forSelf` | False while the card is kept for somebody else. |
| `shootOff` | Whether a level match may be taken to a shoot-off. Off makes a draw legal. |
| `scoreSetId` | The face plotted arrows are drawn on, since no round says which one. |
| `opponent`, `ourName`, `teammates` | Free text. Nobody is stored as a person anywhere. |

The World Archery presets are five sets of three to six points individually, and four ends to five
points for teams (six arrows) and mixed teams (four).

## How an end is stored

One `round_end` row per end of the match, holding **both** sides:

- `subtotal` is our total, `opponent_subtotal` is theirs.
- `is_shoot_off` marks the arrow that stands outside the regulation ends.
- `winner` is set only when a judge had to separate two equal shoot-off arrows.

Arrows are optional on either side. When they are plotted they hang off the same end row as `shot`
rows carrying `side = 'us' | 'them'`, and the end total is then read from them rather than typed.
This is why the fast path and the plotted path cannot disagree: the arrows win.

## What counts

- **Volume.** `arrowsShot` on the activity is `endsPlayed × arrowsPerEnd`, plus one arrow per archer
  for a shoot-off, which is three for a team and two for a mixed team,
  and **zero** when `forSelf` is false. The opponent's arrows never count for anybody: they are on
  the card to work out who won.
- **Score.** `totalScore` holds our set points under the set system and our arrow total under the
  cumulative one. Everything that reads a score as a round's score already filters
  `kind === 'scoring'`, so a match cannot set a personal best or move a round average.
- **The statistics page** adds match arrows to the volume chart and to the arrow count in the filter
  summary, and to nothing else. Round cards, records and per-arrow averages stay rounds only.
- **Badges.** Volume and habit badges count match arrows because they read every activity with
  arrows in it. Three badges are matches' own: a first win, ten wins, and a win from two sets down.
  None of them is awarded on a card kept for somebody else.

## Rules the engine holds

`tally()` reads the ends in order and stops at the moment one side has won, so an end entered after
that cannot change the result. Everything is recomputed from the stored ends on every read, which is
what makes an end editable after the match is over: correct end two and the rest of the match, the
winner, the arrows counted and the badges all follow.

A shoot-off is one arrow per archer, so a team shoots three and a mixed team two. The higher total
takes it; level totals go to whoever put one arrow closest to the centre.

An equal shoot-off is **not** decided by the app. Two tens are separated by a judge with a tape
measure, so the card asks who won and records the answer. When both sides' shoot-off arrows are
plotted the app reads the distance from the centre and answers the question itself.

## The bracket

A match carries the round of the ladder it was shot in, from `r64` to `final`, or `none` for a match
that belongs to no bracket. The session page draws the day's staged matches in that order, which is
what makes a competition read as one climb rather than as four unrelated outings. Nothing groups
matches across sessions: a bracket is a day.

## Bots

An opponent can be the app itself. A match config carries `bot`, one of four levels, and the card
names that side `Bot (Advanced)` rather than an opponent.

A bot is a **group, not a score**. `src/lib/domain/bots.ts` gives each level a spread and a drift:
the point of aim wanders once an end, every arrow scatters around it, and the arrows land on the face
as normalised coordinates. They are then scored by the same zone map the archer's own arrows are, so
a bot's total is something it shot. On a ten ring face that comes out at roughly five points an arrow
for a beginner, seven for an amateur, eight and a half for an advanced, and nine and a half for a
professional, with the beginner missing the boss now and then.

The bot answers as soon as our end is in, whether the end was plotted arrow by arrow or typed as a
total. Beating each level is its own badge.

## Not built yet

- **Head to head history.** Opponents are free text, offered back as suggestions from the cards
  already written, but never stored as people. The app cannot say you are 3-1 against somebody. That
  needs opponents to become rows, which is a real feature and a real cost.
- **A seeded bracket.** Stages are chosen by hand. Nothing links a match to the qualification that
  seeded it, or one round of the ladder to the next.
