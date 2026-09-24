/**
 * What the settings page holds, listed so it can be searched.
 *
 * Kept beside the page rather than read out of it: a setting is looked for by what it does, and the
 * markup of a switch says nothing about that. The key names both the anchor on the page and the
 * `?setting=` that scrolls to it, so a result found here leads straight to the control itself.
 */

import { fold, matchesQuery } from './domain/search';

export type SettingsTab = 'app' | 'shooting' | 'data';

export interface SettingEntry {
	/** Names the anchor, `setting-<key>`, and the `?setting=` the search page sends the archer to. */
	key: string;
	tab: SettingsTab;
	/** Dictionary keys, so the search runs in whatever language the app is being read in. */
	title: string;
	hint?: string;
	/** The heading it sits under, shown beside a result so two like names are told apart. */
	section: string;
}

export const SETTINGS: SettingEntry[] = [
	{ key: 'about', tab: 'app', title: 'settings.about', section: 'settings.appTab' },
	{ key: 'language', tab: 'app', title: 'settings.language', section: 'settings.appTab' },
	{ key: 'theme', tab: 'app', title: 'settings.theme', section: 'settings.appTab' },
	{
		key: 'refresh',
		tab: 'app',
		title: 'settings.refreshTitle',
		hint: 'settings.refreshHint',
		section: 'settings.display'
	},
	{
		key: 'install',
		tab: 'app',
		title: 'settings.installTitle',
		hint: 'settings.installHint',
		section: 'settings.display'
	},
	{
		key: 'fullscreen',
		tab: 'app',
		title: 'settings.fullscreenTitle',
		hint: 'settings.fullscreenHint',
		section: 'settings.display'
	},
	{
		key: 'clock',
		tab: 'app',
		title: 'settings.clockTitle',
		hint: 'settings.clockHint',
		section: 'settings.display'
	},
	{
		key: 'newButton',
		tab: 'app',
		title: 'settings.newButtonTitle',
		hint: 'settings.newButtonHint',
		section: 'settings.display'
	},
	{
		key: 'feedHint',
		tab: 'app',
		title: 'settings.feedHintTitle',
		hint: 'settings.feedHintHint',
		section: 'settings.display'
	},
	{
		key: 'noAnimations',
		tab: 'app',
		title: 'settings.noAnimationsTitle',
		hint: 'settings.noAnimationsHint',
		section: 'settings.display'
	},
	{
		key: 'halfBreak',
		tab: 'app',
		title: 'settings.halfBreakTitle',
		hint: 'settings.halfBreakHint',
		section: 'settings.display'
	},
	{
		key: 'textScale',
		tab: 'app',
		title: 'settings.textScaleTitle',
		hint: 'settings.textScaleHint',
		section: 'settings.display'
	},
	{
		key: 'weekStart',
		tab: 'app',
		title: 'settings.weekStartTitle',
		hint: 'settings.weekStartHint',
		section: 'settings.display'
	},
	{
		key: 'celebrations',
		tab: 'app',
		title: 'settings.celebrationsTitle',
		hint: 'settings.celebrationsHint',
		section: 'settings.display'
	},
	{
		key: 'competitionColour',
		tab: 'app',
		title: 'settings.competitionColourTitle',
		hint: 'settings.competitionColourHint',
		section: 'settings.display'
	},
	{
		key: 'tapWindow',
		tab: 'shooting',
		title: 'settings.tapWindowTitle',
		hint: 'settings.tapWindowHint',
		section: 'settings.plotting'
	},
	{
		key: 'sheetHeight',
		tab: 'shooting',
		title: 'settings.sheetHeightTitle',
		hint: 'settings.sheetHeightHint',
		section: 'settings.plotting'
	},
	{
		key: 'badgeSide',
		tab: 'shooting',
		title: 'settings.badgeSideTitle',
		hint: 'settings.badgeSideHint',
		section: 'settings.plotting'
	},
	{
		key: 'awake',
		tab: 'shooting',
		title: 'settings.awakeTitle',
		hint: 'settings.awakeHint',
		section: 'settings.plotting'
	},
	{
		key: 'maxHeart',
		tab: 'shooting',
		title: 'settings.maxHeartTitle',
		hint: 'settings.maxHeartHint',
		section: 'settings.plotting'
	},
	{
		key: 'drift',
		tab: 'shooting',
		title: 'settings.driftTitle',
		hint: 'settings.driftHint',
		section: 'settings.plotting'
	},
	{
		key: 'haptics',
		tab: 'shooting',
		title: 'settings.hapticsTitle',
		hint: 'settings.hapticsHint',
		section: 'settings.plotting'
	},
	{
		key: 'location',
		tab: 'shooting',
		title: 'settings.locationTitle',
		hint: 'settings.locationHint',
		section: 'settings.conditions'
	},
	{
		key: 'weather',
		tab: 'shooting',
		title: 'settings.weatherTitle',
		hint: 'settings.weatherHint',
		section: 'settings.conditions'
	},
	{
		key: 'place',
		tab: 'shooting',
		title: 'settings.placeTitle',
		hint: 'settings.placeHint',
		section: 'settings.conditions'
	},
	{
		key: 'detector',
		tab: 'shooting',
		title: 'settings.detectorTitle',
		hint: 'settings.detectorHint',
		section: 'auto.title'
	},
	{
		key: 'smooth',
		tab: 'shooting',
		title: 'settings.smoothTitle',
		hint: 'settings.smoothHint',
		section: 'auto.title'
	},
	{
		key: 'record',
		tab: 'shooting',
		title: 'settings.recordTitle',
		hint: 'settings.recordHint',
		section: 'auto.title'
	},
	{
		key: 'motion',
		tab: 'shooting',
		title: 'settings.motionTitle',
		hint: 'settings.motionHint',
		section: 'auto.title'
	},
	{ key: 'storage', tab: 'data', title: 'settings.storage', section: 'settings.dataTab' },
	{ key: 'backup', tab: 'data', title: 'backup.title', hint: 'backup.hint', section: 'settings.dataTab' },
	{
		key: 'importer',
		tab: 'data',
		title: 'importer.title',
		hint: 'importer.hint',
		section: 'settings.dataTab'
	},
	{
		key: 'recalc',
		tab: 'data',
		title: 'settings.recalcTitle',
		hint: 'settings.recalcHint',
		section: 'settings.dataTab'
	},
	{
		key: 'forget',
		tab: 'data',
		title: 'settings.forgetTitle',
		hint: 'settings.forgetHint',
		section: 'settings.dataTab'
	},
	{ key: 'danger', tab: 'data', title: 'danger.title', section: 'settings.dataTab' }
];

/** Which tab a setting lives on, since being sent to one on another tab is being sent nowhere. */
export function settingsTabOf(key: string): SettingsTab | undefined {
	return SETTINGS.find((entry) => entry.key === key)?.tab;
}

/**
 * Matched on the app's one search rule, then ranked: a name match outranks a description match,
 * because somebody typing "weather" wants the weather switch rather than the settings that mention
 * weather in passing. Nothing at all until something is typed, since the page shows the whole list.
 */
export function searchSettings(
	query: string,
	translate: (key: string) => string,
	entries: SettingEntry[] = SETTINGS
): SettingEntry[] {
	const words = fold(query).split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];

	const scored: { entry: SettingEntry; rank: number }[] = [];
	for (const entry of entries) {
		const title = translate(entry.title);
		const hint = entry.hint ? translate(entry.hint) : '';
		if (!matchesQuery(query, [title, hint, translate(entry.section)])) continue;
		const folded = fold(title);
		const named = words.every((word) => folded.includes(word));
		scored.push({ entry, rank: named ? (folded.startsWith(words[0]) ? 0 : 1) : 2 });
	}
	return scored.sort((a, b) => a.rank - b.rank).map((row) => row.entry);
}
