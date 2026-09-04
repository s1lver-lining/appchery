/**
 * The questions, in the order they are read.
 *
 * A list of keys rather than the text itself: the answers live in the dictionaries with everything
 * else the page says, and only the order is decided here. Cost and account come first because they
 * are what somebody deciding whether to open the app is really asking.
 */
export const QUESTIONS = [
	'cost',
	'account',
	'offline',
	'data',
	'camera',
	'tracking',
	'install',
	'devices',
	'official',
	'backup',
	'source'
] as const;
