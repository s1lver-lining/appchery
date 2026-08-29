/**
 * The panels a competition publishes its documents under, in the archer's own language.
 *
 * These are ianseo's words rather than the organiser's: whoever runs the competition types the name
 * of each document, but the panel it sits in comes from ianseo itself and is written in English
 * whatever the country. Across 1,926 documents there are thirteen of them, which is a small enough
 * vocabulary to translate and a closed enough one to keep translated.
 *
 * A panel nobody here has seen is left exactly as ianseo published it, because a wrong translation
 * of a heading is worse than an English one: the archer can at least match English to the website.
 */
const NAMED: Record<string, string> = {
	'individual': 'individual',
	'team': 'team',
	'entry list': 'entryList',
	'information': 'information',
	'qualification round': 'qualification',
	'statistics': 'statistics',
	'links': 'links',
	'final round - brackets': 'brackets',
	'final round - ranking': 'finalRanking',
	'result class': 'resultClass',
	'medals': 'medals',
	'complete results book': 'resultsBook',
	'round robin': 'roundRobin'
};

/** The i18n name of a panel, or null where ianseo has published one the app has never seen. */
export function groupKey(group: string): string | null {
	return NAMED[group.toLowerCase().replace(/\s+/g, ' ').trim()] ?? null;
}
