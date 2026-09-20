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
	search: 'Filter the list',
	searchEmpty: 'Nothing here matches {q}.',
	groups: [
		{
			key: 'home',
			title: 'Home',
			tricks: [
				{
					lead: 'Change what the two figures count.',
					body: 'Press and hold either figure in the header, or right click it, and pick from several options.'
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
					lead: 'The search reads the whole session.',
					body: 'The box above the list matches a session’s name, its place, its notes and the name of every round and procedure shot in it. Every word typed has to be found somewhere, in any order, and accents are ignored.'
				},
				{
					lead: 'A plan can be put aside.',
					body: 'The toggle at the top of a plan stops it filling the sessions list and stops its arrows counting towards the weekly goal, without deleting anything it already produced.'
				},
				{
					lead: 'Work on several sessions at once.',
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
					body: 'An end needs only the two totals, because a match is shot on the clock. Tap a slot instead and the keypad rises from under the sheet, filling our side then theirs. Typing a total afterwards clears that side’s arrows, since one number cannot have two sources.'
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
					body: 'The scoring page can number each arrow in the order you entered it, so you can still tell them apart once the sheet is sorted highest first. Both switches are at the foot of the scoring page, and both work on a match card too.'
				},
				{
					lead: 'A shaft that keeps missing is named.',
					body: 'Plot your arrows on the face and the app compares each arrow of the end against the others. If one keeps landing away from the rest, a card above the histogram says which arrow it is and which way it goes. It takes a clear, repeated pattern to trigger. A whole group that is out says nothing: that is the archer or the sight, not the shaft.'
				},
				{
					lead: 'The sheet is editable after the fact.',
					body: 'Tap any arrow already entered to retap its value; tap an end’s row number to open the whole end, plotted arrows and group size included.'
				},
				{
					lead: 'Press rather than tap to aim.',
					body: 'A tap puts the arrow exactly where you touched. Hold instead and the face magnifies under a crosshair that sits above your finger, so you can see the ring you are on and slide onto it before letting go. Pinch while holding to magnify harder. How long a press has to be to count as aiming is yours to set, in the settings.'
				},
				{
					lead: 'The face zooms.',
					body: 'Pinch any target face with two fingers to move in on it, and drag with both to move around. Hold ctrl and use the wheel, or drag, on a computer. A button appears in the corner to come back out. Zoomed in, arrows are picked more precisely, and pressing to place one still magnifies on top of it.'
				},
				{
					lead: 'Pick the arrow off the face.',
					body: 'Inside an end, tapping an arrow where it landed selects it just as tapping its square does. The selected one is ringed, and every tap after that moves it. Tap it again to let it go.'
				},
				{
					lead: 'Undo is two levels.',
					body: 'The undo button drops the arrow being entered; "undo last end" drops the whole end that was already written.'
				},
				{
					lead: 'Free arrows still count.',
					body: 'The training counter on the session page records arrows shot without scoring them. They count towards volume, weekly goals and session goals, and never reach a score.'
				},
				{
					lead: 'Emptying your total clears the whole end.',
					body: 'On a match card your side is what holds an end together, so rubbing out your total takes the end with it, your opponent’s number included. A total left at nought would otherwise be read as an end you shot and lost. Enter the end again to put it back.'
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
					lead: 'A bow made from a session is that session’s bow.',
					body: 'With no bow recorded at all, the tuning section of the add screen offers the form directly. The bow made there is set on the session that asked for it, whether or not it becomes your default bow.'
				},
				{
					lead: 'Sight marks fill themselves in.',
					body: 'Add a distance and the app works out the height from the marks you shot in: three or more are fitted with a parabola, two with a line. A worked out mark is dashed and led by a tilde. Tapping it clears the field so the real mark can be typed over it, and leaving the field empty brings the estimate back.'
				},
				{
					lead: 'Extra columns are opt in.',
					body: 'Windage, clicker, plunger and sight position hide behind the chips under the mark list. A column holding data always shows, whatever the chips say.'
				}
			]
		},
		{
			key: 'statistics',
			title: 'Statistics',
			tricks: [
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
					body: 'Unfinished rounds included, coloured by the kind of session. The round cards are the opposite: only rounds shot to the end, because a round you walked away from scores lower for reasons that say nothing about how you shot.'
				}
			]
		},
		{
			key: 'badges',
			title: 'Badges',
			tricks: [
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
					body: 'Experience points are never stored: the total is worked out afresh from your history, so the same history always gives the same level, and correcting a score moves the points with it. Badges are the exception, because the badge itself outlives the shooting that won it.'
				},
				{
					lead: 'A celebration is remembered per device.',
					body: 'The app remembers the last level it congratulated you for, so it never announces the same one twice, and lowers that mark if a deleted session costs you a level. To be congratulated for where you already stand, celebrate again in the settings data tab forgets the lot, levels and records alike.'
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
					lead: 'The medal in the feed is not a record.',
					body: 'A shared round marked "best shared" is the highest of that same round the archer has shared with you, and nothing more. Their real record is worked out on their own phone from every round they ever shot, most of which never travels, so the feed says only what it can actually see.'
				},
				{
					lead: 'The share page is a poster.',
					body: 'The code in the app grid is laid out to be printed as well as scanned: printing it gives an A3 sheet in plain black and white, with the address written under the code for anybody who would rather type it.'
				}
			]
		},
		{
			key: 'drills',
			title: 'Drills',
			tricks: [
				{
					lead: 'Take an arrow back and the drill takes it back with you.',
					body: 'Undo removes the last end and the rule is read again over what is left, so a life you lost comes back and a run that broke picks up where it was. This works on a drill its own rule has already ended: undo the arrow that ended it and it opens again.'
				},
				{
					lead: 'A drill counts as arrows, never as a score.',
					body: 'Its total depends on the rule it was shot to and on how many arrows you chose, so it would mean nothing beside a round. Drills count towards your volume, your experience and your arrow badges, and stay out of averages, records and round comparisons.'
				},
				{
					lead: 'The keys the drill is not asking for stay usable.',
					body: 'The keypad fades every ring outside the zone you set, and still takes them: an arrow that landed in the six is recorded as a six. A drill measures what you shot, it does not decide it.'
				}
			]
		},
		{
			key: 'training',
			title: 'Training',
			tricks: [
				{
					lead: 'Changing a target leaves the work you already did alone.',
					body: 'Editing the reps or the hold on an exercise mid session changes every set you have not ticked yet, and none of the ones you have. What is recorded is what you actually did, set by set, not what the session was set up to be.'
				},
				{
					lead: 'The rest counts from the set, not from the screen.',
					body: 'Tick a set and the rest starts. Lock the phone, put it in a pocket and come back: the countdown is worked out from the moment you ticked, so it is over when it should be over rather than when the page next woke up.'
				},
				{
					lead: 'A run only needs the two numbers it is made of.',
					body: 'Enter a distance and a time and the pace works itself out, so the card can never hold a pace its own numbers deny. Half a run is saved as it stands: a distance with no time is still a run you did.'
				},
				{
					lead: 'Jump to the block you are actually on.',
					body: 'Tap the block card at the top of a run and pick any block of the programme, repeats and all. The run carries on from there: the one you left keeps what it came to, and the one you picked starts counting from your own distance and clock rather than from the plan’s.'
				},
				{
					lead: 'A programme is repeats of blocks, not a count on one.',
					body: 'Write 7 times (200 m fast, 100 m easy) as one repeat holding two blocks. The frame around them is what makes it read back at a glance, and the duplicate button on any block or repeat copies it with fresh ids, so writing the session twice over is two taps.'
				},
				{
					lead: 'A tracked run keeps recording in your pocket.',
					body: 'Starting a run starts a service of its own, so the screen can go off and the phone can go in a pocket without losing the middle of the run. The notification it leaves behind is the way back to the numbers. In a browser there is no such service: a sleeping tab stops recording, and the run says so.'
				},
				{
					lead: 'A run you already have a file for.',
					body: 'A run with nothing in it yet offers to read a GPX. The file becomes the run: its track, its splits, its climb and whatever heart rate it carries, worked out here rather than trusted, so an imported run and a recorded one add up the same way. A finished run exports the same file back out, extensions and all.'
				},
				{
					lead: 'The kilometres are one reading of a run, not the only one.',
					body: 'The tab beside them draws the pace, the climb and the heart rate over each other, any of the three at a time. It runs against distance until you tap for time, which is the difference between a hill and a red light.'
				},
				{
					lead: 'The watch measures the heart rate, and asks the first time.',
					body: 'Start a run with a watch linked and it asks for the sensor once, then reads the wrist for as long as the run lasts. The beat goes up to the phone and is written on the fixes, so it is in the graph and in the exported GPX afterwards. Its own page on the watch keeps the last few minutes as a line.'
				},
				{
					lead: 'A programme running out does not end the run.',
					body: 'When the last block is done the watch says Free run and the clock carries on from there, with nothing to hold and nothing counting down. The way home from the track is a run, and it is timed from where the blocks stopped. Finish it when you actually finish.'
				},
				{
					lead: 'Take a lap wherever you like.',
					body: 'The lap button on the run, and on the watch\u2019s controls page, marks the top of the hill or the lamp post you sprinted to. Each one is timed from the last, and they are kept apart from the kilometres: a kilometre is arithmetic and a lap is something you decided.'
				},
				{
					lead: 'Tap a kilometre to see what happened in it.',
					body: 'The list says which one was slow. Tapping it opens the graph at that moment, with the pace, the hill and the beat marked there and the same place marked on the route.'
				},
				{
					lead: 'Tell the app your highest heart rate and the beat starts meaning something.',
					body: 'Put it in the settings and every run says where its time went, zone by zone, each with its own colour. The watch wears the zone as the ring around its glass while you run, because a colour is read at a glance and a number is not.'
				},
				{
					lead: 'The watch buzzes when the block changes.',
					body: 'A linked watch shows the run as it happens: what is left of the block, the pace you are meant to be holding and the one you are holding. When a block ends it buzzes twice and wakes its screen, so an interval session can be run without looking at anything.'
				}
			]
		},
		{
			key: 'ianseo',
			title: 'Competitions',
			tricks: [
				{
					lead: 'The search reaches past your filters.',
					body: 'The countries you follow decide what the list shows, but typing into the search asks the whole of ianseo: every competition it has ever hosted, by name, town, organiser or code. Clearing the box puts your own list back.'
				},
				{
					lead: 'Follow an archer from inside a result.',
					body: 'Open any row of a result list, or tap the star beside a name in a bracket, and that archer is followed for that competition. Their line is then marked wherever it appears in it, and the competition is followed too.'
				},
				{
					lead: 'Everything read is kept for the range.',
					body: 'Every competition and result you open is stored on the device, so it reads again with no signal. What is shown always says when it was read, and refuses to pass itself off as live.'
				},
				{
					lead: 'Told about a result while the app is shut.',
					body: 'Under the competitions you follow there is a switch to be told when one of them publishes. It runs on the device: the browser wakes the app now and then, asks ianseo the same question the list asks, and raises the notice itself. No account, nothing sent anywhere, and nothing to pay for. A phone saving power may check rarely, or not at all, which is the price of there being no server behind it.'
				},
				{
					lead: 'Clubs are named the way people say them.',
					body: 'A federation files a club under a number, and ianseo prints it: 0702022 - JUSSY. The app shows the name alone. The columns button has the switch for anybody who wants the number back.'
				},
				{
					lead: 'Choose what a result shows.',
					body: 'The button beside that search picks the columns. They are remembered by their heading rather than by the competition, so switching the tens and the nines off once switches them off in every result that has them.'
				}
			]
		},
		{
			key: 'elsewhere',
			title: 'Elsewhere',
			tricks: [
				{
					lead: 'A watch is connected once, not once per screen.',
					body: 'The link is made from the settings and stays up while you move around the app, so connect before you walk to the line rather than between ends. In the installed Android app it is made once and for good: the watch is remembered and opened again by itself when the app starts, when it comes back to the screen, and while it is out of range. In a browser there is no remembering, so reloading the page or walking away costs another tap, and only Chrome and Edge can connect one at all.'
				},
				{
					lead: 'Disconnect is how you forget a watch.',
					body: 'The installed app keeps opening the watch it connected to last, so the button that stops it doing that is Disconnect in the settings. Connecting again costs one tap and one choice from the list, and it is remembered from then on.'
				},
				{
					lead: 'Back on the watch moves the phone.',
					body: 'The phone owns where the two of them are, so going back on the wrist walks the phone out of the round and into its session, then out of the session, rather than leaving the two screens somewhere different from each other.'
				},
				{
					lead: 'The phone works out every score, not the watch.',
					body: 'The watch sends which ring each arrow landed in and the phone turns that into points, so a watch on an older build cannot write a wrong score. Whichever of the two you edited last is the one that is kept, and an edit made on the phone shows up on the wrist.'
				},
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
				},
				{
					lead: 'Signing in adopts what is already here.',
					body: 'An account is optional and arrives late on purpose: everything you shot before signing in is claimed by the account the moment you do, rather than starting you empty. Signing out changes nothing on the device, and your shooting stays whether or not you ever sign in again.'
				},
				{
					lead: 'A handle is asked for late, and only once.',
					body: 'Syncing needs no handle at all. The friends page asks for one the first time you open it, so an archer who only wants their scores on two devices never becomes findable by anybody.'
				},
				{
					lead: 'Sharing is a switch, not a list.',
					body: 'An activity is shared or it is not, and who sees it follows from your profile being public or private. Turning it off takes it back everywhere, because nothing was ever copied to anybody. The place, the weather and the bow never travel with it.'
				},
				{
					lead: 'What others see of you is a snapshot.',
					body: 'Your profile shows arrows, sessions, badges and level to whoever may see what you share. Your own phone works those figures out and publishes them when it syncs, so they are as recent as your last sync and never a moment fresher.'
				},
				{
					lead: 'Blocking says nothing.',
					body: 'A blocked archer sees your profile exactly as a private one looks, and can still ask to follow you. The request never reaches you, and they are never told.'
				},
				{
					lead: 'Erasing the device asks you to sign out first.',
					body: 'Emptying this phone and closing your account are separate acts, and neither does the other. Sign out, then erase, and the account keeps what it already has.'
				}
			]
		}
	]
};

export type TricksDictionary = typeof tricksEn;
