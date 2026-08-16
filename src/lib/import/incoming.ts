import { writable } from 'svelte/store';

/** A file the system handed the app, waiting for the import page to pick it up. */
export const incomingFile = writable<File | null>(null);

/** Where the service worker leaves a file that arrived through the share sheet. */
export const SHARE_CACHE = 'appchery-shared';
export const SHARE_KEY = '/import/shared-file';

/** Files a share sheet or a file handler sends are not always named, and a name is what is shown. */
export function namedFile(data: Blob, name: string): File {
	return new File([data], name || 'export.xlsx', {
		type: data.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	});
}
