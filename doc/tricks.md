# Tricks

Things the app does that nothing on screen announces. Everything here is reachable by hand: this is
a list of shortcuts, not of hidden settings.

## Home

**Change what the two figures count.** Press and hold either figure in the header, or right click it,
and pick from monthly arrows, weekly arrows, yearly arrows, the all time total, the week's goal, or
nothing at all. Choosing nothing leaves the slot empty and removes the rule between the two; the slot
stays pressable, so the figure can be brought back.

**Ring the target.** Tap the rings in the top right corner of the home header to play the ripple
again.

**Dismiss a record.** The new personal best card carries a small cross. Dismissing it is saying "I
know": the card comes back for the next record, on a different round.

## Sessions

**Measure the week against your plans.** The dots menu on the sessions list turns the weekly goal on.
Each week's pill then reads `72/230 arrows`, counting the slot goals and the free arrows of every
plan. A week that reaches its goal turns brand coloured.

**The list opens where you are.** The list runs oldest to newest and opens on the current week: the
whole week if it fits the screen, otherwise on today, held in the middle of the view.

**The search reads the whole outing.** The box above the list matches a session's name, its place,
its notes and the name of every round and procedure shot in it. Every word typed has to be found
somewhere, in any order, and accents are ignored. It applies to the list only, since a month grid has
nothing to narrow.

**A plan can be put aside.** The toggle at the top of a plan stops it filling the sessions list and
stops its arrows counting towards the weekly goal, without deleting anything it already produced.

**The new session button has two shapes.** The display section of the settings turns the round plus
button in the corner into the full width bar. Both open the same three choices: practice,
competition, planned.

**A planned slot costs nothing.** Opening a session a plan calls for writes nothing to the database.
It becomes a real session the moment an arrow, a note or a setting is entered in it, so a week nobody
shot leaves no trace to clean up.

**Move a session by days.** The session settings tab has `-7 -1 +1 +7` buttons, which is faster than
the date field for the common case of entering an outing a few days late.

**Back closes the editor.** While renaming a session, the hardware back key closes the name editor
rather than leaving the session.

## Shooting time

**The clock runs the line, not the round.** The timer sits behind the clock icon in any activity
header and in the sessions menu. It holds the World Archery times: four minutes for six arrows, two
for three, two for a team's six, eighty seconds for a mixed team, twenty for alternating shooting.

**Two blasts, one blast, three blasts.** Calling the line sounds two whistles, then one, then starts
the clock; zero sounds three. The sounds are synthesised on the device rather than recorded, so
nothing is shipped that belongs to somebody else, and they can be turned off.

**The times are yours to change.** The rules' times are what the clock starts from, and the edit
sheet puts any of them on a different number of seconds. Emptying a field puts the rule back.

**The clock is read, never ticked.** Time left is worked out from the moment it started, so a phone
that slept through half an end wakes up with the right number, and the screen is held awake while it
runs.

## Matches

**A match is won, not scored.** The number on a match card is its set points, and it deliberately
never reaches your personal bests or your round averages. Its arrows still count as arrows shot.

**Totals first, arrows when there is time.** An end needs only the two totals, because a match is
shot on the clock. Tap a slot instead and the keypad rises from under the sheet, filling our side
then theirs; typing a total afterwards clears that side's arrows, since one number cannot have two
sources. The keypad and the face are the same switch the scoring page uses.

**Keep the card for somebody else.** The toggle in the match settings says these arrows are not
yours: nothing on the card then reaches your volume or your badges.

**Correct an end after the match is over.** Every figure is recomputed from the ends every time, so
fixing end two moves the winner, the arrows counted and the badges with it.

**Shoot against the app.** A match can be set against a bot at one of four levels. It shoots real
arrows onto the face rather than picking a number, so its group looks like a group, and it answers
the moment your end is in. Each level has a badge for beating it.

**A bracket is a day, not a list.** Give each match its round and the session page draws the ladder
in the order it was climbed, from the eighths to the final.

**Opponents remember their spelling.** Typing a name offers everybody named on a card before, so the
same archer is one name in the history rather than three spellings of it.

**A match shares as a picture too.** The share button builds the same card a round does: the
scoreline where the score would be, and a sheet with a column for each side.

**Two equal shoot-off arrows are the judge's call.** The card asks who won rather than guessing.
Plot both arrows and it works it out from which one is closer to the centre.

## Scoring

