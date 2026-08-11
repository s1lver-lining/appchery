# Appchery — Badges

Goals worth marking, and where their rules come from. The catalogue lives in
`src/lib/domain/badges.ts`; this file is the reasoning behind it and the source for the rules data.

## Why badges are stored and personal bests are not

A personal best is a query over `activity`. Correct an arrow entered wrong and the record moves,
which is what an archer means by a record: it describes the history as it stands.

A badge means something different. It marks a day that happened. Deleting the session it was earned
in should not reach back and unmake it, so badges are rows in `badge`, written once and kept.

That storage buys one problem: a badge whose shooting is gone is a badge standing on nothing. The
recheck in the settings data tab is the answer, and it is deliberately a button rather than
something that runs on load. Losing a badge is a thing that should happen because the archer asked
for a tidy up, never quietly while they were looking at something else. A badge that survives a
recheck keeps its original date, because that is still the day it was shot.

## Evaluation

Every rule answers "when was this earned?" with the timestamp of the shooting that won it, not with
a yes or no. That is what lets a badge awarded today be dated to the round three months ago that
actually earned it, and it makes the rules total functions over the history: given the same
activities they give the same answer, in any order, on any device.

Bow type comes from the session: the bow it names, or the generic type when that is all it recorded.
An outing that recorded neither proves no bow, so a badge that asks for one is not earned. Guessing
from the default bow would hand out a recurve award for a round shot with a compound.

## Rules data

### FFTA progression arrows

From the Fédération Française de Tir à l'Arc, *Règlements Généraux*, édition février 2023, the
distinctions chapter: <https://www.ffta.fr/sites/default/files/2024-05/distinctions_0.pdf>

Six ends of six arrows, 36 in all, on the face used in competition for the distance.

| Arrow | Distance | Face | Score | Bow |
|---|---|---|---|---|
| White | 10 m | 80 cm | 280 | any |
| Black | 15 m | 80 cm | 280 | any |
| Blue | 20 m | 80 cm | 280 | any |
| Red | 25 m | 80 cm | 280 | any |
| Yellow | 30 m | 80 cm | 280 | any |
| Bronze | 40 m | 80 cm | 280 | recurve |
| Silver | 60 m | 122 cm | 280 | recurve |
| Gold | 70 m | 122 cm | 280 | recurve |
| Bronze | 40 m | 80 cm | 310 | compound |
| Silver | 50 m | 80 cm | 310 | compound |
| Gold | 50 m | 80 cm | 330 | compound |

The rulebook opens the first five to recurve and compound alike, and the app asks for no bow at all
there: an archer shooting a barebow at 10 m has shot the white arrow's distance and score.

The round has to be that shape. A WA 720 at 70 m is 72 arrows, so it earns no gold arrow however
good the score, and a round quoted in yards is compared in metres, which means 20 yd is not 20 m.

### Not implemented: Archery GB progress awards

The Archery GB scheme keys its scores on age group, from U12 to Senior, and the app records no
archer age. Adding it means modelling a category first. The published tables were also not
reachable to check against at the time of writing, and doc/dev_guidelines.md is clear that rules
data goes in verified or not at all.

## What is not a badge

Nothing that rewards opening the app, shooting at a particular time of day, or any other number an
archer cannot improve by shooting better or more often. A badge that means nothing cheapens the ones
that do, in the same way that calling a first round a personal best cheapens every record after it.
