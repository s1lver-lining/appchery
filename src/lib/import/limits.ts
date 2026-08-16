/**
 * What an export is allowed to be, see doc/dev_guidelines.md on scoring data.
 *
 * A CapTarget file is written by software nobody here controls and handed over by whoever is
 * holding the phone, so it is untrusted input in the ordinary sense: it can be malformed by
 * accident, or built on purpose to be a zip bomb, a cell claiming a million rows, or a single
 * arrow list long enough to fill the database. None of that can be allowed to take the app down,
 * and none of it is a shape real shooting has, so every stage of the reader stops at a bound.
 *
 * The numbers are far above any archer's real history and far below what hurts a phone.
 */
export const LIMITS = {
	/** The file itself, before anything is unzipped. */
	fileBytes: 32 * 1024 * 1024,
	/** One unzipped part, which is where a zip bomb shows up. */
	partBytes: 64 * 1024 * 1024,
	/** All parts together. */
	totalBytes: 128 * 1024 * 1024,
	sheets: 32,
	rowsPerSheet: 50_000,
	columnsPerRow: 256,
	cellChars: 100_000,
	sessions: 20_000,
	activitiesPerSession: 200,
	arrowsPerActivity: 5_000,
	/** Anything that becomes a row id, a name or a note. */
	idChars: 128,
	textChars: 2_000,
	/** Nothing an archer shot: the ceilings that keep a stored figure sane. */
	arrows: 100_000,
	score: 1_000_000
};

/** Trims and bounds a string that came out of the file before it is stored or shown. */
export function safeText(value: string | null | undefined, max = LIMITS.textChars): string {
	if (!value) return '';
	// Control characters are stripped rather than escaped: nothing in an export needs them, and they
	// make a note unreadable in ways that look like corruption.
	const cleaned = value.replace(/\p{Cc}/gu, '').trim();
	return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

/** A whole number inside a range, or the fallback: an out of range figure is not a small mistake. */
export function safeCount(value: number | null, max: number, fallback = 0): number {
	if (value === null || !Number.isFinite(value)) return fallback;
	return Math.min(Math.max(0, Math.round(value)), max);
}
