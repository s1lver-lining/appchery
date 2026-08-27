import type { Watch } from './announce';

/**
 * What the background task needs to know, kept where a background task can read it.
 *
 * Everything the app owns lives in SQLite, which the service worker has no way into: it wakes up
 * without the app, without the database driver and without the archer's language. So the app leaves
 * a note for it in IndexedDB, written whenever what is followed changes, and the worker reads that
 * note and nothing else. Deliberately small: a list of competitions, what each was last announced
 * at, and the already translated words to say.
 */

const DATABASE = 'appchery-watch';
const STORE = 'state';
const KEY = 'ianseo';

export type WatchWords = { one: string; body: string; many: string; manyBody: string };

export type WatchState = {
	/** Whether the archer asked to be told at all. Nothing is fetched in the background while off. */
	enabled: boolean;
	watches: Watch[];
	words: WatchWords;
};

export const NOTHING_WATCHED: WatchState = {
	enabled: false,
	watches: [],
	words: { one: '', body: '', many: '', manyBody: '' }
};

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function readWatchState(): Promise<WatchState> {
	try {
		const database = await open();
		return await new Promise<WatchState>((resolve, reject) => {
			const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
			request.onsuccess = () => resolve((request.result as WatchState) ?? NOTHING_WATCHED);
			request.onerror = () => reject(request.error);
		});
	} catch {
		// A browser refusing storage is an archer who is not told, never an app that fails to open.
		return NOTHING_WATCHED;
	}
}

export async function writeWatchState(state: WatchState): Promise<void> {
	try {
		const database = await open();
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction(STORE, 'readwrite');
			transaction.objectStore(STORE).put(state, KEY);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
	} catch {
		// Nothing to be done about it here, and nothing worth breaking a page over.
	}
}
