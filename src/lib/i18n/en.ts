/**
 * The reference dictionary. Every other locale is type-checked against this
 * shape, so adding a key here breaks the build until each locale supplies it.
 */
export const en = {
	app: {
		name: 'Appchery',
		tagline: 'Track your shooting. Tune your bow.'
	},
	nav: {
		sessions: 'Sessions',
		equipment: 'Equipment',
		tuning: 'Tuning',
		stats: 'Stats',
		settings: 'Settings'
	},
	common: {
		start: 'Start',
		cancel: 'Cancel',
		save: 'Save',
		delete: 'Delete',
		back: 'Back',
		undo: 'Undo',
		done: 'Done',
		loading: 'Loading…',
		none: 'None yet'
	},
	sessions: {
		title: 'Sessions',
		empty: 'No sessions yet. Start one to begin scoring.',
		new: 'New session',
		chooseRound: 'Choose a round',
		inProgress: 'In progress',
		complete: 'Complete',
		abandoned: 'Abandoned',
		practice: 'Practice',
		competition: 'Competition',
		qualification: 'Qualification'
	},
	round: {
		arrows: '{n} arrows',
		endsOf: '{ends} ends of {arrows}',
		face: '{size}cm face',
		unmarked: 'Unmarked',
		max: 'Max {n}'
	},
	score: {
		end: 'End {n}',
		endOf: 'End {n} of {total}',
		arrowOf: 'Arrow {n} of {total}',
		endTotal: 'End total',
		runningTotal: 'Running total',
		miss: 'M',
		confirmEnd: 'Confirm end',
		finishSession: 'Finish session',
		tens: '10s',
		xs: 'Xs',
		average: 'Average per arrow',
		tapToScore: 'Tap a value for each arrow'
	},
	storage: {
		volatileWarning:
			'Storage is not persistent in this browser — scores will be lost on reload. Install the app for reliable storage.'
	},
	settings: {
		title: 'Settings',
		language: 'Language',
		storage: 'Storage',
		about: 'About'
	}
};
