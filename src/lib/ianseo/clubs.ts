/**
 * How a club is named on screen.
 *
 * Every source files a club under a number or a code and prints both: `0702022 - JUSSY` in France,
 * `KOSH - Kohav Hasharon Archers` at an international event. The number is how the federation finds
 * the club, not how anybody says its name, and a column of them is a column of noise. So the name
 * alone is shown, and the whole of it is there for anybody who wants it.
 */

/** A federation's own reference: digits, or a short code with no spaces in it. */
const IDENTIFIER = /^\s*([0-9]{2,}|[A-Za-z0-9]{2,6})\s+-\s+(.+)$/;

export function clubName(value: string, full = false): string {
	if (full) return value;
	const split = value.match(IDENTIFIER);
	// Only where something is left: a club recorded as nothing but its number keeps its number.
	return split && split[2].trim() ? split[2].trim() : value;
}
