import { derived, writable } from 'svelte/store';
import { locale } from './i18n';
import { EMPTY_FILTER, parseFilter, type StatsFilter } from './domain/statsFilter';

const DEFAULT_BOW_KEY = 'appchery.defaultBowId';

function flag(key: string, initial = false) {
	// An absent key means the preference was never set, which is not the same as it being off.
	const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
	const store = writable<boolean>(saved === null ? initial : saved === 'true');
	store.subscribe((value) => {
		if (typeof window !== 'undefined') window.localStorage.setItem(key, String(value));
	});
	return store;
}

/** Clock format is a display preference, so stored timestamps never change with it. */
export const use24Hour = flag('appchery.use24Hour', true);

/**
 * Dates follow the language chosen in the app, not the one the browser happens to be set to. An
 * English speaking archer on a French phone was reading "lundi" in an otherwise English interface.
 */
export const dateFormats = derived([locale, use24Hour], ([$locale, $use24]) => {
	const clock: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: !$use24 };
	const on = (options: Intl.DateTimeFormatOptions) => {
		const formatter = new Intl.DateTimeFormat($locale, options);
		return (value: number) => formatter.format(value);
	};

	return {
		/**
		 * Spelled out rather than using dateStyle: Intl rejects dateStyle combined with hour and
		 * minute, and the combination throws only when a date is actually formatted.
		 */
		dateTime: on({ day: 'numeric', month: 'short', year: 'numeric', ...clock }),
		/** The weekday matters in a list: a Sunday reads differently from a Tuesday. */
		dayDateTime: on({
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			...clock
		}),
		time: on(clock),
		date: on({ dateStyle: 'medium' }),
		shortDate: on({ day: 'numeric', month: 'short' }),
		weekdayShort: on({ weekday: 'short' }),
		weekdayNarrow: on({ weekday: 'narrow' }),
		monthNarrow: on({ month: 'narrow' }),
		monthYear: on({ month: 'long', year: 'numeric' })
	};
});

export const formatDateTime = derived(dateFormats, ($f) => $f.dateTime);
export const formatDayDateTime = derived(dateFormats, ($f) => $f.dayDateTime);
export const formatTime = derived(dateFormats, ($f) => $f.time);

/**
 * Off by default: an archer checking the sheet against the target reads the arrows in the order they
 * were called, not sorted. Turning it on shows the paper scoresheet order instead.
 */
export const sortArrowsDescending = flag('appchery.sortArrows', false);

/**
 * Whether each arrow on the sheet carries the position it was entered in. Off by default: the number
 * is noise while the sheet reads in shooting order, and the point of it is to keep that order legible
 * once the arrows are sorted highest first.
 */
export const showArrowNumbers = flag('appchery.showArrowNumbers', false);

/**
 * Keeps the video of each camera scoring session. Off by default: it is a debugging aid for improving
 * detection, not something an archer needs, and video is large. Recordings never leave the device.
 */
export const recordCameraVideo = flag('appchery.recordCameraVideo', false);

/**
 * Which arrow detector the camera uses: the hand written one or the learned one. Classical is the
 * default because it is the one that has been measured on more than one dataset. Both stay available,
 * because a detector that is better on average can still be worse on a particular boss.
 */
export const arrowDetector = storedString('appchery.arrowDetector');

/**
 * The round cards left open on the stats page. A view preference rather than user data, so it stays
 * on the device that was scrolled rather than following the archer around.
 */
export const expandedRounds = storedList('appchery.expandedRounds');

function storedList(key: string) {
	const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
	let initial: string[] = [];
	// A hand edited or half written value must not take the page down with it.
	try {
		const parsed = saved ? JSON.parse(saved) : [];
		if (Array.isArray(parsed)) initial = parsed.filter((item) => typeof item === 'string');
	} catch {
		initial = [];
	}

	const store = writable<string[]>(initial);
	store.subscribe((value) => {
		if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
	});
	return store;
}

/** A number kept on the device, with a sane value when nothing was ever chosen or the store is junk. */
function storedNumber(key: string, initial: number) {
	const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
	const parsed = Number(saved);
	const store = writable<number>(saved !== null && Number.isFinite(parsed) ? parsed : initial);
	store.subscribe((value) => {
		if (typeof window !== 'undefined') window.localStorage.setItem(key, String(value));
	});
	return store;
}

function storedString(key: string) {
	const store = writable<string | null>(
		typeof window === 'undefined' ? null : window.localStorage.getItem(key)
	);
	store.subscribe((value) => {
		if (typeof window === 'undefined') return;
		if (value) window.localStorage.setItem(key, value);
		else window.localStorage.removeItem(key);
	});
	return store;
}

