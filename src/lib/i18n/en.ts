// The reference dictionary: other locales are typed against it so a missing key fails the build.
export const en = {
	app: {
		name: 'Appchery',
		tagline: 'Track your shooting. Tune your bow.'
	},
	nav: {
		sessions: 'Sessions',
		equipment: 'Equipment',
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
		optional: 'optional'
	},
	sessions: {
		title: 'Sessions',
		empty: 'No sessions yet. Start one, then add activities to it.',
		new: 'New session',
		open: 'Open session',
		finish: 'Finish session',
		untitled: 'Session',
		activityCount: '{n} activities',
		oneActivity: '1 activity',
		practice: 'Practice',
		competition: 'Competition',
		qualification: 'Qualification'
	},
	session: {
		bow: 'Bow',
		noBow: 'Not set',
		genericBow: 'Generic bow type',
		myBows: 'My bows',
		conditions: 'Conditions',
		location: 'Location',
		fetchConditions: 'Fetch location and weather',
		fetching: 'Fetching…',
		locationDenied: 'Location permission is required to fetch conditions.',
		weatherFailed: 'Could not fetch the weather. Location was still recorded.',
		activities: 'Activities',
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
	round: {
		arrows: '{n} arrows',
		endsOf: '{ends} ends of {arrows}',
		face: '{size}cm face',
		unmarked: 'Unmarked',
		max: 'Max {n}',
		custom: 'Custom round',
		customHint: 'Enter the round you are actually shooting.',
		ends: 'Ends',
		arrowsPerEnd: 'Arrows per end',
		faceSize: 'Face diameter (cm)',
		distance: 'Distance',
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
		finishActivity: 'Finish activity',
		tens: '10s',
		xs: 'Xs',
		average: 'Average per arrow',
		tapToScore: 'Tap a value for each arrow.',
		editArrow: 'Edit arrow {n} of end {end}',
		roundComplete: 'Round complete.'
	},
	tuning: {
		title: 'Tuning',
		steps: 'Steps',
		interpretation: 'What the result suggests',
		observation: 'What you observed',
		adjustment: 'What you changed',
		start: 'Start',
		noBowSelected: 'Choose a bow in the session first.',
		forBow: 'Tuning steps for {bow}'
	},
	equipment: {
		title: 'Equipment',
		empty: 'No bows yet. Add one to record its settings and tuning history.',
		addBow: 'Add a bow',
		bowName: 'Name',
		bowType: 'Type',
		tuningSteps: 'Tuning steps'
	},
	storage: {
		volatileWarning:
			'Storage is not persistent in this browser. Scores will be lost on reload: install the app for reliable storage.'
	},
	settings: {
		title: 'Settings',
		language: 'Language',
		theme: 'Theme',
		themeLight: 'Light',
		themeDark: 'Dark',
		themeSystem: 'System',
		conditions: 'Location and weather',
		conditionsHint:
			'When enabled, starting a session records where you shot and the weather at the time. Location permission is required.',
		conditionsEnable: 'Fetch automatically for new sessions',
		storage: 'Storage',
		persistent: 'Persistent',
		volatile: 'In memory, lost on reload'
	}
};
