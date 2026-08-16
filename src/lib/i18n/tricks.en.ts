/**
 * Things the app does that nothing on screen announces, in the words the app uses for them. This
 * is the reference copy: `tricks.fr.ts` is typed against it, so a trick added here without a
 * translation fails the build rather than showing up in English on a French phone.
 *
 * A trick earns its place by being reachable by hand and not obvious. See doc/dev_guidelines.md.
 */
export const tricksEn = {
	title: 'Tips and tricks',
	lead: 'Things the app does that nothing on screen announces. Everything here is reachable by hand: this is a list of shortcuts, not of hidden settings.',
	groups: [
		{
			key: 'home',
			title: 'Home',
			tricks: [
				{
					lead: 'Change what the two figures count.',
					body: 'Press and hold either figure in the header, or right click it, and pick from several options.'
				},
				{
					lead: 'Ring the target.',
					body: 'Tap the rings in the top right corner of the home header to play the ripple again.'
				},
				{
					lead: 'Dismiss a record.',
					body: 'The new personal best card carries a small cross. Dismissing it is saying "I know": the card comes back for the next record, on a different round.'
				}
			]
		},
		{
			key: 'sessions',
			title: 'Sessions',
			tricks: [
				{
					lead: 'Measure the week against your plans.',
					body: 'The dots menu on the sessions list turns the weekly goal on. Each week’s pill then reads 72/230 arrows, counting the slot goals and the free arrows of every plan. A week that reaches its goal turns brand coloured.'
				},
				{
					lead: 'The sessions tab finds today again.',
					body: 'The list opens on today, then stays where you put it: coming back from a session leaves you in the week you were reading. Tap the sessions tab while the list is already on show to be taken back to today, which rings as it arrives.'
				},
				{
					lead: 'The search reads the whole outing.',
					body: 'The box above the list matches a session’s name, its place, its notes and the name of every round and procedure shot in it. Every word typed has to be found somewhere, in any order, and accents are ignored.'
				},
				{
					lead: 'A plan can be put aside.',
					body: 'The toggle at the top of a plan stops it filling the sessions list and stops its arrows counting towards the weekly goal, without deleting anything it already produced.'
				},
				{
					lead: 'The new session button has two shapes.',
					body: 'The display section of the settings turns the round plus button in the corner into the full width bar.'
				},
				{
					lead: 'Work on several outings at once.',
					body: 'Hold a session down, or right click it, and the list turns into a selection: tapping picks rows instead of opening them. The bar at the foot then changes the bow of everything picked, or deletes it all, and the same hold works on the activities inside a session.'
				},
				{
					lead: 'A planned slot costs nothing.',
					body: 'Opening a session a plan calls for writes nothing to the database. It becomes a real session the moment an arrow, a note or a setting is entered in it, so a week nobody shot leaves no trace to clean up.'
				}
			]
		},
		{
			key: 'timer',
			title: 'Timer',
			tricks: [
				{
					lead: 'The timer in an activity.',
					body: 'The timer sits behind the clock icon in any activity header and in the sessions menu. It holds the World Archery times: four minutes for six arrows, two for three, two for a team’s six, eighty seconds for a mixed team, twenty for alternating shooting.'
				},
				{
					lead: 'Two blasts, one blast, three blasts.',
					body: 'Calling the line sounds two whistles, then one, then starts the clock; zero sounds three. The sounds are synthesised on the device rather than recorded, so nothing is shipped that belongs to somebody else, and they can be turned off.'
				},
				{
					lead: 'The times are yours to change.',
					body: 'The rules’ times are what the clock starts from, and the edit sheet puts any of them on a different number of seconds. Emptying a field puts the rule back.'
				},
				{
					lead: 'The clock is read, never ticked.',
					body: 'Time left is worked out from the moment it started, so a phone that slept through half an end wakes up with the right number, and the screen is held awake while it runs.'
				}
			]
		},
		{
			key: 'matches',
			title: 'Matches',
			tricks: [
				{
					lead: 'A match is shot, not scored.',
					body: 'The number on a match card is its set points, and it deliberately never reaches your personal bests or your round averages. Its arrows still count as arrows shot.'
				},
				{
					lead: 'Totals first, arrows when there is time.',
					body: 'An end needs only the two totals, because a match is shot on the clock. Tap a slot instead and the keypad rises from under the sheet, filling our side then theirs; typing a total afterwards clears that side’s arrows, since one number cannot have two sources. The keypad and the face are the same switch the scoring page uses.'
				},
				{
					lead: 'Keep the card for somebody else.',
					body: 'The toggle in the match settings says these arrows are not yours: nothing on the card then reaches your volume or your badges.'
				},
				{
					lead: 'Correct an end after the match is over.',
					body: 'Every figure is recomputed from the ends every time, so fixing end two moves the winner, the arrows counted and the badges with it.'
				},
				{
					lead: 'Shoot against the app.',
					body: 'A match can be set against a bot at one of four levels. It shoots real arrows onto the face rather than picking a number, so its group looks like a group, and it answers the moment your end is in. Each level has a badge for beating it.'
				},
				{
					lead: 'A bracket is a day, not a list.',
					body: 'Give each match its round and the session page draws the ladder in the order it was climbed, from the eighths to the final.'
				},
				{
					lead: 'Every name field remembers every name.',
					body: 'Our side, the opponent and each teammate all offer everybody named on a card before, whichever side they were on. An archer met as an opponent one week and shot beside the next is one name in the history rather than three spellings of it.'
				},
				{
					lead: 'A match shares as a picture too.',
					body: 'The share button builds the same card a round does: the scoreline where the score would be, and a sheet with a column for each side.'
				},
				{
					lead: 'Two equal shoot-off arrows are the judge’s call.',
					body: 'The card asks who won rather than guessing. Plot both arrows and it works it out from which one is closer to the centre.'
				}
			]
		},
		{
			key: 'scoring',
			title: 'Scoring',
			tricks: [
				{
					lead: 'Number the arrows.',
					body: 'The scoring page can mark each arrow with the order it was entered in, which is what keeps them apart once the sheet is sorted highest first. Both switches live at the foot of the scoring page, and both work on a match card too.'
				},
				{
					lead: 'A shaft that keeps missing is named.',
					body: 'Plot your arrows on the face and the scoring page watches each arrow of the end, by the position it was called in, against the others. If one of them keeps landing away from the rest, and its own grouping is no worse than theirs, a card appears above the histogram saying which arrow it is and where it goes. It is deliberately hard to trigger: three plots of that arrow, eight of the others, a gap worth a ring, and every plot of it on the same side. A whole group that is out says nothing, because that is the archer or the sight, not the shaft.'
				},
				{
					lead: 'The sheet is editable after the fact.',
					body: 'Tap any arrow already entered to retap its value; tap an end’s row number to open the whole end, plotted arrows and group size included.'
				},
				{
					lead: 'Undo is two levels.',
					body: 'The undo button drops the arrow being entered; "undo last end" drops the whole end that was already written.'
				},
				{
					lead: 'Free arrows still count.',
					body: 'The training counter on the session page records arrows shot without scoring them. They count towards volume, weekly goals and session goals, and never reach a score.'
				}
			]
		},
		{
			key: 'equipment',
			title: 'Equipment',
			tricks: [
				{
					lead: 'The equipment tab opens your default bow.',
					body: 'With a default bow set, tapping the equipment tab goes straight to it. Tap the tab a second time, hold it, or use the dots menu on the bow page, to reach the list of every bow.'
				},
				{
					lead: 'The archer section belongs to the bow.',
					body: 'Bow hand and draw length sit with each bow rather than with you, because the same archer draws a longbow shorter than a compound, and a bow borrowed the other way round is shot the other way round. They are versioned like every other setting, so a changed draw length is in the history.'
				},
				{
					lead: 'A bow made from an outing is that outing’s bow.',
					body: 'With no bow recorded at all, the tuning section of the add screen offers the form directly. The bow made there is set on the session that asked for it, whether or not it becomes your default bow.'
				},
				{
					lead: 'Sight marks fill themselves in.',
					body: 'Add a distance and the app works out the height from the marks you shot in: three or more are fitted with a parabola, two with a line. A worked out mark is dashed and led by a tilde. Tapping it clears the field so the real mark can be typed over it, and leaving the field empty brings the estimate back.'
				},
				{
					lead: 'Extra columns are opt in.',
					body: 'Windage, clicker and plunger hide behind the chips under the mark list. A column holding data always shows, whatever the chips say.'
				}
			]
		},
		{
			key: 'statistics',
			title: 'Statistics',
			tricks: [
				{
					lead: 'Pin the rounds you care about.',
					body: 'The star on a round card keeps it at the top of the page.'
				},
				{
					lead: 'Through the round.',
					body: 'This block averages your score per arrow at each end position. It appears once a single round is chosen in the filters, because a six arrow end and a three arrow end are different questions: it is the figure that says whether you fall apart at end nine.'
				},
				{
					lead: 'The chips combine.',
					body: 'Period, round, bow, kind and wind narrow every figure on the page at once, and each chip counts its options with the other chips already applied, so no option leads to an empty page. What the page is looking at is restored on the next visit.'
				},
				{
					lead: 'A round is what you shot, not what you called it.',
					body: 'Round types are worked out from the distance, the face, the ends and the arrows in them, so the same twelve ends at 70m are one round type whether you picked WA 720 from the list or built it by hand. Only the standard shapes get a card; a one off practice shape still counts in the chart and can still be filtered on.'
				},
				{
					lead: 'The main chart counts every arrow.',
					body: 'Unfinished rounds included, coloured by the kind of outing. The round cards are the opposite: only rounds shot to the end, because a round you walked away from scores lower for reasons that say nothing about how you shot.'
				}
			]
		},
		{
			key: 'badges',
			title: 'Badges',
			tricks: [
				{
					lead: 'They find you.',
					body: 'Badges are awarded as you shoot, and they announce themselves with the same fireworks a personal best does. The sky lights up at four moments: finishing a round, winning a match, adding arrows on either arrow counter, and going up a level. Whatever a single moment won is shown under one volley, so a last arrow that sets a record, earns two badges and takes you up a level shows all four cards together. The list is behind the dots menu on the stats page, or the medal in the app grid.'
				},
				{
					lead: 'Untargeted arrows count.',
					body: 'The arrow counter on the session page feeds the volume and habit badges like any scored round, and a badge one of those arrows earns goes up over the session page.'
				},
				{
					lead: 'Two ways to read the list.',
					body: 'The grid of icons is the default; the dots menu swaps it for the list with every rule spelled out, and remembers which you chose. Tapping a badge in the grid opens what it wants and how close you are either way.'
				},
				{
					lead: 'A badge is dated by the shooting, not by the app.',
					body: 'Score an old session and any badge it earns appears with the date of that session, wherever it lands in the list.'
				},
				{
					lead: 'Once earned, kept.',
					body: 'Deleting a session never takes a badge back. If you want the list to match the history exactly, the recheck in the settings data tab is the button that does it, and it is the only thing in the app that can take a badge away.'
				}
			]
		},
		{
			key: 'experience',
			title: 'Experience',
			tricks: [
				{
					lead: 'Nothing is banked.',
					body: 'Experience points are never stored: the total is worked out afresh from the history as it stands, so the same history always gives the same level. That means deleting a session takes back exactly what it gave, arrows, round and match win alike, and correcting a score moves the points with it. Badges are the one thing that outlives their shooting, because the badge itself does: lose one to the recheck in the settings data tab and its points go with it.'
				},
				{
					lead: 'A celebration is remembered per device.',
					body: 'The app keeps the level it last congratulated you for, so it never announces the same one twice, and it lowers that mark on its own when a deleted session costs you a level: win it back and the fireworks come back with it. To be congratulated for where you already stand, the celebrate again button in the settings data tab forgets the lot, levels and records alike.'
				},
				{
					lead: 'The level can ride the header.',
					body: 'Hold either figure at the top of the home page and pick the level, or the experience total, instead of a count of arrows.'
				}
			]
		},
		{
			key: 'sharing',
			title: 'Sharing',
			tricks: [
				{
					lead: 'A round is a picture.',
					body: 'The share button in the scoring header opens the round as a card built to be posted: score, arrows, tens, Xs, and the end by end shape. A personal best turns the card gold and adds a ribbon.'
				},
				{
					lead: 'The share page is a poster.',
					body: 'The code in the app grid is laid out to be printed as well as scanned: printing it gives an A3 sheet in plain black and white, with the address written under the code for anybody who would rather type it.'
				}
			]
		},
		{
			key: 'elsewhere',
			title: 'Elsewhere',
			tricks: [
				{
					lead: 'Open a CapTarget export with Appchery.',
					body: 'Export from CapTarget and pick Appchery in the share sheet, or open the .xlsx from your files. Importing again after a later export refreshes what it wrote instead of doubling it, and the sessions you recorded here are never touched.'
				},
				{
					lead: 'A score with no arrows behind it is its own activity.',
					body: 'Free plotting and scoring games are recorded as a score only activity: a distance, a face, an arrow count and a total. Its arrows count towards your volume, and its score stays out of averages and personal bests, because there are no ends behind it.'
				},
				{
					lead: 'Deleting asks nothing, and gives it back.',
					body: 'A session, a round or a match goes the moment you tap delete, and a strip above the tab bar offers it back for six seconds. Nothing is really gone until much later: a delete only hides the row.'
				},
				{
					lead: 'The app works with no signal.',
					body: 'Weather and place names need a network at the moment they are fetched; nothing else does.'
				}
			]
		}
	]
};

export type TricksDictionary = typeof tricksEn;