**Number the arrows.** The scoring page can mark each arrow with the order it was entered in, which
is what keeps them apart once the sheet is sorted highest first. Both switches live at the foot of
the scoring page, and both work on a match card too.

**The sheet is editable after the fact.** Tap any arrow already entered to retap its value; tap an
end's row number to open the whole end, plotted arrows and group size included.

**Undo is two levels.** The undo button drops the arrow being entered; "undo last end" drops the
whole end that was already written.

**Free arrows still count.** The training counter on the session page records arrows shot without
scoring them. They count towards volume, weekly goals and session goals, and never reach a score.

## Equipment

**The equipment tab opens your default bow.** With a default bow set, tapping the equipment tab goes
straight to it. Hold the tab, or use the dots menu on the bow page, to reach the list of every bow.

**Sight marks fill themselves in.** Add a distance and the app works out the height from the marks
you shot in: three or more are fitted with a parabola, two with a line. A worked out mark is dashed
and led by a tilde. Tapping it clears the field so the real mark can be typed over it, and leaving
the field empty brings the estimate back.

**Extra columns are opt in.** Windage, clicker and plunger hide behind the chips under the mark list.
A column holding data always shows, whatever the chips say.

## Statistics

**Pin the rounds you care about.** The star on a round card keeps it at the top of the page.

**Through the round.** This block averages your score per arrow at each end position. It appears once
a single round is chosen in the filters, because a six arrow end and a three arrow end are different
questions: it is the figure that says whether you fall apart at end nine.

**The chips combine.** Period, round, bow, kind and wind narrow every figure on the page at once, and
each chip counts its options with the other chips already applied, so no option leads to an empty
page. What the page is looking at is restored on the next visit.

**A round is what you shot, not what you called it.** Round types are worked out from the distance,
the face, the ends and the arrows in them, so the same twelve ends at 70m are one round type whether
you picked WA 720 from the list or built it by hand. Only the standard shapes get a card; a one off
practice shape still counts in the chart and can still be filtered on.

**The main chart counts every arrow.** Unfinished rounds included, coloured by the kind of outing.
The round cards are the opposite: only rounds shot to the end, because a round you walked away from
scores lower for reasons that say nothing about how you shot.

**Chart colours are declared outside `@theme`.** Tailwind only emits the theme variables its
generated classes mention, and a chart paints its colours through an inline style, so the chart hues
live on `:root` as `--c-kind-*` and `--c-medal-*` rather than as theme tokens that would be dropped
from the build.

## Badges

**They find you.** Badges are awarded as you shoot, and the ones that finish a round announce
themselves with the same fireworks a personal best does. A last arrow that sets a record and earns
two badges shows all three cards under one volley. The list is behind the dots menu on the stats
page, or the medal in the settings grid.

**Untargeted arrows count.** The arrow counter on the session page feeds the volume and habit badges
like any scored round, and a badge one of those arrows earns goes up over the session page.

**Two ways to read the list.** The grid of icons is the default; the dots menu swaps it for the list
with every rule spelled out, and remembers which you chose. Tapping a badge in the grid opens what
it wants and how close you are either way.

**Locked ones show their progress.** A badge you have not earned still says what it wants and how
far along you are, because 840 arrows of a thousand is worth knowing.

**The FFTA arrows look like arrows.** Each progression arrow is drawn in the colour it is named for,
and only dims until it is shot: the colour is the name of the award, so it is never taken away.

**A badge is dated by the shooting, not by the app.** Score an old session and any badge it earns
appears with the date of that session, wherever it lands in the list.

**Once earned, kept.** Deleting a session never takes a badge back. If you want the list to match
the history exactly, the recheck in the settings data tab is the button that does it, and it is the
only thing in the app that can take a badge away.

## Sharing

**A round is a picture.** The share button in the scoring header opens the round as a card built to
be posted: score, arrows, tens, Xs, and the end by end shape. A personal best turns the card gold and
adds a ribbon.

## Elsewhere

**Deleting asks nothing, and gives it back.** A session, a round or a match goes the moment you tap
delete, and a strip above the tab bar offers it back for six seconds. Nothing is really gone until
much later: a delete only hides the row.

**An empty page shows what fills it.** Every empty list draws a faded example of a real row, marked
"Example", and says in a sentence what the page is for. The example is a drawing, not a row: it
cannot be tapped and it is nobody's data.


**Everything is local.** Nothing is uploaded, by design. The backup in the settings data tab is how a
phone hands its history to another one.

**The app works with no signal.** Weather and place names need a network at the moment they are
fetched; nothing else does.
