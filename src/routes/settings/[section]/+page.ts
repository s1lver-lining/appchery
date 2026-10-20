import { error } from '@sveltejs/kit';
import { SETTINGS_PAGES, type SettingsPage } from '$lib/settings';

export function load({ params }) {
	const found = SETTINGS_PAGES.find((page) => page.key === params.section);
	if (!found) error(404);
	return { section: found.key as SettingsPage };
}
