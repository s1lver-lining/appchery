/**
 * The days a competition runs, written in the app's own language.
 *
 * Every source prints them in its own: ianseo writes `25-28 Aug` whatever country it is serving, and
 * Inscript'Arc writes `du 26/08/2026 au 29/08/2026`. Both are parsed to a span on the way in, so the
 * app can say it the way the archer reads every other date in it, and fall back to the source's own
 * words only where nothing could be parsed.
 *
 * The range is formatted by Intl rather than by hand. Saying the month once is not a matter of
 * dropping it from the first date: English puts it in front and French behind, so `Aug 25 – 28` and
 * `25 – 28 août` are the same rule and only one library knows both.
 */

export type Span = { from: number | null; to: number | null; dates: string };

export function competitionDates(locale: string, span: Span, now = Date.now()): string {
	const { from, to } = span;
	if (from === null && to === null) return span.dates;

	const one = from ?? to!;
	const other = to ?? from!;

	// The year is only worth the room when it is not this one, which is how a calendar reads.
	const year = new Date(now).getFullYear();
	const shows =
		new Date(one).getFullYear() !== year || new Date(other).getFullYear() !== year;
	const options: Intl.DateTimeFormatOptions = {
		day: 'numeric',
		month: 'short',
		...(shows ? { year: 'numeric' } : {})
	};

	let format: Intl.DateTimeFormat;
	try {
		format = new Intl.DateTimeFormat(locale, options);
	} catch {
		return span.dates;
	}

	if (one === other) return format.format(one);
	try {
		return format.formatRange(one, other);
	} catch {
		// An engine without formatRange, which is worth a plainer answer rather than none.
		return `${format.format(one)} – ${format.format(other)}`;
	}
}
