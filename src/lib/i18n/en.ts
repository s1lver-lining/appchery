// The reference dictionary: other locales are typed against it so a missing key fails the build.
export const en = {
	app: {
		name: 'Appchery',
		tagline: 'Archery Scoring & Training',
		exitTitle: 'Close Appchery?',
		exitBody: 'Everything is already saved on this device.',
		exitAction: 'Close'
	},
	// The poster that hands the app to somebody else: the address of the app, as a code.
	invite: {
		title: 'Share',
		print: 'Print',
		scan: 'Scan the code, or type the address',
		body: 'Appchery keeps your scores, your sessions and your bow settings on your own phone. An account is optional, and nothing leaves the phone without one. Nothing to pay.',
		free: 'Free and open source, under the AGPL.'
	},
	nav: {
		home: 'Home',
		sessions: 'Sessions',
		equipment: 'Equipment',
		stats: 'Statistics',
		settings: 'Settings'
	},
	common: {
		start: 'Start',
		cancel: 'Cancel',
		save: 'Save',
		add: 'Add',
		delete: 'Delete',
		back: 'Back',
		undo: 'Undo',
		done: 'Done',
		close: 'Close',
		loading: 'Loading…',
		optional: 'optional',
		today: 'Today',
		tomorrow: 'Tomorrow',
		more: 'More',
		hour: 'Hour',
		minute: 'Minute',
		dayPeriod: 'AM or PM'
	},
	sessions: {
		title: 'Sessions',
		empty: 'No sessions yet. Start one, then add activities to it.',
		new: 'New session',
		listTab: 'List',
		calendarTab: 'Calendar',
		view: 'View',
		search: 'Search sessions',
		noMatch: 'Nothing matches that search.',
		week: 'Week {n}',
		noneThisMonth: 'Nothing shot this month.',
		dayCount: '{n} sessions',
		open: 'Open session',
		finish: 'Finish session',
		name: {
			practice: {
				morning: 'Morning session',
				afternoon: 'Afternoon session',
				evening: 'Evening session',
				night: 'Night session'
			},
			competition: {
				morning: 'Morning competition',
				afternoon: 'Afternoon competition',
				evening: 'Evening competition',
				night: 'Night competition'
			}
		},
		newCompetition: 'New competition',
		moreKinds: 'Other kinds of session',
		newPlanned: 'Plan a session',
		jumpTo: 'Jump to',
		prevMonth: 'Previous month',
		nextMonth: 'Next month',
		month: 'Month',
		year: 'Year',
		thisMonth: 'This month',
		arrowGoal: '{n} to shoot',
		planned: 'Planned',
		showWeekGoal: 'Show the weekly goal',
		hideWeekGoal: 'Hide the weekly goal',
		activityCount: '{n} act.',
		arrows: 'arrows',
		oneActivity: '1 act.',
		practice: 'Practice',
		competition: 'Competition',
		qualification: 'Qualification',
		/* Fallen back on where a full name would not fit, as on the statistics filter chips. */
		practiceShort: 'Prac.',
		competitionShort: 'Compet.',
		qualificationShort: 'Qual.'
	},
	session: {
		bow: 'Bow',
		pickBow: 'Choose a bow',
		noBow: 'Not set',
		genericBow: 'Generic bow type',
		myBows: 'My bows',
		conditions: 'Conditions',
		location: 'Location',
		place: 'Place',
		fetchConditions: 'Fetch location and weather',
		fetching: 'Fetching…',
		locationDenied: 'Location permission is required to fetch conditions.',
		locationOff: 'Location is off. Turn "Record location" on in the settings first.',
		weatherFailed: 'Could not fetch the weather. Location was still recorded.',
		activities: 'Activities',
		overviewTab: 'Overview',
		settingsTab: 'Settings',
		weather: 'Weather',
		weatherNone: 'Not recorded',
		weatherOff: 'Weather recording is off. Turn it on in Settings.',
		noConditions: 'Nothing recorded for this session yet.',
		arrowsShot: 'Arrows shot',
		trainingArrows: 'Training arrows',
		oneLess: 'One less',
		customArrows: 'Add arrows',
		notes: 'Notes',
		notesHint: 'What the wind did, what you changed, how it felt.',
		setGoal: 'Set a goal',
		goalTitle: 'Arrow goal',
		goalHint: 'How many arrows this outing is meant to be.',
		goalLeft: '{n} to go',
		goalReached: 'Goal reached.',
		removeGoal: 'Remove',
		when: 'Date and time',
		date: 'Date',
		time: 'Time',
		days: 'd',
		addActivity: 'Add an activity',
		searchActivity: 'Search rounds and procedures',
		scoringGroup: 'Scoring',
		recentGroup: 'Recently shot',
		delete: 'Delete this session',
		confirmTitle: 'Delete this session?',
		confirmBody: 'Every activity in it is deleted too. This cannot be undone.',
		noActivities: 'No activities yet.',
		addScoring: 'Add a scoring activity',
		addTuning: 'Add a tuning activity'
	},
	bow: {
		recurve: 'Recurve',
		compound: 'Compound',
		barebow: 'Barebow',
		longbow: 'Longbow'
	},
	// What a bow is called before it is named: the category is a label, not a name for a thing owned.
	bowName: {
		recurve: 'Recurve Bow',
		compound: 'Compound Bow',
		barebow: 'Barebow',
		longbow: 'Longbow'
	},
	empty: {
		sample: 'Example',
		sessions: {
			title: 'No outings yet',
			body: 'Every time you shoot, start a session here. It keeps the date, the place, the weather and the bow for you.'
		},
		activities: {
			title: 'Nothing shot in this outing yet',
			body: 'Add a round to score arrow by arrow, a match to play somebody, or a tuning procedure.'
		},
		stats: {
			title: 'No rounds to read yet',
			body: 'Shoot a round to the end and this page starts comparing it: your average, your record, and how the shape of it changes.'
		},
		plans: {
			title: 'No training plan yet',
			body: 'A plan is a week you mean to repeat. The sessions list then shows what each week asks of you.'
		},
		equipment: {
			title: 'No bow recorded yet',
			body: 'Add the bow you shoot and the app keeps its settings, its sight marks and everything shot with it.'
		}
	},
	undo: {
		action: 'Undo',
		sessionDeleted: 'Session deleted',
		activityDeleted: 'Activity deleted',
		matchDeleted: 'Match deleted',
		sessionsDeleted: '{n} sessions deleted',
		activitiesDeleted: '{n} activities removed'
	},
	// Leaving a page with settings entered but never written down as a revision.
	leave: {
		discard: 'Discard',
		bowTitle: 'Unsaved settings',
		bowBody: 'This bow has {n} changes that are not part of any revision yet.',
		tuningTitle: 'Unsaved adjustment',
		tuningBody: 'This test has {n} adjustments that have not been applied to the bow yet.'
	},
	// Working on several rows at once: what the bar at the foot of a list says while one is on.
	select: {
		count: '{n} selected',
		all: 'Select all',
		none: 'Select none',
		changeBow: 'Change bow',
		deleteAll: 'Delete all',
		removeAll: 'Remove all',
		bowTitle: 'Bow for the selected sessions',
		deleteTitle: 'Delete the selected sessions?',
		deleteBody: '{n} sessions, with everything recorded in them.',
		removeTitle: 'Remove the selected activities?',
		removeBody: '{n} activities, with the arrows scored in them.'
	},
	timer: {
		title: 'Timer',
		start: 'Call the line',
		stop: 'Stop',
		reset: 'Reset',
		nextTurn: 'Next turn',
		turn: 'Turn {n}',
		resetTimes: 'Back to the rules',
		edit: 'Edit the times',
		ruleTime: 'World Archery: {time}',
		seconds: 'sec',
		preparation: 'Preparation',
		volume: 'Volume',
		preparationHint: 'Between the call to the line and the start.',
		times: 'Shooting times',
		preset: {
			qualification6: 'Qualification, six arrows',
			qualification3: 'Qualification, three arrows',
			match3: 'Match, three arrows',
			team6: 'Team, six arrows',
			mixed4: 'Mixed team, four arrows',
			alternating: 'Alternating, one arrow'
		},
		soundTitle: 'Sound the signals',
		soundHint: 'Two blasts to come to the line, one to start, three to collect. Synthesised on the device, not recorded.',
		signal: {
			lineUp: 'Come to the line',
			start: 'Start',
			end: 'Collect arrows',
			stop: 'Stop shooting'
		},
		signalHint: 'Tap a signal to hear it. Five blasts or more means stop everything at once.'
	},
	match: {
		group: 'Match',
		title: 'Match',
		format: {
			individual: 'Individual',
			team: 'Team',
			mixedTeam: 'Mixed team',
			custom: 'Custom match'
		},
		formatHint: {
			individual: 'Five sets of three arrows, played to six set points.',
			team: 'Four ends of six arrows, played to five set points.',
			mixedTeam: 'Four ends of four arrows, played to five set points.',
			custom: 'Set the ends, the arrows and how it is won.'
		},
		winCondition: 'Win condition',
		system: { set: 'Set points', cumulative: 'Total score' },
		botTitle: 'Play a bot',
		botName: 'Bot ({level})',
		bot: {
			beginner: 'Beginner',
			amateur: 'Amateur',
			advanced: 'Advanced',
			professional: 'Professional'
		},
		bracket: 'Bracket',
		stageLabel: 'Round',
		stage: {
			none: 'Not in a bracket',
			r64: '1/32',
			r32: '1/16',
			r16: '1/8',
			quarter: 'Quarter final',
			semi: 'Semi final',
			bronze: 'Bronze',
			final: 'Final'
		},
		ourSide: 'Our side',
		opponent: 'Opponent',
		teammates: 'Teammates',
		teammate: 'Archer {n}',
		forOtherTitle: 'Scoring for someone else',
		forOtherHint: 'The arrows on this card are not yours, so nothing here counts towards your volume or your badges.',
		face: 'Face',
		faceSize: 'Size (cm)',
		arrowsPerEnd: 'Arrows',
		ends: 'Ends',
		setPoints: 'Points to win',
		advanced: 'More options',
		allowShootOff: 'Allow a shoot-off',
		start: 'Start the match',
		end: 'End {n}',
		shootOff: 'Shoot-off',
		sets: 'Sets',
		total: 'Total',
		whoWon: 'Who took the shoot-off?',
		weWon: 'We won it',
		theyWon: 'They won it',
		undecided: 'Waiting on the judge',
		won: 'Won',
		lost: 'Lost',
		drawn: 'Drawn',
		inProgress: 'In progress',
		against: 'against {name}',
		unrecorded: 'Unrecorded',
		deleteEnd: 'Clear this end',
		noArrows: 'Totals only'
	},
	round: {
		arrows: '{n} arrows',
		yourBest: 'Best {n}',
		lastShot: 'Last shot {when}',
		discipline: {
			target: 'Target',
			field: 'Field',
			'3d': '3D',
			clout: 'Clout',
			custom: 'Custom'
		},
		endsOf: '{ends} ends of {arrows}',
		face: '{size}cm face',
		unmarked: 'Unmarked',
		unverifiedShort: 'Unverified',
		unverified:
			'Scoring for this round has not been checked against the current rulebook yet. Verify the values before trusting a result.',
		max: 'Max {n}',
		custom: 'Custom round',
		customTitle: 'Custom round',
		customHint: 'Manual parameters',
		ends: 'Ends',
		arrowsPerEnd: 'Arrows per end',
		faceSize: 'Face diameter (cm)',
		distance: 'Distance',
		unit: 'Unit',
		name: 'Name',
		create: 'Create and start'
	},
	score: {
		end: 'End {n}',
		endOf: 'End {n} of {total}',
		endColumn: 'End',
		arrowsColumn: 'Arrows',
		endTotalShort: 'E/T',
		endTotalLong: 'End total',
		total: 'Total',
		runningTotalLong: 'Running total',
		arrow: 'Arrow',
		miss: 'M',
		tens: '10s',
		xs: 'Xs',
		average: 'Average per arrow',
		tapToScore: 'Tap a value for each arrow.',
		plotMode: 'On the face',
		byNumber: 'By number',
		editing: 'Editing an arrow',
		undoEnd: 'Undo last end',
		group: 'Group',
		groupCentre: 'Centre offset',
		meanRadius: 'Mean radius',
		plottedArrows: '{n} plotted',
		smallSample: 'Too few plotted arrows for these numbers to mean much yet.',
		plotHint: 'Tap where the arrow landed, or press and drag to aim before letting go.',
		movePlot: 'The ringed arrow is the one you are moving: place it again.',
		placePlot: 'This arrow has no place on the face yet: plot where it landed.',
		noPlots: 'No arrows were plotted on the face for this end.',
		editArrow: 'Edit arrow {n} of end {end}',
		groupSize: 'Group size',
		arrowNumbers: 'Use arrow number',
		arrowNumbersHint: 'Marks each arrow with the order it was entered in, which is what tells them apart once they are sorted.',
		arrowNumberChart: 'Mean score by arrow number',
		arrowNumberOf: 'Arrow {n}, over {arrows} shot',
		arrowNumberFloor: 'Bars are drawn from {n}, not from zero.',
		driftTitle: 'Arrow {n} may be out',
		driftBody:
			'Arrow {n} has landed {direction} of your other arrows {shots} times running. Check the shaft for straightness, its nock and its fletching, or shoot it again and watch it.',
		driftDirection: {
			high: 'above',
			highRight: 'above and right',
			right: 'right',
			lowRight: 'below and right',
			low: 'below',
			lowLeft: 'below and left',
			left: 'left',
			highLeft: 'above and left'
		},
		driftDismiss: 'Hide for now',
		driftIgnore: 'Hide for this round',
		sortArrows: 'Sort arrows highest first',
		sortArrowsHint: 'Shows each end in scoresheet order instead of the order you entered it.',
		roundComplete: 'Round complete. Arrows can still be edited.'
	},
	activity: {
		delete: 'Delete this activity',
		confirmTitle: 'Delete this activity?',
		confirmBody: 'Its ends and arrows are deleted with it. This cannot be undone.'
	},
	weather: {
		sun: 'Clear',
		cloud: 'Cloudy',
		rain: 'Rain',
		snow: 'Snow',
		fog: 'Fog',
		storm: 'Storm'
	},
	ratio: {
		title: 'Mass to draw weight',
		mass: 'Bow mass',
		drawWeight: 'Draw weight',
		unit: 'g/lb',
		fromIdeal: 'from 70',
		hint: 'Weigh the bow as you shoot it, then draw it on a scale.',
		verdict: {
			good: 'Right where it should be: the bow carries its weight well.',
			fair: 'Off the mark, but shootable. Worth a change of stabiliser mass.',
			poor: 'A long way off: the bow will feel dead or unholdable at full draw.'
		}
	},
	brace: {
		title: 'Heights tried',
		hint: 'Add a height, shoot an end or two at it, then twist the string and try the next.',
		face: 'Face',
		centre: 'Height',
		spread: 'Group',
		arrows: '{n} arrows',
		end: 'End {n} · {arrows}',
		addEnd: '+ End',
		addBrace: 'Add a brace height',
		newPlaceholder: 'Brace height in cm',
		tightest: 'Tightest',
		plotTitle: 'Brace height {brace} cm',
		plotHint: 'Tap the face where each arrow landed.',
		undoArrow: 'Undo arrow',
		saveEnd: 'Save the end',
		chartEmpty: 'Plot an end at two heights or more to see the curves.',
		chartLabel: 'Group height and group size against brace height',
		chartUnits: 'Group height left, group size right, both in cm',
		chartAxis: 'Brace height (cm)',
		centreSeries: 'Group height',
		spreadSeries: 'Group size',
		exampleTitle: 'What a good test looks like',
		exampleHint: 'Both curves peak on the brace height worth keeping: the group closes up as it climbs.',
		tableTitle: 'Where to start, by bow length',
		tableHint: 'For a 25 inch riser. A starting range, not a setting: the fine pass is shot.',
		tableBow: 'Bow',
		tableMin: 'Min',
		tableMax: 'Max'
	},
	tuning: {
		title: 'Tuning',
		guideTitle: 'Tuning steps',
		// The same page, named for a button that sits in the corner of a block rather than in a menu.
		guideShort: 'Steps',
		diagram: {
			equalGaps: 'equal gaps',
			limbAligned: 'String splits both gauges',
			limbGauge: 'alignment gauge',
			limbOffPlane: 'Limb sitting off the plane',
			stringLine: 'string',
			button: 'button',
			maxOutside: 'At most 1 to 2 mm outside the plane',
			upper: 'upper',
			lower: 'lower',
			tillerFormula: 'tiller = upper − lower',
			tillerTarget: 'Recommended tiller = 0.6 cm',
			nockToPivot: 'String groove to pivot point',
			amoLength: 'AMO standard length',
			amoFormula: 'AMO = measured + 1.75"',
			atNockingPoint: 'Scale on the nocking point',
			atYourDraw: 'Read at your own draw length',
			braceLabel: 'brace height',
			gripThroat: 'Square on the pivot point, read at the string',
			sightAligned: 'Ring on the string, both ends',
			sightTop: 'Off line at the top',
			sightBottom: 'Off line at the bottom',
			aboutHalf: 'about 0.5 cm',
			squareOnRest: 'Square on the rest',
			stiff: 'too stiff',
			weak: 'too weak',
			nockLow: 'nock point too low',
			nockHigh: 'nock point too high',
			tailHigh: 'tail high',
			tailLow: 'tail low',
			tailLeft: 'tail left',
			plungerIn: 'wind button out',
			plungerOut: 'wind button in',
			springStiff: 'too stiff',
			springSoft: 'too soft',
			pressureOk: 'just right',
			forRight: 'Read for a right handed bow',
			forLeft: 'Read for a left handed bow',
			ringClimbs: 'Aim climbs on the draw',
			ringFalls: 'Aim falls on the draw',
			groupTight: 'tight and high',
			groupMiddling: 'middling',
			groupLoose: 'loose and low',
			tailRight: 'tail right'
		},
		guideHint:
			'The order a bow is set up in. Each step assumes the ones above it are already right.',
		askHand: 'Which hand do you shoot?',
		askHandHint: 'This step reads the other way round on the other bow. Asked once, then remembered.',
		hand: {
			right: 'Right handed',
			left: 'Left handed'
		},
		guideCategory: {
			measure: 'Measurements',
			setup: 'Assembly',
			presetting: 'Pre-tuning',
			arrows: 'Arrows',
			fine: 'Fine tuning'
		},
		guideCredit: 'Recurve order after Claude Cangelosi, Guide des réglages d’un arc. Wording ours.',
		startNamed: 'Start: {name}',
		needBow: 'Set a default bow to start a tuning from here.',
		applyTitle: 'Apply the adjustment',
		applyHint:
			'Change what you actually adjusted. Saving records a new bow revision and links it to this test.',
		apply: 'Save as a bow revision',
		applied: 'This test produced a bow revision.',
		viewHistory: 'View the bow history',
		steps: 'Steps',
		/** The tuning procedures by key, so a French archer reads a French name for the one they ran. */
		template: {
			'brace-height': 'Brace height',
			'bare-shaft': 'Bare shaft tuning',
			'paper-tune': 'Paper tuning',
			'walk-back': 'Walk-back tuning',
			'weight-ratio': 'Mass to draw weight'
		},
		noSettings: 'This test changes nothing the bow record holds, so it lives in the notes.',
		interpretation: 'What the result suggests',
		notes: 'Notes',
		notesHint: 'What you observed, and what you changed.',
		start: 'Start',
		noBowSelected:
			'Choose a bow in the session first, or mark one as your default bow in the equipment list so it is added to every new session.',
		forBow: 'Tuning steps for {bow}',
		// The session a tuning opens for itself, named so it reads as a tuning outing and not a shoot.
		sessionLabel: '{bow} Tuning'
	},
	equipment: {
		title: 'Equipment list',
		empty: 'No bows yet. Add one to record its settings and tuning history.',
		addBow: 'Add a bow',
		bowName: 'Name',
		nameRequired: 'A name is needed.',
		bowType: 'Type',
		makeDefault: 'Make it my default bow',
		makeDefaultHint: 'Every new session starts on it, and the equipment tab opens it.',
		tuningSteps: 'Tuning',
		overviewTab: 'Overview',
		settingsTab: 'Settings',
		default: 'Default',
		defaultTitle: 'Default bow',
		defaultHint: 'Preselected when you start a new session.',
		currentSetup: 'Current setup',
		arrowsShot: 'Arrows shot',
		arrowsShotShort: 'Arrows',
		viewList: 'View every bow',
		sessionsCount: 'Sessions',
		activitiesCount: 'Rounds',
		lastUsed: 'Last used {date}',
		historyTab: 'History',
		noChanges: 'No unsaved changes.',
		groupEmpty: 'Nothing recorded',
		remarks: 'Remarks',
		remarksHint:
			'Anything the fields above have no room for: shim thicknesses, serials, what to try next.',
		pendingChanges: '{n} unsaved changes',
		reason: 'Why did you change this?',
		saveRevision: 'Save as a new revision',
		revision: 'Revision {n}',
		initialRevision: 'First recorded setup.',
		noRevisions: 'No settings recorded yet. Fill in the settings tab and save.',
		deleteBow: 'Delete this bow'
	},
	sight: {
		title: 'Sight marks',
		empty: 'No marks yet. Add the distances you shoot.',
		distance: 'Distance',
		addMark: 'Add',
		height: 'Sight height',
		interpolatedHeight: 'Sight height, worked out',
		interpolatedHint: 'Worked out from the marks you shot in. Shoot it, then type what you found.',
		windage: 'Windage',
		clicker: 'Clicker',
		plunger: 'Plunger'
	},
	feed: {
		subtitle: 'What the archers you follow chose to share.',
		hintTitle: 'New shared activities',
		hintBody: 'Swipe left, or tap here, to read the feed.',
		hintNever: 'Stop offering this',
		/** Their best among what they shared, which is all this device can see. Never called a record. */
		bestShared: 'Best shared'
	},
	home: {
		title: 'Appchery',
		greeting: 'Ready to shoot',
		thisMonth: 'This month',
		upNext: 'Up next',
		thisYear: 'This year',
		weekGoalStat: 'Week goal',
		statNone: 'Nothing',
		pickStat: 'Show here',
		replayRings: 'Ring the target',
		seeStats: 'Statistics',
		weekSessions: '{n} sessions',
		lastSession: 'Last session',
		neverShot: 'No sessions yet.',
		recent: 'Recent sessions',
		seeAll: 'All sessions',
		moreActions: 'Other things to create',
		next: 'Next',
		resume: 'Carry on',
		thisWeek: 'This week',
		elsewhere: 'Everywhere else',
		newBest: 'New personal best'
	},
	share: {
		title: 'Share this round',
		action: 'Share',
		save: 'Save',
		saved: 'Saved to {where}.',
		saving: 'Preparing…',
		average: 'Per arrow',
		end: 'End',
		endTotal: 'E/T',
		running: 'Total',
		tagline: 'Shot with Appchery',
		options: 'What to show',
		unavailable: 'Not recorded',
		optionDate: 'Date',
		optionSessionName: 'Session name',
		optionPlace: 'Location',
		optionBow: 'Bow used',
		optionCategory: 'Kind of session',
		optionRecap: 'Arrows, tens, Xs, average',
		optionSheet: 'The scoresheet',
		optionWeather: 'Weather icon',
		optionTemperature: 'Temperature',
		optionWind: 'Wind',
		optionOpponentArrows: 'The other side’s arrows',
		optionDark: 'Dark card'
	},
	help: {
		title: 'How this works',
		sessionTerm: 'A session',
		sessionBody:
			'is **one outing**. You went somewhere, you shot, you came home. It carries the date, the bow you took, and the weather it happened in. Everything else in the app hangs off it, so a session is **the first thing you create**, even before you know what you will shoot.',
		activityTerm: 'An activity',
		activityBody:
			'is **one thing done inside a session**: a scored round, or a tuning procedure. A session can hold several. A round records **every arrow**, so a score can be corrected later; a tuning run records what you changed and writes a new revision of the bow. Arrows shot without scoring them go in the **training counter** instead, and still count towards your volume.',
		planTerm: 'A plan',
		planBody:
			'is **a week you mean to repeat**. It holds the outings you intend, on the days and at the times you intend them, with an optional arrow goal each. Plans are **templates, not history**: their sessions show up in your list for the coming week, and nothing is written until you actually shoot one. A week you skip leaves no trace.',
		bowTerm: 'A bow',
		bowBody:
			'is anything you shoot: yours, a club bow, a barebow you set up for a weekend. Give it a name you would recognise on the rack. Its **type** decides which settings the app asks for and which tuning procedures it offers, so a compound is never asked about tiller.',
		revisionTerm: 'A revision',
		revisionBody:
			'is **the settings of a bow at one point in time**, kept rather than overwritten. Change a setting and the old numbers stay readable, so a score shot last month can still be matched to the bow that shot it. A tuning activity writes a revision when you record what you changed.',
		defaultBowTerm: 'The default bow',
		defaultBowBody:
			'is the one preselected on a new session, marked on this page. It is **kept on this device** rather than synced, because which bow you reach for depends on where you are.',
		rangeTerm: 'The filters',
		rangeBody:
			'at the top of the page decide what every figure below them reads from: a period, a round, a bow, a kind of outing, a wind. They combine, so you can ask how you shoot **in the wind with one bow**. The periods are rolling, not calendar: on the second of the month you still see thirty days of work.',
		chartTerm: 'The main chart',
		chartBody:
			'counts every arrow you entered, finished round or not, and colours each bar by the **kind of outing** it came from. One measure at a time: volume, score per arrow, or rounds. Tap a bar to read that day, week or month on its own.',
		roundTerm: 'A kind of round',
		roundBody:
			'is worked out from what you shot, never from what it was called: the **distance, the face, the ends and the arrows in them**. The same twelve ends at 70m are one round type whether you picked WA 720 from the list or built it yourself.',
		bestTerm: 'A personal best',
		bestBody:
			'is the highest score of **one kind of round**, and only finished rounds count: a round you walked away from scores lower for reasons that say nothing about how you shot. Ties break on tens, then on Xs, the usual way. Pin the rounds you care about to keep them at the top.',
		consistencyTerm: 'Consistency',
		consistencyBody:
			'is the spread of your recent scores rather than their average. It is the figure worth watching once the average stops moving: **archers plateau on average long before they plateau on consistency**, and a smaller spread is a more repeatable shot.'
	},
	plans: {
		title: 'Plans',
		view: 'View training plans',
		slot: 'Planned',
		newPlan: 'New plan',
		name: 'Plan name',
		empty: 'No plans yet. A plan is a week you mean to repeat.',
		activeTitle: 'Plan active',
		activeHint:
			'Off, this plan stops filling the sessions list and stops counting towards the weekly goal.',
		paused: 'Paused',
		startDate: 'From',
		endDate: 'Until',
		datesHint: 'Between these two days, both included. Outside them the plan asks for nothing.',
		anyDate: 'Not set',
		clearDate: 'Clear this date',
		fromDate: 'From {date}',
		untilDate: 'Until {date}',
		betweenDates: '{from} to {to}',
		weekTotal: 'Arrows a week',
		freeArrows: 'Free arrows',
		freeArrowsHint: 'Owed by the week, shot in any session.',
		addSlot: 'Add a session',
		slotTitle: 'Planned session',
		slotName: 'Name',
		noSlots: 'Nothing planned on this day.',
		deletePlan: 'Delete this plan',
		confirmTitle: 'Delete this plan?',
		confirmBody: 'The sessions already shot from it are kept.',
		sessionsCount: '{n} sessions a week'
	},
	stats: {
		title: 'Statistics',
		byRoundOpen: 'Arrows by round',
		filter: {
			period: 'Period',
			rounds: 'Round',
			bows: 'Bow',
			kinds: 'Kind',
			wind: 'Wind',
			reset: 'Clear filters',
			clearOne: 'Clear this filter',
			from: 'From',
			to: 'to'
		},
		period: {
			all: 'All time',
			thisYear: 'This year',
			year: 'Last 12 months',
			month: 'Last 30 days',
			custom: 'Custom range',
			/* Fallen back on when the filter row will not fit on one line. */
			allShort: 'All time',
			thisYearShort: 'This year',
			yearShort: 'Last 12 mo.',
			monthShort: 'Last 30 d.',
			customShort: 'Custom'
		},
		metric: {
			arrows: 'Arrows',
			perArrow: 'Per arrow',
			rounds: 'Rounds'
		},
		grain: {
			day: 'Per day',
			week: 'Per week',
			month: 'Per month'
		},
		slice: '{rounds} rounds · {arrows} arrows',
		barLabel: '{arrows} arrows across {rounds} rounds',
		barRange: '{from} to {to}',
		clearBar: 'Back to the whole period',
		scaleHint: 'the more solid, the more recent',
		byKind: 'Score by kind of session',
		emptyRange: 'Nothing shot in this period.',
		empty: 'Finish a round and its scores will appear here.',
		overview: 'Overview',
		totalArrows: 'Arrows shot',
		byRound: 'By round',
		daysShot: 'Days shot',
		roundsShot: 'Rounds',
		completeRounds: '{n} finished',
		perArrow: 'Per arrow',
		noVolume: 'Nothing shot in the last year.',
		byRoundHint: 'Every arrow counts here, finished round or not.',
		perRoundTitle: 'Personal bests',
		perRoundHint: 'Only rounds shot to the end are compared.',
		personalBest: 'Personal best',
		personalBestShort: 'Pers. best',
		average: 'Average',
		trend: 'Trend per arrow',
		rounds: '{n} rounds',
		volumeKind: {
			match: 'Matches',
			tuning: 'Tuning',
			freeScore: 'Score only',
			training: 'Free arrows'
		},
		bestOn: 'Best on {date}',
		spread: 'Spread',
		distribution: 'Where the arrows landed',
		byEnd: 'Through the round',
		byEndHint: 'Average per arrow at each end, in the order they were shot.',
		byEndCount: 'Over {n} rounds.',
		byWind: 'Score by wind',
		byBow: 'Score by bow',
		byTemperature: 'Score by temperature',
		byPartOfDay: 'Score by time of day',
		byWeekday: 'Score by day of the week',
		byPlace: 'Score by place',
		distributionHint: 'Every arrow of the current filter, by the ring it landed in.',
		temperature: {
			cold: 'Cold',
			cool: 'Cool',
			mild: 'Mild',
			hot: 'Hot'
		},
		partOfDay: {
			morning: 'Morning',
			afternoon: 'Afternoon',
			evening: 'Evening',
			night: 'Night'
		},
		blocks: {
			title: 'Blocks on this page',
			hint: 'Everything below the chart is optional. Turn on what you want to look at.',
			noData: 'Nothing to show yet',
			kind: 'Score by kind of session',
			bests: 'Personal bests',
			wind: 'Score by wind',
			byEnd: 'Through the round',
			bow: 'Score by bow',
			temperature: 'Score by temperature',
			partOfDay: 'Score by time of day',
			weekday: 'Score by day of the week',
			place: 'Score by place',
			distribution: 'Where the arrows landed',
			volumeByRound: 'Arrows by round'
		},
		perArrowHint: 'Score per arrow, so rounds of different lengths compare.',
		wind: {
			calm: 'Calm',
			light: 'Light',
			moderate: 'Moderate',
			strong: 'Strong'
		},
		more: 'More',
		less: 'Less',
		favourite: 'Pin to the top',
		unfavourite: 'Unpin from the top'
	},
	auto: {
		title: 'Auto score',
		starting: 'Waking the camera up.',
		recording: 'Rec',
		open: 'Auto score',
		hint: 'Detected arrows are proposals. Tap one to drop it, then keep the rest.',
		noFace: 'Looking for the target face',
		settling: 'Looking for arrows',
		watching: 'Looking for arrows',
		angle: 'Move round towards the front of the boss',
		keep: 'Keep {n}',
		drop: 'Drop this arrow',
		tapToDrop: 'Tap an arrow to drop it.',
		tooMany: 'Only {n} arrows are left in this end. The extra ones are ignored.',
		denied: 'Camera permission is required to score from the camera.',
		experimental: 'Camera scoring is experimental. Always check the values before keeping them.'
	},
	account: {
		title: 'Account',
		hint: 'Sync is optional. Everything works without an account, and always will.',
		signedInAs: 'Signed in as {email}',
		email: 'Email',
		password: 'Password',
		signIn: 'Sign in',
		signUp: 'Create an account',
		signOut: 'Sign out',
		haveAccount: 'I already have an account',
		needAccount: 'I need an account',
		forgot: 'Forgotten password',
		resetSent: 'If that address has an account, a reset link is on its way.',
		confirmEmail: 'Check your email to confirm the address, then sign in.',
		adopted: 'Your {n} existing records now belong to this account.',
		adoptedNone: 'Signed in.',
		unclaimed: '{n} records on this device belong to no account yet.',
		someRefused: 'The server would not take {n} changes.',
		silentSince: 'Nothing has synced for {days} days.',
		pressSync: 'Sync now tries them again.',
		syncNow: 'Sync now',
		syncAutomatic: 'Syncing is automatic. This button only asks for it sooner.',
		syncing: 'Syncing…',
		lastSync: 'Last synced {at}',
		neverSynced: 'Not synced yet.',
		waiting: '{n} changes waiting for a connection.',
		signOutKeeps: 'Signing out changes nothing on this device: your shooting stays here.',
		noServer: 'This build has no sync server configured.',
		wipeSignedIn: 'Sign out before erasing this device.',
		error: {
			credentials: 'That email and password do not match an account.',
			offline: 'No connection. Try again when you have signal.',
			unknown: 'Something went wrong. Try again.'
		}
	},
	friends: {
		title: 'Social',
		signedOutTitle: 'Sign in to follow archers',
		signedOutBody: 'Following somebody, and sharing what you shot, needs an account. Everything else in the app never will.',
		claimTitle: 'Choose a handle',
		claimHint: 'A handle is how somebody finds you. Nothing before this point makes you findable, and you can stop here.',
		handlePlaceholder: 'yourname',
		handleRules: 'Three to twenty characters: letters, numbers and underscores.',
		handleTaken: 'That handle is taken.',
		claim: 'Claim this handle',
		publicTitle: 'Public profile',
		publicHint: 'Anyone can follow you and see what you share.',
		privateHint: 'You approve each follower. Only approved followers see what you share.',
		searchPlaceholder: '@handle',
		find: 'Find',
		noSuchHandle: 'No archer with that handle.',
		noSuchHandleBody: 'Handles are exact: check the spelling, or ask them to read it out.',
		tooManyLookups: 'Too many searches just now. Try again in a minute.',
		actionFailed: 'That did not go through. Nothing was changed.',
		follow: 'Follow',
		askToFollow: 'Ask to follow',
		unfollow: 'Unfollow',
		cancelRequest: 'Cancel request',
		remove: 'Remove',
		approve: 'Approve',
		refuse: 'Refuse',
		requests: 'Asked to follow you',
		followsYou: 'Follows you',
		block: 'Block',
		unblock: 'Unblock',
		blockTitle: 'Block this archer?',
		blockBody: 'They stop following you, they cannot follow you again, and your profile looks private to them. They are never told.',
		visibility: 'Who may follow you',
		publicProfile: 'Public profile',
		privateProfile: 'Private profile',
		feedTab: 'Shared',
		followingTab: 'Following',
		followersTab: 'Followers',
		anActivity: 'An activity',
		arrows: '{n} arrows',
		emptyFeedTitle: 'Nothing shared with you yet',
		emptyFeedBody: 'Follow an archer, and whatever they choose to share appears here.',
		emptyFollowingTitle: 'Not following anybody yet',
		emptyFollowingBody: 'Search a handle above to find somebody. Handles are exact, so you need the spelling.',
		emptyFollowersTitle: 'Nobody follows you yet',
		emptyFollowersBody: 'Give somebody your handle and they can find you.',
		nothingSharedTitle: 'Nothing shared',
		nothingSharedBody: 'This archer has not shared anything yet.',
		nothingVisibleBody: 'You see what they share once they approve you.',
		status: {
			pending: 'Asked',
			approved: 'Following'
		},
		cardArrows: 'Arrows',
		cardSessions: 'Outings',
		cardBadges: 'Badges',
		cardLevel: 'Level',
		cardStale: 'As of their last sync.',
		share: 'Share this activity',
		shareHint: 'Shared activities are visible to whoever your profile allows. The place, the weather and the bow never travel with it.',
		shared: 'Shared',
		unshare: 'Stop sharing'
	},
	backup: {
		title: 'Backup',
		hint: 'Your shooting is on this device, and on the sync server too once you sign in. A backup is a file of your own, that neither of them can lose.',
		export: 'Export',
		import: 'Import',
		exported: 'Exported {n} rows.',
		imported: 'Restored {n} rows.',
		confirmTitle: 'Replace everything?',
		confirmBody: 'Restoring {name} deletes every session, activity and bow on this device first.',
		confirmAction: 'Restore',
		error: {
			notJson: 'That file is not readable JSON.',
			notABackup: 'That file is not an Appchery backup.',
			tooNew: 'That backup came from a newer version of the app. Update Appchery first.'
		}
	},
	freeScore: {
		title: 'Score only',
		group: 'Scored without arrows',
		hint: 'Arrows counted and a total, with no arrow by arrow record.',
		setupHint: 'Where this was shot. The arrows and the score are entered as you go.',
		create: 'Start',
		arrows: 'Arrows shot',
		total: 'Total score',
		average: '{value} per arrow'
	},
	danger: {
		title: 'Danger zone',
		imported: 'Remove imported sessions',
		importedHint: 'Deletes every session an import wrote, and nothing you recorded here.',
		importedRemoved: 'Removed {n} imported sessions.',
		everything: 'Remove all data',
		everythingHint: 'Deletes every session, activity, bow, plan and badge on this device.',
		everythingRemoved: 'Everything was removed.',
		confirmTitle: {
			imported: 'Remove imported sessions?',
			everything: 'Remove everything?'
		},
		confirmBody: {
			imported: 'Every session written by an import goes, with its rounds and arrows. Sessions you recorded in Appchery are kept.',
			everything: 'Every session, activity, bow, plan and badge on this device goes. Export a backup first if you want any of it back.'
		},
		confirmAction: {
			imported: 'Remove imported',
			everything: 'Remove everything'
		}
	},
	importer: {
		warnings: 'Worth knowing',
		warning: {
			unreadableRow: '{n} rows could not be read and were left out.',
			undatedRow: '{n} rows carried no usable date and were left out.',
			orphanRow: '{n} rounds named a session the file does not contain, and were given one of their own.',
			droppedCoordinates: '{n} rounds had arrow positions that did not match their scores, so the positions were dropped and the scores kept.',
			unknownSheet: 'The sheet "{detail}" was not recognised and was left alone.',
			noSessionSheet: 'The file carries no session sheet, so every round was given a session of its own.'
		},
		nothingHanded: 'No file was handed over. Open an export from your files, or pick one in the settings.',
		openSettings: 'Go to settings',
		reading: 'Reading the file…',
		doneTitle: 'Imported',
		failedTitle: 'Import failed',
		title: 'Import from another app',
		hint: 'Load a CapTarget export (.xlsx). Sessions already imported are refreshed; nothing else on this device is touched.',
		choose: 'Choose an export',
		confirmTitle: 'Import this file?',
		confirmAction: 'Import',
		bow: 'Bow these sessions were shot with',
		noBow: 'Do not set a bow',
		working: 'Importing…',
		progress: '{done} of {total} sessions written.',
		workingHint: 'Writing the sessions and recounting the badges.',
		confirmBody: '{name} holds {sessions} sessions, {rounds} scored rounds and {arrows} arrows.',
		skipped: '{n} rows could not be read and will be left out.',
		imported: 'Imported {sessions} sessions and {arrows} arrows.',
		error: {
			tooLarge: 'That file is too large to read on a phone.',
			notAWorkbook: 'That file is not an .xlsx export.',
			unreadableWorkbook: 'That file could not be opened. Export it again from the other app.',
			nothingFound: 'Nothing recognisable was found in that file.'
		}
	},
	storage: {
		// Short enough for one line on a phone: Settings spells out the storage mode in full, and this
		// only has to be alarming enough to send someone there.
		volatileWarning: 'Scores will be lost on reload. Install the app to keep them.',
		volatileDismiss: 'Ignore'
	},
	settings: {
		title: 'Settings',
		appTab: 'App',
		shootingTab: 'Shooting',
		dataTab: 'Data',
		linkEquipment: 'Equipment list',
		language: 'Language',
		theme: 'Theme',
		themeLight: 'Light',
		themeDark: 'Dark',
		themeSystem: 'System',
		conditions: 'Location and weather',
		locationTitle: 'Record location',
		locationHint:
			'Starting a session records where you shot. Location permission is requested when you turn this on.',
		weatherTitle: 'Record weather',
		weatherHint:
			'Looks up the weather for that location once, at the start of the session. Needs a network connection.',
		plotting: 'Plotting arrows',
		tapWindowTitle: 'Tap or aim',
		tapWindowHint:
			'A press shorter than this drops the arrow where you touched. Longer, and the magnifier opens so you can aim before letting go.',
		tapWindowShort: 'Quicker to aim',
		tapWindowLong: 'Quicker to tap',
		driftTitle: 'Warn about an arrow that is out',
		driftHint:
			'Says so when one numbered arrow keeps landing away from the others. Needs the arrows plotted on the face and numbered, and stays quiet unless the pattern is clear.',
		hapticsTitle: 'Vibrate on a tap',
		hapticsHint: 'A short buzz when a tap counts an arrow or takes aim, like a key on a keyboard.',
		milliseconds: '{n} ms',
		display: 'Display',
		recordTitle: 'Record scoring video',
		recordHint:
			'Keeps a video of each camera scoring session on this device, to help improve detection. Nothing is uploaded.',
		recordPath:
			'Videos are saved on this device, one per end, named after the activity and end they belong to. Copy them off with a cable or the file manager.',
		detectorTitle: 'Arrow detector',
		detectorHint:
			'Which method reads the arrows. Classical uses shape and colour rules; learned uses a small trained model. Both run on this device.',
		detectorClassical: 'Classical',
		detectorLearned: 'Learned',
		feedHintTitle: 'Offer the feed on the home page',
		feedHintHint:
			'When archers you follow share something you have not read, home says so. The feed itself stays one swipe left of home either way.',
		newButtonTitle: 'Full new session button',
		newButtonHint:
			'Ends the sessions list with the wide button and its menu. Off, a round plus button sits in the corner and opens the same choices.',
		refreshTitle: 'Refresh the app',
		refreshHint: 'Loads the latest version again. Your data is untouched.',
		refreshOffline: 'No network: connect and try again.',
		refreshAction: 'Refresh',
		installTitle: 'Install Appchery',
		installHint:
			'Adds it to your home screen and runs it without the browser bars. Your scores stay where they are.',
		installAction: 'Install',
		fullscreenTitle: 'Fullscreen',
		fullscreenHint:
			'Hides the browser bars until you leave the page or reload. Installing the app does this for good.',
		noAnimationsTitle: 'Turn off animations',
		noAnimationsHint:
			'Stops the ripple when the app opens, the ring on the sessions list, and the fireworks over a record. Progress indicators keep moving.',
		competitionColourTitle: 'Competition colour',
		competitionColourHint:
			'The colour a competition wears in the sessions list and on the statistics page.',
		colour: {
			default: 'Default',
			blue: 'Blue',
			ink: 'Ink',
			red: 'Dark red'
		},
		clockTitle: '24 hour clock',
		clockHint: 'Show times as 14:30 rather than 2:30 PM.',
		placeTitle: 'Name the place',
		placeHint:
			'Looks up the nearest town. This sends your coordinates to a third party, which recording them on the device does not.',
		storage: 'Storage',
		persistent: 'Persistent',
		volatile: 'In memory, lost on reload',
		storageWhy: {
			insecure: 'This address is not a secure context, so the browser will not keep a database here. Open the app over HTTPS, or on localhost.',
			notIsolated: 'The page is not cross-origin isolated: the server is not sending the two isolation headers.',
			blocked: 'The browser is refusing to store data for this site. Check that site data is not set to be cleared or blocked for this address, then reload.',
			noOpfs: 'This browser has no private file system for the app to store a database in.',
			unknown: 'Another window of Appchery probably has the database open, or the browser is still clearing this site. Close the other windows and reload.'
		},
		linkBadges: 'Badges',
		linkShare: 'Share',
		linkTricks: 'Tips and tricks',
		about: 'About',
		version: 'Version {version}',
		build: 'build {n}',
		licence: 'Licensed under {name}',
		linkMuscles: 'Anatomy',
		forgetTitle: 'Celebrate again',
		forgetHint:
			'A level or a record is only announced once. Forget which ones were, and the next one you reach brings the fireworks back.',
		forgetAction: 'Forget what was celebrated',
		forgetResult: 'Forgotten. The next round, match or arrow counted brings the fireworks back.',
		recalcTitle: 'Recheck badges',
		recalcHint:
			'A badge is kept once earned. Recheck it against the shooting still recorded, and any badge whose rounds are gone is taken back.',
		recalcAction: 'Recheck',
		recalcResult: '{awarded} awarded, {revoked} taken back.'
	},
	muscles: {
		title: 'Anatomy',
		intro:
			'What a shot asks of the body, muscle by muscle and moment by moment. Pick the muscles an exercise trains.',
		bones: 'Bones',
		bonesHint:
			'Watch the shoulder blades. They slide in towards the spine as the draw comes back, and that sliding is the shot: no muscle drawn on a still figure can show it.',
		plateTitle: 'The back, drawn from life',
		plateAlt: 'An anatomical plate of the muscles of the back, with the trapezius intact on one side and lifted away on the other.',
		plateCaption:
			"The trapezius is whole on the left and taken off on the right, showing the rhomboids, the levator scapulae and the cuff beneath it. From Gray's Anatomy, 1918, long out of copyright.",
		phaseTitle: 'The shot',
		play: 'Play the shot',
		pause: 'Pause',
		pickAPhase: 'Pick a moment of the shot to see what it asks for.',
		working: 'Working now',
		nothingWorking: 'Nothing much: this is the moment before the work starts.',
		selection: 'Selected',
		selectionEmpty: 'Tap a muscle on the figure, or one in the list below.',
		clear: 'Clear',
		coverage: 'Covers {percent}% of what the shot asks',
		peak: 'Works hardest at the {phase}',
		deepTitle: 'Under the surface',
insetHint:
			'Both blades, with the trapezius and the deltoid lifted away. Picking a muscle picks it on both sides, the same as on the body.',
		load: { 1: 'Light', 2: 'Working', 3: 'Hardest' },
		view: { back: 'Back', front: 'Front', both: 'Both', deep: 'Deep' },
		inset: {
			scapulaBack: 'The shoulder blades, from behind',
			scapulaFront: 'Their far side, against the ribs',
		},
		role: {
			mover: 'Makes the draw happen',
			stabiliser: 'Holds the joint still',
			postural: 'Holds the archer up',
			fault: 'Should stay quiet'
		},
		roleShort: { mover: 'Mover', stabiliser: 'Stabiliser', postural: 'Postural', fault: 'Fault' },
		side: { draw: 'String arm', bow: 'Bow arm', left: "The archer's left", right: "The archer's right", },
		phase: {
			none: 'None',
			stance: 'Stance',
			set: 'Set',
			setup: 'Setup',
			draw: 'Draw',
			anchor: 'Anchor',
			transfer: 'Transfer',
			expansion: 'Expansion',
			release: 'Release',
			followThrough: 'Follow through'
		},
		name: {
			rhomboids: 'Rhomboids',
			trapeziusUpper: 'Upper trapezius',
			trapeziusMid: 'Middle trapezius',
			trapeziusLower: 'Lower trapezius',
			levatorScapulae: 'Levator scapulae',
			latissimus: 'Latissimus dorsi',
			teresMajor: 'Teres major',
			serratusAnterior: 'Serratus anterior',
			erectorSpinae: 'Erector spinae',
			deltoidPosterior: 'Rear deltoid',
			deltoidLateral: 'Side deltoid',
			deltoidAnterior: 'Front deltoid',
			supraspinatus: 'Supraspinatus',
			infraspinatus: 'Infraspinatus',
			teresMinor: 'Teres minor',
			subscapularis: 'Subscapularis',
			pectoralisMajor: 'Pectoralis major',
			biceps: 'Biceps',
			triceps: 'Triceps',
			forearmFlexors: 'Forearm flexors',
			forearmExtensors: 'Forearm extensors',
			fingerFlexors: 'Finger flexors',
			rectusAbdominis: 'Abdominals',
			obliques: 'Obliques',
			transverseAbdominis: 'Transverse abdominis',
			gluteusMaximus: 'Gluteus maximus',
			gluteusMedius: 'Gluteus medius',
			tensorFasciaeLatae: 'Tensor fasciae latae',
			iliopsoas: 'Iliopsoas',
			quadriceps: 'Quadriceps',
			hamstrings: 'Hamstrings',
			calves: 'Calves'
		}
	},
	training: {
		group: 'Training'
	},
	strength: {
		title: 'Strength',
		hint: 'Bandwork, holds and core, worked through set by set.',
		progress: 'Done so far',
		sets: 'sets',
		finished: 'Finished',
		resting: 'Rest {time}',
		upNext: 'Next: {exercise}, set {set} of {of}',
		addExercise: 'Add an exercise',
		openExercise: 'Read the whole exercise',
		worked: 'What this session worked',
		setNumber: 'Set {n}',
		secondsShort: 's',
		rowSummary: '{done} of {total} sets',
		runningElsewhere: 'Running is an activity of its own, started from the same list as this one.'
	},
	running: {
		title: 'Running',
		hint: 'A run, written down: how far, how long, and how it felt.',
		what: 'The run',
		distance: 'Distance',
		km: 'km',
		kmValue: '{km} km',
		duration: 'Time',
		minutesShort: 'min',
		secondsShort: 's',
		outOfRange: 'That is further or longer than a run the app can hold.',
		pace: 'Pace',
		perKm: 'per km',
		paceWaiting: 'Enter a distance and a time and the pace works itself out.',
		effort: 'How it felt',
		effortHint: 'The only measure of effort you always have, and the one that tells you whether tomorrow is a rest day.',
		efforts: { easy: 'Easy', steady: 'Steady', tempo: 'Tempo', hard: 'Hard', max: 'All out' },
		whatItWorks: 'What it works',
		unfinished: 'Saved as it stands. A run with only half its numbers is still a run you did.'
	},
	exercises: {
		title: 'Exercises',
		intro:
			'Strength work for the shot, each one drawn with the muscles it trains and the movement to make.',
		all: 'Everything',
		empty: 'Nothing here with that kit.',
		howTitle: 'How to do it',
		worksTitle: 'What it works',
		movementTitle: 'The movement',
		forTitle: 'What it is for',
		startTitle: 'Where to start',
		startLead: 'A starting point, not a prescription. Work up from whatever you can hold with good form.',
		sets: 'Sets',
		reps: 'Reps',
		hold: 'Hold',
		rest: 'Rest',
		distance: 'Distance',
		seconds: '{n} s',
		metres: '{n} m',
		kilometres: '{n} km',
		play: 'Play',
		pause: 'Pause',
		cautionTitle: 'Read this first',
		mainly: 'Mainly',
		also: 'Also',
		none: 'No kit',
		kit: {
			none: 'Nothing at all',
			band: 'Band',
			bow: 'Bow',
			outdoors: 'Outdoors'
		},
		measure: { reps: 'Reps', hold: 'Held', distance: 'Distance' },
		level: { beginner: 'Any archer', intermediate: 'Some training behind you', advanced: 'Trained' },
		activity: { strength: 'Strength', running: 'Running' },
		item: {
			bandPullApart: {
				name: 'Band pull apart',
				summary: 'The draw, without the bow. Everything that pulls the string back, worked at once.',
				step1: 'Stand tall and hold a light band in front of you at chest height, arms straight and hands about shoulder width apart.',
				step2: 'Pull your hands out to the sides, keeping both arms straight, until the band touches your chest.',
				step3: 'Finish by drawing the shoulder blades together. The hands are only where the movement shows: the work is between the blades.',
				step4: 'Let the band back in under control, taking twice as long to return as you took to open.'
			},
			facePull: {
				name: 'Face pull',
				summary: 'The draw elbow, taught to travel where an anchor is: high, back, and behind the head.',
				step1: 'Anchor a band above head height and take one end in each hand, arms straight out towards it.',
				step2: 'Pull the band towards your nose, leading with the elbows and letting them travel out wide and back past your ears.',
				step3: 'Hold for a moment with the shoulder blades set down and together, then return under control.',
				step4: 'Keep the shoulders down throughout. A shrug at the top hands the work to the muscle the shot wants quiet.'
			},
			proneYtw: {
				name: 'Prone Y, T and W',
				summary: 'Face down, with nothing to help. The three shapes cover the whole of the back of the shoulder.',
				step1: 'Lie face down on the floor with your forehead resting down and your arms out in front of you.',
				step2: 'Y: arms straight and out at a narrow angle, thumbs up. Lift both hands off the floor, hold for two seconds, lower.',
				step3: 'T: arms straight out to the sides. Lift, hold, lower.',
				step4: 'W: elbows bent and tucked in beside the ribs. Lift, squeeze the blades together, lower.',
				step5: 'Lift with the back rather than with the neck. Your forehead stays where it started.'
			},
			externalRotation: {
				name: 'External rotation',
				summary: 'The cuff at the back of the shoulder, which holds the joint together while everything else pulls.',
				step1: 'Stand with a light band in front of you, elbows bent to a right angle and tucked against your ribs.',
				step2: 'Keeping the elbows against your sides, rotate both forearms outwards until the band is stretched across you.',
				step3: 'Return slowly. The forearms move, nothing else does.',
				step4: 'Roll a towel under each elbow if they wander forward: the elbow staying put is what makes this the cuff rather than the back.',
				caution: 'The cuff is small and it adapts slowly. Use the lightest band that makes the last rep feel like work, and add reps before you add tension.'
			},
			scapularSetting: {
				name: 'Scapular setting',
				summary: 'Finding the muscles that hold the shot, on their own, before any load is put on them.',
				step1: 'Stand tall with your arms hanging and your shoulders relaxed.',
				step2: 'Slide both shoulder blades down and in towards your spine, without lifting the shoulders and without moving the arms.',
				step3: 'Hold, breathing normally, then release slowly.',
				step4: 'This is the position the transfer puts you in. Learning to find it here is what lets you find it at full draw.'
			},
			holdingSpt: {
				name: 'Holding SPT',
				summary:
					'Full draw, held. SPT is specific physical training: work that trains the shot by doing the shot, and this is the one that makes the last end of a round feel like the first.',
				step1: 'Nock an arrow and stand facing a target butt, so that a string slipping off tired fingers only costs you a shot. Where you cannot shoot into a butt, do it with nothing on the string at all.',
				step2: 'Go through your shot process on a bow or a stretch band until you reach the holding position.',
				step3: 'Hold there in full alignment, aiming at nothing in particular, breathing normally.',
				step4: 'Let down under control rather than releasing, then rest and repeat. As the hold gets easier, lengthen it and lengthen the rest with it.',
				step5: 'Stop the set the moment the alignment goes. A hold made with the shoulder collapsed trains the collapse.',
				caution: 'A bow loosed with nothing on the string destroys itself, and often the hand holding it. So the safest way to hold is with an arrow nocked and a butt in front of you: if the string does go, an arrow goes where an arrow is meant to go. With no butt to shoot into, hold with an empty string and let down deliberately every time. Either way, do this after shooting rather than before it.'
			},
			reversals: {
				name: 'Reversals',
				summary: 'Draw, hold, let down, repeat. The draw itself, done far more often than a session would ask.',
				step1: 'Nock an arrow and face a target butt, so that a slip at the end of a hard set costs you an arrow and nothing else. Where you cannot shoot into a butt, draw with nothing on the string.',
				step2: 'Draw the bow through your normal shot process to anchor and transfer.',
				step3: 'Hold for a couple of seconds in full alignment.',
				step4: 'Let down under control to the set up position, without dropping the bow arm.',
				step5: 'Repeat for the set, then rest properly before the next one. Every rep is a rep of your shot, so stop the set rather than finish it badly.',
				caution: 'A bow drawn and released with nothing on the string will destroy itself, and the hand holding it. An arrow nocked in front of a butt is the safest way to do these, because tired fingers let go: with an empty string there is nothing to catch that mistake, so every let down has to be deliberate.'
			},
			bowRaise: {
				name: 'Bow raise',
				summary: 'Holding the bow up, and nothing else. What tires first in a long round, trained on its own.',
				step1: 'Nock an arrow and face a target butt where you can, then raise the bow to the set up position, at about the height of your own shoulders.',
				step2: 'Hold it there with the bow arm straight and the shoulder down, breathing normally.',
				step3: 'Lower under control and rest for a minute or two.',
				step4: 'Stop when the shoulder starts to climb towards your ear. That is the end of the set, whatever the clock says.'
			},
			plank: {
				name: 'Plank',
				summary: 'The middle of the body, which is what the two ends of the shot are pulling against.',
				step1: 'Lie face down, then come up onto your forearms and toes with your elbows under your shoulders.',
				step2: 'Set a straight line from your heels to the top of your head, with the hips neither dropped nor lifted.',
				step3: 'Hold it, breathing normally rather than bracing against held breath.',
				step4: 'End the set when the line breaks. Time held out of shape is time spent teaching the shape.'
			},
			running: {
				name: 'Running',
				summary: 'The base under everything else. A round is four hours on your feet, and that is a fitness question.',
				step1: 'Run at a pace you could hold a conversation at. This is endurance work, not a time trial.',
				step2: 'Build the distance by no more than a tenth a week, and keep at least one day between runs and heavy shooting.',
				step3: 'Its place in archery is recovery between ends and a heart rate that settles on demand, not the legs themselves.'
			}
		},
		frame: {
			start: 'Start',
			open: 'Open',
			hold: 'Hold',
			top: 'Top',
			bottom: 'Bottom',
			up: 'Up',
			down: 'Down',
			draw: 'Full draw',
			letdown: 'Let down',
			stride: 'Stride',
			end: 'Finish'
		}
	},
	experience: {
		title: 'Experience',
		hint: 'Every arrow, every round, every badge, every match won.',
		levelStat: 'Level',
		level: 'Level {level}',
		levelUp: 'Level up',
		levelShort: 'Lv {level}',
		points: '{xp} XP',
		intoLevel: '{into} of {span} XP',
		toNext: '{xp} XP to level {level}',
		total: 'Experience earned',
		sources: 'Where it came from',
		empty: 'Nothing shot yet, so nothing earned yet.',
		share: '{percent}%',
		sourceNames: {
			arrows: 'Arrows',
			rounds: 'Rounds',
			badges: 'Badges',
			matches: 'Matches'
		},
		sourceCounts: {
			arrows: '{n} arrows shot',
			rounds: '{n} rounds finished',
			badges: '{n} badges earned',
			matches: '{n} matches won or drawn'
		},
		rates: 'What things are worth',
		rules: {
			arrows: {
				title: 'Arrows',
				formula: 'arrows shot × {xp} XP',
				body: 'Every arrow that counts towards your volume pays the same, whatever it was shot for: a warm up, a procedure, a match, a scored round. This is the only thing that pays no matter how it went.'
			},
			rounds: {
				title: 'Rounds shot to the end',
				formula: 'arrows × {xp} × difficulty × form',
				difficulty: 'difficulty = ({face} ÷ {metres}) ÷ (face in cm ÷ distance in m), kept between {min} and {max}',
				form: 'form = {floor} + {rest} × (your score ÷ the best possible)',
				body: 'Paid on top of the arrows, and only once the round is complete. Difficulty is the face measured against an 18m round on a 40cm face, so that round is worth 1 and a face further away for its size is worth more. Form never falls below {floor}, because a bad round is still a round shot.',
				example: 'A WA 720 at 70m scored 640: 72 × 3 × 1.28 × 0.94 = 260 XP'
			},
			badges: {
				title: 'Badges',
				formula: 'the value written on the badge, once',
				body: 'Each badge is worth its own amount, from 100 for beating the beginner bot to 2500 for a gold progression arrow. It pays the first time it is earned and never again. Lose one to the recheck in the settings data tab and its points go with it.'
			},
			matches: {
				title: 'Matches won',
				formula: '{xp} XP × stage × opponent',
				body: 'On top of the arrows the match took. Stage runs from 1 for a match outside any bracket to 2 for a final, and the opponent from 0.6 for the beginner bot to 1.5 for the professional, a person counting 1. A draw pays {draw} of it, a loss nothing, and a card kept for somebody else pays nothing at all, arrows included.'
			},
			levels: {
				title: 'Levels',
				formula: 'level n begins at {step} × (n − 1)² XP',
				body: 'Each level costs more than the one before it, and there is no last one.',
				example: 'Level 2 at 100 XP, level 10 at 8,100, level 20 at 36,100.'
			}
		},
		rateDeterministic: 'Nothing is banked: the total is worked out from the history as it stands, so deleting a session takes back exactly what it gave.'
	},
	badges: {
		title: 'Badges',
		hint: 'Earned by shooting and by the work behind it, kept once won.',
		earnedCount: '{n} of {total} earned',
		earnedOn: 'Earned {date}',
		locked: 'Not earned yet',
		progress: '{current} / {target}',
		empty: 'Nothing earned yet. Shoot something.',
		viewGrid: 'Show the grid',
		viewDetail: 'Show the rules',
		new: 'Badge earned',
		/** The progression arrows all read the same way, so their rule is written once. */
		xpWorth: '(+{xp} XP)',
		arrowHint: '36 arrows at {metres}m on a {face}cm face, {score} points',
		families: {
			volume: 'Arrows shot',
			habit: 'Habit',
			record: 'Records',
			accuracy: 'Accuracy',
			milestone: 'Firsts',
			training: 'Training',
			ffta: 'FFTA progression arrows'
		},
		list: {
			firstStrength: {
				name: 'Off the Line',
				hint: 'Finish a set of strength work.'
			},
			tenStrengthSessions: {
				name: 'Built, Not Bought',
				hint: 'Do {target} sessions of strength work.'
			},
			hundredSets: {
				name: 'A Hundred Sets',
				hint: 'Complete {target} sets in all.'
			},
			firstRun: {
				name: 'First Steps',
				hint: 'Record a run.'
			},
			fiftyKilometres: {
				name: 'Long Way Round',
				hint: 'Run 50 km in all.'
			},
			beatBeginner: {
				name: 'First Blood, Silicon',
				hint: 'Beat the beginner bot.'
			},
			beatAmateur: {
				name: 'Club Level',
				hint: 'Beat the amateur bot.'
			},
			beatAdvanced: {
				name: 'Sharp Enough',
				hint: 'Beat the advanced bot.'
			},
			beatProfessional: {
				name: 'Machine Breaker',
				hint: 'Beat the professional bot.'
			},
			firstMatchWon: {
				name: 'First Blood',
				hint: 'Win a match.'
			},
			tenMatchesWon: {
				name: 'Ten Scalps',
				hint: 'Win {matches} matches.'
			},
			comebackWin: {
				name: 'Comeback',
				hint: 'Win a match after being two sets down.'
			},
			halfMarathon: {
				name: 'Half Marathon',
				hint: '{arrows} arrows in a single outing.'
			},
			marathon: {
				name: 'Marathon',
				hint: '{arrows} arrows in a single outing.'
			},
			thousandArrows: {
				name: 'Quiver Emptier',
				hint: 'A thousand arrows shot.'
			},
			fiveThousandArrows: {
				name: "Fletcher's Best Customer",
				hint: 'Five thousand arrows shot.'
			},
			tenThousandArrows: {
				name: "The Boss's Nightmare",
				hint: 'Ten thousand arrows shot.'
			},
			twentyFiveThousandArrows: {
				name: 'Bow Arm of Steel',
				hint: 'Twenty five thousand arrows shot.'
			},
			threeDaysRunning: {
				name: 'Three Days Running',
				hint: 'Shot three days back to back.'
			},
			fourSeasons: {
				name: 'Four Seasons',
				hint: 'Shot in twelve months running.'
			},
			groundhogDay: {
				name: 'Groundhog Day',
				hint: 'Shot the same round {rounds} times.'
			},
			sevenDays: {
				name: 'Regular Offender',
				hint: 'Shot on seven different days.'
			},
			thirtyDays: {
				name: 'Creature of Habit',
				hint: 'Shot on thirty different days.'
			},
			hundredDays: {
				name: 'Part of the Furniture',
				hint: 'Shot on a hundred different days.'
			},
			everyWeek: {
				name: 'Never Missed a Tuesday',
				hint: 'Shot in eight weeks running.'
			},
			onPlan: {
				name: 'Sticks to the Plan',
				hint: "Hit your plan's weekly arrows four weeks running."
			},
			threeRecords: {
				name: 'Show Off',
				hint: 'Set a personal best in three different rounds.'
			},
			firstXAt70: {
				name: 'X Marks the Spot',
				hint: 'An X in a finished WA round at 70m.'
			},
			thirtyAt18: {
				name: 'Three of a Kind',
				hint: 'An end of 30 in a finished WA indoor round at 18m.'
			},
			goldenEnd: {
				name: 'All That Glitters',
				hint: 'A whole end of six arrows in the gold, in a finished round.'
			},
			handfulOfArrows: {
				name: 'A Handful of Arrows',
				hint: 'An end of {arrows} plotted arrows the gold would cover, in a finished round.'
			},
			iSeeRed: {
				name: 'I See Red',
				hint: 'Finished a round with no arrow below {value}.'
			},
			tourist: { name: 'Tourist', hint: 'Shot at five different places.' },
			frostbite: {
				name: 'Frostbite',
				hint: 'Finished a round at {metres}m or more below {temp} °C.'
			},
			firstCompetition: {
				name: 'Nerves of Steel',
				hint: 'Finished a round at a competition.'
			},
			twoBowTypes: {
				name: 'Two Timer',
				hint: 'Scored a round with two different kinds of bow.'
			},
			seventyMetres: {
				name: 'The Long Walk',
				hint: 'Finished a round at 70m or further.'
			},
			ninetyMetres: {
				name: 'Bring a Packed Lunch',
				hint: 'Finished a round at 90m or further.'
			},
			firstTuning: {
				name: 'Never Leave It Alone',
				hint: 'Carried out a tuning procedure.'
			},
			fiveSightMarks: {
				name: 'Sight Whisperer',
				hint: 'Recorded five sight marks on one bow.'
			},
			stormArcher: {
				name: 'Weather Warning',
				hint: 'Finished a round at {metres}m or more in a wind of {kmh} km/h or more.'
			},
			fftaWhite: { name: 'White Arrow' },
			fftaBlack: { name: 'Black Arrow' },
			fftaBlue: { name: 'Blue Arrow' },
			fftaRed: { name: 'Red Arrow' },
			fftaYellow: { name: 'Yellow Arrow' },
			fftaBronzeRecurve: { name: 'Bronze Arrow Recurve' },
			fftaSilverRecurve: { name: 'Silver Arrow Recurve' },
			fftaGoldRecurve: { name: 'Gold Arrow Recurve' },
			fftaBronzeCompound: { name: 'Bronze Arrow Compound' },
			fftaSilverCompound: { name: 'Silver Arrow Compound' },
			fftaGoldCompound: { name: 'Gold Arrow Compound' }
		}
	},
	// The landing page on appchery.com, which is a separate build: see site/ and vite.site.config.ts.
	site: {
		open: 'Open the app',
		openLong: 'Open Appchery',
		hero: {
			title: 'Everything you did on the shooting line, in one place.',
			body: 'Score a round, tune a bow, count the arrows nobody counts, train for the shot. Appchery keeps the whole outing on your own device and works with no signal at all.',
			session: 'An outing as the app records it',
			free: 'Free, open source, no account needed',
			offline: 'Works offline'
		},
		plot: {
			title: 'Score by pointing at the target',
			body: 'Tap where the arrow landed and the ring is read off the same geometry the app draws the face with, so what you see and what you score cannot disagree. Type the values instead if that is faster, and the card adds up either way.',
			note: 'Group size, spread and centre, worked out end by end.',
			arrows: 'Arrows',
			score: 'Scored',
			spread: 'Spread'
		},
		camera: {
			title: 'Let the camera read the face',
			body: 'Point the phone at the target and the arrows are found for you. As quick as reading the scores out and typing them, quicker than placing six arrows by hand, and you still get what placing them gives you: where every arrow landed, and the group that comes out of it.',
			note: 'Nothing is uploaded: the detection runs on the phone.'
		},
		stats: {
			title: 'Numbers that answer a question',
			body: 'How a round has gone over a season, which zones the arrows really fall in, and how much the wind costs you per arrow. Filter by bow, by distance, by kind of outing, and the whole page answers for that slice alone.',
			note: 'Compare anything against anything: this bow against that one, indoors against out, this season against last.'
		},
		training: {
			title: 'Train the muscles the shot uses',
			body: 'A library of exercises, each one drawn as a figure that moves and mapped onto the muscles it works. The map is the same one the shot itself is drawn on, so you can see what an exercise trains and when in the shot it is used.',
			note: 'Bands, bow, or nothing at all.'
		},
		badges: {
			title: 'Something to shoot for',
			body: 'The federal progression arrows are tracked from your scorecards, and the milestones count the arrows, the distances and the weather you were willing to stand in. An unearned one still says what it wants and how far along you are.',
		},
		private: {
			title: 'You control the data',
			body: 'Everything is written to your own device first, and the app works whether or not it ever leaves. Sync is free and entirely optional: turn it on and your outings follow you to your other phone and to the archers you choose to share them with, turn it off and they stay where they were recorded.',
			note: 'No advertising, no tracking, nothing to pay.',
			sync: 'Optional sync'
		},
		cta: {
			title: 'Take it to the field.',
			body: 'It opens in the browser and installs to the home screen from there. Nothing to sign up for.'
		},
		footer: {
			licence: 'Free software under the AGPL.',
			language: 'Language'
		},
		// The sample outing drawn in the phone frames, which is made up rather than anybody's real scores.
		sample: {
			round: 'WA 720 · 70m',
			end: 'End 4 of 12',
			place: 'Club field',
			when: 'Tuesday, 18:30',
			average: 'Rolling average'
		}
	}
};