/**
 * The record already celebrated on the home page, by the activity that holds it. Dismissing one is
 * saying "I know", so the next record has to be a different activity before the card comes back.
 */
export const dismissedBest = storedString('appchery.dismissedBest');

/**
 * Records already celebrated, by the activity that holds them. A record is a moment, so reopening
 * the round that set it must not set the sky alight a second time.
 */
export const celebratedBests = storedList('appchery.celebratedBests');

/**
 * The level the archer has already been told they reached. Experience is never stored, so this is
 * the only way to tell a level climbed just now from one climbed months ago: zero means the app has
 * never looked, which is what stops an archer who is already level twelve being congratulated for it
 * the first time this runs.
 */
export const celebratedLevel = storedNumber('appchery.celebratedLevel', 0);

/**
 * Whether the badges page lists badges with their rules rather than showing the grid of icons. The
 * grid is the default: a wall of badges is the point of them, and the detail is one tap away.
 */
export const badgeDetailView = flag('appchery.badgeDetailView', false);

/**
 * What the two figures in the home header count. A device preference: which numbers an archer wants
 * in front of them depends on how they train, not on the data itself.
 */
export const homeStatPrimary = storedString('appchery.homeStatPrimary');
export const homeStatSecondary = storedString('appchery.homeStatSecondary');

/**
 * How long a press on the target face may last and still count as a tap. Above it the press is an
 * aim: the magnifier appears and the arrow follows the finger. Archers differ on this more than any
 * other timing in the app, so it is theirs to set.
 */
export const plotTapMs = storedNumber('appchery.plotTapMs', 200);

/** Which half of the sessions page was last read, list or calendar, kept across app restarts. */
export const sessionsTab = storedString('appchery.sessionsTab');

/**
 * Whether the sessions list measures each week against what the plans ask of it. Off by default:
 * an archer without a plan has nothing to measure against, and the pill should stay a plain count.
 */
export const showWeekGoal = flag('appchery.showWeekGoal', false);

/**
 * Whether the sessions list ends in the full width new session bar rather than a round plus button.
 * Off by default: the bar takes a strip of every screen for something tapped once an outing, and the
 * round button opens the same choices.
 */
export const fullNewSessionButton = flag('appchery.fullNewSessionButton', false);

/**
 * What the share card shows, by option name. Held per device: it is how this archer likes their
 * rounds to go out, and it should not have to be set again for every round.
 */
export const shareCardOptions = storedList('appchery.shareCardOptions');

/** Set once the card has been opened, so an empty option list reads as "off" rather than "unset". */
export const shareCardChosen = flag('appchery.shareCardChosen', false);

/**
 * Which optional sight mark columns are on. A view preference: an archer who records windage wants
 * that column on every bow, and one who does not should never see it.
 */
export const sightColumns = storedList('appchery.sightColumns');

/**
 * How the statistics page was last narrowed, so it opens where it was left. An archer who cares
 * about this month with the wooden bow cares every time.
 */
export const statsFilter = storedFilter('appchery.statsFilter', 'appchery.statsRange');

/**
 * Which optional blocks the statistics page draws. A key is absent until it is switched, so each
 * block keeps its own default: adding a block later must not turn it on for everyone who ever
 * opened the dialog.
 */
export const statsBlocks = storedFlags('appchery.statsBlocks');

function storedFlags(key: string) {
	const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
	let initial: Record<string, boolean> = {};
	// A hand edited or half written value must not take the page down with it.
	try {
		const parsed = saved ? JSON.parse(saved) : {};
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			initial = Object.fromEntries(
				Object.entries(parsed).filter(([, value]) => typeof value === 'boolean')
			) as Record<string, boolean>;
		}
	} catch {
		initial = {};
	}

	const store = writable<Record<string, boolean>>(initial);
	store.subscribe((value) => {
		if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
	});
	return store;
}

function storedFilter(key: string, legacyKey: string) {
	const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
	const store = writable<StatsFilter>(saved ? parseFilter(saved) : legacy(legacyKey));
	store.subscribe((value) => {
		if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
	});
	return store;
}

/** The old page stored a bare window name: it becomes the period, so nobody loses their setting. */
function legacy(key: string): StatsFilter {
	const range = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
	return range === 'year' || range === 'month' ? { ...EMPTY_FILTER, period: range } : EMPTY_FILTER;
}

/**
 * Whether the shooting clock sounds its signals. On by default: a timer nobody can hear while their
 * back is turned to the phone is a timer that has to be watched, which is the thing it is there to
 * save. Sound is unlocked by the first tap on the page, as every browser insists.
 */
export const timerSound = flag('appchery.timerSound', true);

