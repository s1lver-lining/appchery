import { writable } from 'svelte/store';

/**
 * Bumped when something rewrites the database wholesale: an import, a restore, a wipe. The pager
 * keeps the main pages mounted, so without this they go on showing what they read when they loaded,
 * and an archer who has just imported five years of shooting swipes over to an empty list.
 */
export const dataVersion = writable(0);

export function dataChanged() {
	dataVersion.update((n) => n + 1);
}
