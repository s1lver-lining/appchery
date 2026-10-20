/**
 * What the settings page holds, listed so it can be searched.
 *
 * Kept beside the page rather than read out of it: a setting is looked for by what it does, and the
 * markup of a switch says nothing about that. The key names both the anchor on its page and the
 * `?setting=` that scrolls to it, so a result found here leads straight to the control itself.
 */

import { fold, matchesQuery } from './domain/search';
import type { IconName } from './ui/Icon.svelte';

export type SettingsPage =
	| 'display'
	| 'language'
	| 'shooting'
	| 'running'
	| 'watch'
	| 'detector'
	| 'data'
	| 'app';

export interface SettingsPageInfo {
	key: SettingsPage;
	icon: IconName;
}

/** In the order the settings list them: most reached for first, what throws data away near the end. */
export const SETTINGS_PAGES: SettingsPageInfo[] = [
	{ key: 'display', icon: 'sun' },
	{ key: 'language', icon: 'calendar' },
	{ key: 'shooting', icon: 'target' },
	{ key: 'running', icon: 'run' },
	{ key: 'watch', icon: 'watch' },
	{ key: 'detector', icon: 'camera' },
	{ key: 'data', icon: 'download' },
	{ key: 'app', icon: 'refresh' },
];

/** Dictionary keys for a page's name and for the line under it naming what it holds. */
export const pageTitle = (page: SettingsPage) => `settings.pages.${page}.title`;
export const pageSummary = (page: SettingsPage) => `settings.pages.${page}.summary`;

export interface SettingEntry {
	/** Names the anchor, `setting-<key>`, and the `?setting=` that scrolls the page to it. */
	key: string;
	page: SettingsPage;
	/** Dictionary keys, so the search runs in whatever language the app is being read in. */
	title: string;
	hint?: string;
}

export const SETTINGS: SettingEntry[] = [
	{ key: 'theme', page: 'display', title: 'settings.theme' },
	{ key: 'textScale', page: 'display', title: 'settings.textScaleTitle', hint: 'settings.textScaleHint' },
	{ key: 'noAnimations', page: 'display', title: 'settings.noAnimationsTitle', hint: 'settings.noAnimationsHint' },
	{ key: 'fullscreen', page: 'display', title: 'settings.fullscreenTitle', hint: 'settings.fullscreenHint' },
	{ key: 'newButton', page: 'display', title: 'settings.newButtonTitle', hint: 'settings.newButtonHint' },
	{ key: 'feedHint', page: 'display', title: 'settings.feedHintTitle', hint: 'settings.feedHintHint' },
	{ key: 'celebrations', page: 'display', title: 'settings.celebrationsTitle', hint: 'settings.celebrationsHint' },
	{ key: 'competitionColour', page: 'display', title: 'settings.competitionColourTitle', hint: 'settings.competitionColourHint' },
	{ key: 'language', page: 'language', title: 'settings.language' },
	{ key: 'clock', page: 'language', title: 'settings.clockTitle', hint: 'settings.clockHint' },
	{ key: 'weekStart', page: 'language', title: 'settings.weekStartTitle', hint: 'settings.weekStartHint' },
	{ key: 'tapWindow', page: 'shooting', title: 'settings.tapWindowTitle', hint: 'settings.tapWindowHint' },
	{ key: 'sheetHeight', page: 'shooting', title: 'settings.sheetHeightTitle', hint: 'settings.sheetHeightHint' },
	{ key: 'badgeSide', page: 'shooting', title: 'settings.badgeSideTitle', hint: 'settings.badgeSideHint' },
	{ key: 'halfBreak', page: 'shooting', title: 'settings.halfBreakTitle', hint: 'settings.halfBreakHint' },
	{ key: 'awake', page: 'shooting', title: 'settings.awakeTitle', hint: 'settings.awakeHint' },
	{ key: 'drift', page: 'shooting', title: 'settings.driftTitle', hint: 'settings.driftHint' },
	{ key: 'haptics', page: 'shooting', title: 'settings.hapticsTitle', hint: 'settings.hapticsHint' },
	{ key: 'location', page: 'shooting', title: 'settings.locationTitle', hint: 'settings.locationHint' },
	{ key: 'weather', page: 'shooting', title: 'settings.weatherTitle', hint: 'settings.weatherHint' },
	{ key: 'place', page: 'shooting', title: 'settings.placeTitle', hint: 'settings.placeHint' },
	{ key: 'maxHeart', page: 'running', title: 'settings.maxHeartTitle', hint: 'settings.maxHeartHint' },
	{ key: 'autoPause', page: 'running', title: 'settings.autoPauseTitle', hint: 'settings.autoPauseHint' },
	{ key: 'runMaps', page: 'running', title: 'settings.runMapsTitle', hint: 'settings.runMapsHint' },
	{ key: 'runMapPrompt', page: 'running', title: 'settings.runMapPromptTitle', hint: 'settings.runMapPromptHint' },
	{ key: 'strava', page: 'running', title: 'strava.title', hint: 'strava.connectHint' },
	{ key: 'watch', page: 'watch', title: 'settings.watch', hint: 'settings.watchHint' },
	{ key: 'watchAlerts', page: 'watch', title: 'settings.watchAlerts', hint: 'settings.watchAlertsHint' },
	{ key: 'wristMotion', page: 'watch', title: 'settings.wristMotionTitle', hint: 'settings.wristMotionHint' },
	{ key: 'detector', page: 'detector', title: 'settings.detectorTitle', hint: 'settings.detectorHint' },
	{ key: 'smooth', page: 'detector', title: 'settings.smoothTitle', hint: 'settings.smoothHint' },
	{ key: 'record', page: 'detector', title: 'settings.recordTitle', hint: 'settings.recordHint' },
	{ key: 'motion', page: 'detector', title: 'settings.motionTitle', hint: 'settings.motionHint' },
	{ key: 'account', page: 'data', title: 'account.title', hint: 'account.hint' },
	{ key: 'storage', page: 'data', title: 'settings.storage' },
	{ key: 'backup', page: 'data', title: 'backup.title', hint: 'backup.hint' },
	{ key: 'importer', page: 'data', title: 'importer.title', hint: 'importer.hint' },
	{ key: 'recalc', page: 'data', title: 'settings.recalcTitle', hint: 'settings.recalcHint' },
	{ key: 'forget', page: 'data', title: 'settings.forgetTitle', hint: 'settings.forgetHint' },
	{ key: 'danger', page: 'data', title: 'danger.title' },
	{ key: 'refresh', page: 'app', title: 'settings.refreshTitle', hint: 'settings.refreshHint' },
	{ key: 'install', page: 'app', title: 'settings.installTitle', hint: 'settings.installHint' },
];

/** Where a setting lives, so a link to it opens the page that holds it. */
export function settingHref(key: string): string | undefined {
	const entry = SETTINGS.find((row) => row.key === key);
	return entry && `/settings/${entry.page}?setting=${key}`;
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
		if (!matchesQuery(query, [title, hint, translate(pageTitle(entry.page))])) continue;
		const folded = fold(title);
		const named = words.every((word) => folded.includes(word));
		scored.push({ entry, rank: named ? (folded.startsWith(words[0]) ? 0 : 1) : 2 });
	}
	return scored.sort((a, b) => a.rank - b.rank).map((row) => row.entry);
}