/**
 * Whether the sheet says so when one numbered arrow keeps landing away from the others. On by
 * default: a shaft that is out is worth knowing about, and the reading is deliberately hard to
 * trigger. It is one of the tricks the app lists, in src/lib/i18n/tricks.en.ts.
 */
export const arrowDriftWarning = flag('appchery.arrowDriftWarning', true);

/** Rounds where the archer has answered that warning, so it stays answered on the way back in. */
export const arrowDriftIgnored = storedList('appchery.arrowDriftIgnored');

/**
 * Whether a tap that records something buzzes. On by default: counting arrows is done without
 * looking at the phone, and the buzz is what says the tap landed.
 */
export const haptics = flag('appchery.haptics', true);

/** The shooting time last chosen, so the clock opens on the one this archer keeps using. */
export const timerPreset = storedString('appchery.timerPreset');

/**
 * Times changed by hand, by preset name. Kept apart from the rules rather than replacing them: a
 * club that shoots three minute ends still wants the World Archery times to be what it starts from,
 * and an emptied field falls back to them rather than to zero.
 */
export const timerTimes = storedNumbers('appchery.timerTimes');

/**
 * The pause between the two blasts that call the line up and the one that starts the shooting. Ten
 * seconds is what World Archery gives an archer to reach the line and stand still on it, and it is
 * settable because a club line takes as long as a club line takes.
 */
export const timerPrepSeconds = storedNumber('appchery.timerPrepSeconds', 10);

/**
 * How loud the whistle is, as a share of full scale. Well under it by default: the phone is a metre
 * from the archer's ear on a quiet indoor line, not a referee's stand across a field.
 */
export const timerVolume = storedNumber('appchery.timerVolume', 0.18);

function storedNumbers(key: string) {
	const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
	let initial: Record<string, number> = {};
	// A hand edited or half written value must not take the page down with it.
	try {
		const parsed = saved ? JSON.parse(saved) : {};
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			initial = Object.fromEntries(
				Object.entries(parsed).filter(
					([, value]) => typeof value === 'number' && Number.isFinite(value) && value > 0
				)
			) as Record<string, number>;
		}
	} catch {
		initial = {};
	}

	const store = writable<Record<string, number>>(initial);
	store.subscribe((value) => {
		if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
	});
	return store;
}

/**
 * Whether everything that moves on its own is stopped: the ripple when the app opens, the ring on
 * the sessions list, the fireworks over a record. Off by default, and turning it on is a choice
 * about the app rather than about the device, which is why it is not read from the system setting.
 * Progress indicators are left alone: a spinner that has stopped reads as a hang.
 */
export const noAnimations = flag('appchery.noAnimations', false);

if (typeof document !== 'undefined') {
	noAnimations.subscribe((value) => document.documentElement.classList.toggle('no-motion', value));
}

/**
 * How the last match was set up: the face and its size, the distance, and how it was won. A club
 * shoots the same match over and over, so the second one should ask for nothing the first answered.
 * Held per device rather than on the match, which keeps its own copy of all of this.
 */
export const matchFaceSize = storedNumber('appchery.matchFaceSize', 122);
export const matchDistance = storedNumber('appchery.matchDistance', 70);
export const matchDistanceUnit = storedString('appchery.matchDistanceUnit');
export const matchScoreSet = storedString('appchery.matchScoreSet');
export const matchSystem = storedString('appchery.matchSystem');

/**
 * The colour a competition wears, or null for the one the theme picks. Its own short palette rather
 * than the target face colours: those are set by the rules, and gold and white are unreadable on the
 * surface whichever theme is on. Written
 * onto the root as the kind's own variable, so the sessions list and the statistics page move
 * together: one kind of outing has one colour wherever it is drawn.
 */
export const COMPETITION_COLOURS = ['blue', 'ink', 'red'] as const;
export const competitionColour = storedString('appchery.competitionColour');

if (typeof document !== 'undefined') {
	competitionColour.subscribe((value) => {
		const root = document.documentElement.style;
		if (value && (COMPETITION_COLOURS as readonly string[]).includes(value))
			root.setProperty('--c-kind-competition', `var(--c-comp-${value})`);
		else root.removeProperty('--c-kind-competition');
	});
}

/**
 * The bow preselected on a new session. A device preference rather than user data, since which bow
 * you reach for depends on where you are, so it is deliberately not synced.
 */
export const defaultBowId = storedString(DEFAULT_BOW_KEY);

/**
 * Which hand the tuning guide is read for, once the archer has said. The bow's own setting comes
 * first when it has one; this is the answer for a reader with no bow on record yet, and it is
 * asked once rather than guessed, since half the guide reads backwards for the wrong hand.
 */
export const bowHand = storedString('appchery.bowHand');
