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

/**
 * The shared file's name, on its way through a header and back.
 *
 * A header value carries bytes rather than text, so a name outside Latin-1 cannot be written to one
 * at all: the worker threw on `結果.xlsx` where it did not on `export.xlsx`, and it catches that
 * throw as a share it could not read. The file was dropped and the page said nothing had been handed
 * over, which is every alphabet the app already reads competitions in.
 */
export function encodeFilename(name: string): string {
	return encodeURIComponent(name);
}

export function decodeFilename(value: string): string {
	// A name parked by an older worker was written raw, and a raw name holding a per cent sign is not
	// valid encoding. Handed back as it stands rather than thrown away over its own punctuation.
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
